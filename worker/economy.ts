import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  careEarnings,
  catalogItem,
  catalogPrice,
  CATALOG,
  SINK_OWNER,
  SPARKLES_DAILY,
  sparklesDayKey,
  type CatalogItemId,
} from "../src/economy";
import {
  isSellableItem,
  listingExpiresAt,
  listingFeeBaseUnits,
  MARKET_ESCROW_ADDRESS,
  MARKET_PURCHASES_PAUSED_MESSAGE,
  MARKET_SINK_ADDRESS,
  MARKET_WRITES_DISABLED_MESSAGE,
  marketPayoutId,
  MARKET_MAX_FILLS_PER_UTC_DAY,
  MARKET_MAX_LIST_OPENS_PER_UTC_DAY,
  MARKET_MAX_OPEN_LISTINGS,
  formatMarketPriceBoing,
  marketWritesEnabled,
  parseMarketPriceBoing,
  publicMarketRules,
  sellerProceedsBaseUnits,
  stillInHold,
  utcDayStart,
  validateListQty,
  isImmediateSellback,
} from "../src/market";
import { hex32, type CareEvent } from "../src/core";
import { assertEscrowPayment, loadIncludedTransfer } from "./marketPay";
import {
  evaluateOperatorGasReserve,
  loadSellerPayouts,
  publicGasReserve,
  scheduleMarketPayouts,
  type WaitUntilFn,
} from "./marketPayouts";
import {
  balanceOf,
  pushLedgerCredit,
  pushLedgerDebit,
  type Currency,
} from "./ledger";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type EconomyKind =
  | "claim"
  | "buy_catalog"
  | "list"
  | "buy_listing"
  | "cancel_listing"
  | "sparkles_claim";

interface EconomyChallenge {
  id: string;
  owner: string;
  kind: EconomyKind;
  payload: string;
  message: string;
  expires_at: number;
}

async function claimedCare(env: Env, owner: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(delta),0) AS bal FROM ledger WHERE owner=? AND currency='boinglets' AND reason='care_claim'",
  )
    .bind(owner)
    .first<{ bal: number }>();
  return Number(row?.bal || 0);
}

async function inventoryQty(
  env: Env,
  owner: string,
  itemId: string,
): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT qty FROM inventory WHERE owner=? AND item_id=?",
  )
    .bind(owner, itemId)
    .first<{ qty: number }>();
  return Number(row?.qty || 0);
}

async function lastAcquisition(
  env: Env,
  owner: string,
  itemId: string,
): Promise<{ created_at: number; from_owner: string | null } | null> {
  return env.DB.prepare(
    "SELECT created_at, from_owner FROM inventory_acquisitions WHERE owner=? AND item_id=? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(owner, itemId)
    .first<{ created_at: number; from_owner: string | null }>();
}

async function recordAcquisition(
  statements: D1PreparedStatement[],
  env: Env,
  id: string,
  owner: string,
  itemId: string,
  qty: number,
  source: string,
  fromOwner: string | null,
  now: number,
) {
  statements.push(
    env.DB.prepare(
      "INSERT INTO inventory_acquisitions(id,owner,item_id,qty,source,from_owner,created_at) VALUES(?,?,?,?,?,?,?)",
    ).bind(id, owner, itemId, qty, source, fromOwner, now),
  );
}

async function expireOpenListings(env: Env, now: number) {
  const expired = await env.DB.prepare(
    "SELECT id,seller,item_id,qty FROM marketplace_listings WHERE status='open' AND expires_at IS NOT NULL AND expires_at<=?",
  )
    .bind(now)
    .all<{ id: string; seller: string; item_id: string; qty: number }>();
  if (!expired.results.length) return;
  const statements: D1PreparedStatement[] = [];
  for (const row of expired.results) {
    statements.push(
      env.DB.prepare(
        "UPDATE marketplace_listings SET status='expired', updated_at=? WHERE id=? AND status='open'",
      ).bind(now, row.id),
      env.DB.prepare(
        "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty",
      ).bind(row.seller, row.item_id, row.qty),
    );
  }
  await env.DB.batch(statements);
}

async function assertListable(
  env: Env,
  owner: string,
  itemId: string,
  qty: number,
  now: number,
) {
  if (!isSellableItem(itemId))
    throw new HttpError(400, "This item cannot be listed");
  if (!validateListQty(qty)) throw new HttpError(400, "Invalid quantity");
  const equipped = await env.DB.prepare(
    "SELECT slot FROM pet_cosmetics WHERE owner=? AND item_id=?",
  )
    .bind(owner, itemId)
    .first();
  if (equipped) throw new HttpError(409, "Unequip this item before listing it");
  const placed = await env.DB.prepare(
    "SELECT id FROM housing_placements WHERE owner=? AND item_id=?",
  )
    .bind(owner, itemId)
    .first();
  if (placed)
    throw new HttpError(
      409,
      "Pick this item up from your home plot before listing it",
    );
  const open = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM marketplace_listings WHERE seller=? AND status='open'",
  )
    .bind(owner)
    .first<{ n: number }>();
  if (Number(open?.n || 0) >= MARKET_MAX_OPEN_LISTINGS)
    throw new HttpError(409, "You already have 8 open listings");
  const opensToday = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM marketplace_listings WHERE seller=? AND created_at>=?",
  )
    .bind(owner, utcDayStart(now))
    .first<{ n: number }>();
  if (Number(opensToday?.n || 0) >= MARKET_MAX_LIST_OPENS_PER_UTC_DAY)
    throw new HttpError(429, "Listing velocity cap reached for today");
  const acquired = await lastAcquisition(env, owner, itemId);
  if (stillInHold(acquired?.created_at, now))
    throw new HttpError(409, "This item is still in its listing hold period");
  if ((await inventoryQty(env, owner, itemId)) < qty)
    throw new HttpError(409, "You do not own enough of that item");
}

async function rateLimit(env: Env, owner: string, now: number) {
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM economy_challenges WHERE owner=? AND created_at>?",
  )
    .bind(owner, now - 60_000)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 10)
    throw new HttpError(429, "Too many economy requests. Try again shortly.");
}

async function issueChallenge(
  env: Env,
  owner: string,
  kind: EconomyKind,
  payload: Record<string, unknown>,
  now: number,
) {
  await rateLimit(env, owner, now);
  await env.DB.prepare("DELETE FROM economy_challenges WHERE expires_at<?")
    .bind(now)
    .run();
  const id = crypto.randomUUID();
  const expires = now + 10 * 60_000;
  const body = JSON.stringify(payload);
  const message = `Boing Pets economy v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nKind: ${kind}\nPayload: ${body}\nNonce: ${id}\nExpires: ${expires}`;
  await env.DB.prepare(
    "INSERT INTO economy_challenges(id,owner,kind,payload,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(id, owner, kind, body, message, now, expires)
    .run();
  return { id, owner, kind, payload, message, expires_at: expires };
}

async function verifySignature(
  owner: string,
  message: string,
  signature: unknown,
) {
  if (typeof signature !== "string" || !/^(0x)?[0-9a-f]{128}$/i.test(signature))
    throw new HttpError(400, "Invalid signature format");
  const ok = await ed.verifyAsync(
    hexToBytes(signature.replace(/^0x/i, "")),
    blake3(new TextEncoder().encode(message)),
    hexToBytes(owner.slice(2)),
  );
  if (!ok)
    throw new HttpError(
      403,
      "Signature does not match this wallet and economy action",
    );
}

function assertMarketWrites(env: Env, kind: string) {
  if (kind !== "list" && kind !== "buy_listing") return;
  if (!marketWritesEnabled(env))
    throw new HttpError(503, MARKET_WRITES_DISABLED_MESSAGE);
}

async function assertPurchaseGasReserve(env: Env) {
  let reserve;
  try {
    reserve = await evaluateOperatorGasReserve(env);
  } catch {
    throw new HttpError(503, MARKET_PURCHASES_PAUSED_MESSAGE);
  }
  if (!reserve.ok) throw new HttpError(503, MARKET_PURCHASES_PAUSED_MESSAGE);
}

export async function economyGet(
  req: Request,
  env: Env,
  now: number,
  waitUntil?: WaitUntilFn,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname === "/api/economy/catalog") {
    return Response.json({
      catalog: CATALOG,
      listingFeeBps: 500,
      now,
    });
  }
  if (url.pathname === "/api/economy/balance") {
    const owner = hex32(url.searchParams.get("owner"));
    const events = await env.DB.prepare(
      "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
    )
      .bind(owner)
      .all<CareEvent>();
    const earned = careEarnings(events.results);
    const claimed = await claimedCare(env, owner);
    const boinglets = await balanceOf(env, owner, "boinglets");
    const sparkles = await balanceOf(env, owner, "sparkles");
    const dayKey = sparklesDayKey(now);
    const sparklesClaimedToday = await env.DB.prepare(
      "SELECT id FROM ledger WHERE owner=? AND currency='sparkles' AND reason='sparkles_claim' AND ref=?",
    )
      .bind(owner, dayKey)
      .first();
    const inventory = await env.DB.prepare(
      "SELECT item_id,qty FROM inventory WHERE owner=? AND qty>0",
    )
      .bind(owner)
      .all<{ item_id: string; qty: number }>();
    return Response.json({
      owner,
      balances: { boinglets, sparkles },
      care: { earned, claimed, claimable: Math.max(0, earned - claimed) },
      sparklesFaucet: {
        daily: SPARKLES_DAILY,
        day: dayKey,
        claimable: sparklesClaimedToday ? 0 : SPARKLES_DAILY,
      },
      inventory: inventory.results,
      now,
    });
  }
  if (url.pathname === "/api/marketplace") {
    await expireOpenListings(env, now);
    scheduleMarketPayouts(waitUntil, env, { now });
    const listings = await env.DB.prepare(
      "SELECT id,seller,item_id,qty,price_boinglets,price_boing,status,expires_at,created_at,updated_at FROM marketplace_listings WHERE status='open' ORDER BY created_at DESC LIMIT 48",
    ).all();
    const ownerParam = url.searchParams.get("owner");
    const payouts = ownerParam ? await loadSellerPayouts(env, ownerParam) : [];
    let gasReserve = {
      ok: false,
      surplusBoing: "unknown",
      requiredBoing: "unknown",
      pendingLegs: 0,
      floorBoing: publicMarketRules().gasReserveFloorBoing,
    };
    try {
      gasReserve = publicGasReserve(await evaluateOperatorGasReserve(env));
    } catch {
      // Fail closed in the public snapshot if the operator balance cannot be read.
    }
    return Response.json({
      listings: listings.results,
      payouts,
      rules: publicMarketRules(),
      writesEnabled: marketWritesEnabled(env),
      gasReserve,
      now,
    });
  }
  return null;
}

export async function economyPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
  waitUntil?: WaitUntilFn,
): Promise<Response | null> {
  if (url.pathname === "/api/economy/challenge") {
    const owner = hex32(body.owner);
    const kind = body.kind as EconomyKind;
    if (
      ![
        "claim",
        "buy_catalog",
        "list",
        "buy_listing",
        "cancel_listing",
        "sparkles_claim",
      ].includes(kind)
    )
      throw new HttpError(400, "Unknown economy action");

    if (kind === "sparkles_claim") {
      const dayKey = sparklesDayKey(now);
      const already = await env.DB.prepare(
        "SELECT id FROM ledger WHERE owner=? AND currency='sparkles' AND reason='sparkles_claim' AND ref=?",
      )
        .bind(owner, dayKey)
        .first();
      if (already)
        throw new HttpError(409, "Sparkles already claimed today (UTC)");
      return Response.json(
        await issueChallenge(
          env,
          owner,
          kind,
          { amount: SPARKLES_DAILY, day: dayKey },
          now,
        ),
      );
    }

    if (kind === "claim") {
      const events = await env.DB.prepare(
        "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
      )
        .bind(owner)
        .all<CareEvent>();
      const earned = careEarnings(events.results);
      const claimed = await claimedCare(env, owner);
      const amount = Math.max(0, earned - claimed);
      if (amount <= 0)
        throw new HttpError(409, "Nothing new to claim from care rewards");
      return Response.json(
        await issueChallenge(env, owner, kind, { amount }, now),
      );
    }

    if (kind === "buy_catalog") {
      const itemId = String(body.item_id || "");
      const item = catalogItem(itemId);
      if (!item) throw new HttpError(404, "Unknown catalog item");
      const priced = catalogPrice(item);
      const bal = await balanceOf(env, owner, priced.currency);
      if (bal < priced.amount) {
        throw new HttpError(
          409,
          priced.currency === "sparkles"
            ? "Not enough Sparkles. Claim the daily testnet faucet first."
            : "Not enough Boinglets. Claim care rewards first.",
        );
      }
      return Response.json(
        await issueChallenge(
          env,
          owner,
          kind,
          {
            item_id: item.id,
            price: priced.amount,
            currency: priced.currency,
          },
          now,
        ),
      );
    }

    if (kind === "list") {
      const itemId = String(body.item_id || "");
      const qty = Number(body.qty || 1);
      let priceBoing: string;
      try {
        priceBoing = parseMarketPriceBoing(
          String(body.price_boing ?? body.price ?? ""),
        ).toString();
      } catch (error) {
        throw new HttpError(
          400,
          error instanceof Error ? error.message : "Invalid price",
        );
      }
      assertMarketWrites(env, "list");
      await expireOpenListings(env, now);
      await assertListable(env, owner, itemId, qty, now);
      const price = BigInt(priceBoing);
      return Response.json(
        await issueChallenge(
          env,
          owner,
          kind,
          {
            item_id: itemId,
            qty,
            price_boing: priceBoing,
            fee_boing: listingFeeBaseUnits(price).toString(),
            proceeds_boing: sellerProceedsBaseUnits(price).toString(),
            expires_at: listingExpiresAt(now),
          },
          now,
        ),
      );
    }

    if (kind === "buy_listing") {
      const listingId = String(body.listing_id || "");
      assertMarketWrites(env, "buy_listing");
      await assertPurchaseGasReserve(env);
      await expireOpenListings(env, now);
      const listing = await env.DB.prepare(
        "SELECT * FROM marketplace_listings WHERE id=? AND status='open'",
      )
        .bind(listingId)
        .first<{
          id: string;
          seller: string;
          item_id: string;
          qty: number;
          price_boing: string | null;
        }>();
      if (!listing) throw new HttpError(404, "Listing not found");
      if (listing.seller === owner)
        throw new HttpError(409, "Cannot buy your own listing");
      if (!listing.price_boing)
        throw new HttpError(
          409,
          "This listing is priced in Boinglets and must be relisted in testnet BOING",
        );
      const fillsToday = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM market_payments WHERE buyer=? AND created_at>=?",
      )
        .bind(owner, utcDayStart(now))
        .first<{ n: number }>();
      if (Number(fillsToday?.n || 0) >= MARKET_MAX_FILLS_PER_UTC_DAY)
        throw new HttpError(429, "Purchase velocity cap reached for today");
      const acquired = await lastAcquisition(
        env,
        listing.seller,
        listing.item_id,
      );
      if (
        isImmediateSellback(
          acquired?.from_owner,
          owner,
          acquired?.created_at,
          now,
        )
      )
        throw new HttpError(
          409,
          "This would be an immediate sell-back to the previous seller",
        );
      const price = BigInt(listing.price_boing);
      const fee = listingFeeBaseUnits(price);
      const proceeds = sellerProceedsBaseUnits(price);
      const display = `Pay ${formatMarketPriceBoing(listing.price_boing)} testnet BOING to the Pets market escrow, then confirm this purchase.`;
      const issued = await issueChallenge(
        env,
        owner,
        kind,
        {
          listing_id: listing.id,
          seller: listing.seller,
          item_id: listing.item_id,
          qty: listing.qty,
          price_boing: listing.price_boing,
          fee_boing: fee.toString(),
          proceeds_boing: proceeds.toString(),
          escrow: MARKET_ESCROW_ADDRESS,
          payment: {
            type: "transfer",
            to: MARKET_ESCROW_ADDRESS,
            amount: listing.price_boing,
            display,
          },
        },
        now,
      );
      return Response.json({
        ...issued,
        transaction: {
          type: "transfer",
          from: owner,
          to: MARKET_ESCROW_ADDRESS,
          amount: listing.price_boing,
          priority_tip: "0",
          display,
        },
      });
    }

    if (kind === "cancel_listing") {
      const listingId = String(body.listing_id || "");
      const listing = await env.DB.prepare(
        "SELECT * FROM marketplace_listings WHERE id=? AND status='open'",
      )
        .bind(listingId)
        .first<{ id: string; seller: string }>();
      if (!listing) throw new HttpError(404, "Listing not found");
      if (listing.seller !== owner)
        throw new HttpError(403, "Only the seller can cancel");
      return Response.json(
        await issueChallenge(env, owner, kind, { listing_id: listing.id }, now),
      );
    }
  }

  if (url.pathname === "/api/economy/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid economy challenge");
    const c = await env.DB.prepare(
      "SELECT * FROM economy_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<EconomyChallenge>();
    if (!c) throw new HttpError(404, "Economy challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Economy challenge expired");
    await verifySignature(c.owner, c.message, body.signature);
    const payload = JSON.parse(c.payload) as Record<string, unknown>;
    const statements: D1PreparedStatement[] = [];

    if (c.kind === "sparkles_claim") {
      const dayKey = String(payload.day || "");
      const amount = Number(payload.amount);
      if (dayKey !== sparklesDayKey(now) || amount !== SPARKLES_DAILY)
        throw new HttpError(409, "Sparkles claim expired; retry");
      const already = await env.DB.prepare(
        "SELECT id FROM ledger WHERE owner=? AND currency='sparkles' AND reason='sparkles_claim' AND ref=?",
      )
        .bind(c.owner, dayKey)
        .first();
      if (already)
        throw new HttpError(409, "Sparkles already claimed today (UTC)");
      pushLedgerCredit(
        statements,
        env,
        c.id,
        c.owner,
        "sparkles",
        amount,
        "sparkles_claim",
        dayKey,
        now,
      );
    }

    if (c.kind === "claim") {
      const events = await env.DB.prepare(
        "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
      )
        .bind(c.owner)
        .all<CareEvent>();
      const earned = careEarnings(events.results);
      const claimed = await claimedCare(env, c.owner);
      const amount = Math.max(0, earned - claimed);
      if (amount <= 0 || amount !== Number(payload.amount))
        throw new HttpError(409, "Claim amount changed; start again");
      pushLedgerCredit(
        statements,
        env,
        c.id,
        c.owner,
        "boinglets",
        amount,
        "care_claim",
        null,
        now,
      );
    }

    if (c.kind === "buy_catalog") {
      const itemId = String(payload.item_id) as CatalogItemId;
      const price = Number(payload.price);
      const currency =
        payload.currency === "sparkles" ? "sparkles" : "boinglets";
      const item = catalogItem(itemId);
      const priced = item ? catalogPrice(item) : null;
      if (
        !item ||
        !priced ||
        priced.amount !== price ||
        priced.currency !== currency
      )
        throw new HttpError(409, "Catalog changed; retry");
      if ((await balanceOf(env, c.owner, currency)) < price)
        throw new HttpError(
          409,
          currency === "sparkles"
            ? "Not enough Sparkles"
            : "Not enough Boinglets",
        );
      pushLedgerDebit(
        statements,
        env,
        c.id,
        c.owner,
        currency as Currency,
        price,
        "catalog_buy",
        itemId,
        now,
      );
      pushLedgerCredit(
        statements,
        env,
        c.id + ":sink",
        SINK_OWNER,
        currency as Currency,
        price,
        "catalog_sink",
        itemId,
        now,
      );
      statements.push(
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
        ).bind(c.owner, itemId),
      );
      await recordAcquisition(
        statements,
        env,
        c.id + ":acq",
        c.owner,
        itemId,
        1,
        "catalog",
        null,
        now,
      );
    }

    if (c.kind === "list") {
      assertMarketWrites(env, "list");
      const itemId = String(payload.item_id);
      const qty = Number(payload.qty);
      const priceBoing = String(payload.price_boing || "");
      if (!/^\d+$/.test(priceBoing) || BigInt(priceBoing) <= 0n)
        throw new HttpError(400, "Invalid price");
      await assertListable(env, c.owner, itemId, qty, now);
      const expires = Number(payload.expires_at) || listingExpiresAt(now);
      statements.push(
        env.DB.prepare(
          "UPDATE inventory SET qty=qty-? WHERE owner=? AND item_id=? AND qty>=?",
        ).bind(qty, c.owner, itemId, qty),
        env.DB.prepare(
          "INSERT INTO marketplace_listings(id,seller,item_id,qty,price_boinglets,price_boing,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'open',?,?,?)",
        ).bind(c.id, c.owner, itemId, qty, null, priceBoing, expires, now, now),
      );
    }

    if (c.kind === "buy_listing") {
      const listingId = String(payload.listing_id);
      const listing = await env.DB.prepare(
        "SELECT * FROM marketplace_listings WHERE id=? AND status='open'",
      )
        .bind(listingId)
        .first<{
          id: string;
          seller: string;
          item_id: string;
          qty: number;
          price_boing: string | null;
        }>();
      if (!listing) throw new HttpError(409, "Listing was not available");
      if (listing.seller === c.owner)
        throw new HttpError(409, "Cannot buy your own listing");
      if (!listing.price_boing)
        throw new HttpError(
          409,
          "This listing is priced in Boinglets and must be relisted in testnet BOING",
        );
      const txHash = hex32(body.tx_hash);
      let transfer;
      try {
        const included = await loadIncludedTransfer(env, txHash);
        transfer = included.transfer;
        assertEscrowPayment({
          transfer,
          buyer: c.owner,
          escrow: MARKET_ESCROW_ADDRESS,
          priceBaseUnits: listing.price_boing,
        });
      } catch (error) {
        throw new HttpError(
          400,
          error instanceof Error ? error.message : "Invalid payment",
        );
      }
      const reused = await env.DB.prepare(
        "SELECT listing_id FROM market_payments WHERE tx_hash=?",
      )
        .bind(txHash)
        .first();
      if (reused) throw new HttpError(409, "This payment was already used");
      const price = BigInt(listing.price_boing);
      const fee = listingFeeBaseUnits(price);
      const proceeds = sellerProceedsBaseUnits(price);
      statements.push(
        env.DB.prepare(
          "UPDATE marketplace_listings SET status='sold', updated_at=? WHERE id=? AND status='open'",
        ).bind(now, listingId),
        env.DB.prepare(
          "INSERT INTO market_payments(tx_hash,listing_id,buyer,seller,price_boing,fee_boing,proceeds_boing,escrow,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        ).bind(
          txHash,
          listingId,
          c.owner,
          listing.seller,
          listing.price_boing,
          fee.toString(),
          proceeds.toString(),
          MARKET_ESCROW_ADDRESS,
          now,
        ),
        env.DB.prepare(
          "INSERT INTO market_payouts(id,payment_tx,listing_id,kind,recipient,amount_boing,status,payout_tx,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',NULL,?,?)",
        ).bind(
          marketPayoutId(txHash, "seller"),
          txHash,
          listingId,
          "seller",
          listing.seller,
          proceeds.toString(),
          now,
          now,
        ),
        env.DB.prepare(
          "INSERT INTO market_payouts(id,payment_tx,listing_id,kind,recipient,amount_boing,status,payout_tx,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',NULL,?,?)",
        ).bind(
          marketPayoutId(txHash, "sink"),
          txHash,
          listingId,
          "sink",
          MARKET_SINK_ADDRESS,
          fee.toString(),
          now,
          now,
        ),
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty",
        ).bind(c.owner, listing.item_id, listing.qty),
      );
      await recordAcquisition(
        statements,
        env,
        c.id + ":acq",
        c.owner,
        listing.item_id,
        listing.qty,
        "market",
        listing.seller,
        now,
      );
    }

    if (c.kind === "cancel_listing") {
      const listingId = String(payload.listing_id);
      const listing = await env.DB.prepare(
        "SELECT * FROM marketplace_listings WHERE id=? AND status='open' AND seller=?",
      )
        .bind(listingId, c.owner)
        .first<{ item_id: string; qty: number }>();
      if (!listing) throw new HttpError(409, "Listing already closed");
      statements.push(
        env.DB.prepare(
          "UPDATE marketplace_listings SET status='cancelled', updated_at=? WHERE id=? AND status='open'",
        ).bind(now, listingId),
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty",
        ).bind(c.owner, listing.item_id, listing.qty),
      );
    }

    try {
      await env.DB.batch(statements);
    } catch {
      throw new HttpError(
        409,
        "Economy action could not complete. Refresh and retry.",
      );
    }
    await env.DB.prepare("DELETE FROM economy_challenges WHERE id=?")
      .bind(c.id)
      .run();
    if (c.kind === "buy_listing") {
      const paid = hex32(body.tx_hash);
      scheduleMarketPayouts(waitUntil, env, { now, paymentTx: paid });
    }
    return Response.json({ ok: true });
  }

  return null;
}

export function economyError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  return null;
}
