import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  careEarnings,
  catalogItem,
  catalogPrice,
  CATALOG,
  listingFee,
  netSellerProceeds,
  SINK_OWNER,
  SPARKLES_DAILY,
  sparklesDayKey,
  type CatalogItemId,
} from "../src/economy";
import { hex32, type CareEvent } from "../src/core";
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

async function claimedCare(
  env: Env,
  owner: string,
): Promise<number> {
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
  if (
    typeof signature !== "string" ||
    !/^(0x)?[0-9a-f]{128}$/i.test(signature)
  )
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

export async function economyGet(
  req: Request,
  env: Env,
  now: number,
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
    const listings = await env.DB.prepare(
      "SELECT id,seller,item_id,qty,price_boinglets,status,created_at,updated_at FROM marketplace_listings WHERE status='open' ORDER BY created_at DESC LIMIT 48",
    ).all();
    return Response.json({ listings: listings.results, now });
  }
  return null;
}

export async function economyPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
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
      const price = Number(body.price_boinglets);
      if (!catalogItem(itemId)) throw new HttpError(404, "Unknown item");
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 20)
        throw new HttpError(400, "Invalid quantity");
      if (!Number.isSafeInteger(price) || price < 5 || price > 100_000)
        throw new HttpError(400, "Invalid price");
      if ((await inventoryQty(env, owner, itemId)) < qty)
        throw new HttpError(409, "You do not own enough of that item");
      return Response.json(
        await issueChallenge(
          env,
          owner,
          kind,
          { item_id: itemId, qty, price_boinglets: price },
          now,
        ),
      );
    }

    if (kind === "buy_listing") {
      const listingId = String(body.listing_id || "");
      const listing = await env.DB.prepare(
        "SELECT * FROM marketplace_listings WHERE id=? AND status='open'",
      )
        .bind(listingId)
        .first<{
          id: string;
          seller: string;
          item_id: string;
          qty: number;
          price_boinglets: number;
        }>();
      if (!listing) throw new HttpError(404, "Listing not found");
      if (listing.seller === owner)
        throw new HttpError(409, "Cannot buy your own listing");
      const bal = await balanceOf(env, owner, "boinglets");
      if (bal < listing.price_boinglets)
        throw new HttpError(409, "Not enough Boinglets");
      return Response.json(
        await issueChallenge(
          env,
          owner,
          kind,
          {
            listing_id: listing.id,
            price_boinglets: listing.price_boinglets,
            seller: listing.seller,
            item_id: listing.item_id,
            qty: listing.qty,
          },
          now,
        ),
      );
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
        await issueChallenge(
          env,
          owner,
          kind,
          { listing_id: listing.id },
          now,
        ),
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
    }

    if (c.kind === "list") {
      const itemId = String(payload.item_id);
      const qty = Number(payload.qty);
      const price = Number(payload.price_boinglets);
      if ((await inventoryQty(env, c.owner, itemId)) < qty)
        throw new HttpError(409, "You do not own enough of that item");
      statements.push(
        env.DB.prepare(
          "UPDATE inventory SET qty=qty-? WHERE owner=? AND item_id=? AND qty>=?",
        ).bind(qty, c.owner, itemId, qty),
        env.DB.prepare(
          "INSERT INTO marketplace_listings(id,seller,item_id,qty,price_boinglets,status,created_at,updated_at) VALUES(?,?,?,?,?,'open',?,?)",
        ).bind(c.id, c.owner, itemId, qty, price, now, now),
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
          price_boinglets: number;
        }>();
      if (!listing) throw new HttpError(409, "Listing was not available");
      if (listing.seller === c.owner)
        throw new HttpError(409, "Cannot buy your own listing");
      const price = listing.price_boinglets;
      if ((await balanceOf(env, c.owner, "boinglets")) < price)
        throw new HttpError(409, "Not enough Boinglets");
      const fee = listingFee(price);
      const proceeds = netSellerProceeds(price);
      statements.push(
        env.DB.prepare(
          "UPDATE marketplace_listings SET status='sold', updated_at=? WHERE id=? AND status='open'",
        ).bind(now, listingId),
      );
      pushLedgerDebit(
        statements,
        env,
        c.id + ":buy",
        c.owner,
        "boinglets",
        price,
        "market_buy",
        listingId,
        now,
      );
      pushLedgerCredit(
        statements,
        env,
        c.id + ":sell",
        listing.seller,
        "boinglets",
        proceeds,
        "market_sell",
        listingId,
        now,
      );
      pushLedgerCredit(
        statements,
        env,
        c.id + ":fee",
        SINK_OWNER,
        "boinglets",
        fee,
        "market_fee",
        listingId,
        now,
      );
      statements.push(
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty",
        ).bind(c.owner, listing.item_id, listing.qty),
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
    return Response.json({ ok: true });
  }

  return null;
}

export function economyError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  return null;
}
