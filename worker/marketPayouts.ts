/** Automatic native BOING payouts of market escrow to seller and sink. */

import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  buildTransferTransaction,
  signTransactionInput,
  transactionIdFromSignedTransactionHex,
} from "@boing-network/boing-sdk";
import { hex32 } from "../src/core";
import {
  MARKET_ESCROW_ADDRESS,
  MARKET_GAS_RESERVE_FLOOR_BOING,
  MARKET_SINK_ADDRESS,
  NATIVE_TRANSFER_FEE_BASE_UNITS,
  PAYOUT_LEGS_PER_FILL,
  canAdmitMarketPurchase,
  formatMarketPriceBoing,
  marketPayoutId,
  marketPayoutTxUrl,
  payoutSubmitBalanceRequired,
} from "../src/market";
import { bytesToHex, hex64 } from "../src/content/onchainItems";
import { rpc as rpcCall, RpcRejected } from "./rpc";
import { resolveIncludedReceipt } from "./proof";

const CHAIN_ID = 6913;
const RETRY_AFTER_MS = 15_000;
const ADMIN_RETRY_MAX_SKEW_MS = 10 * 60_000;

export type WaitUntilFn = (promise: Promise<unknown>) => void;

export type PayoutKind = "seller" | "sink";
export type PayoutStatus = "pending" | "sent" | "confirmed" | "failed";

export type MarketPayoutRow = {
  id: string;
  payment_tx: string;
  listing_id: string;
  kind: PayoutKind;
  recipient: string;
  amount_boing: string;
  status: PayoutStatus;
  payout_tx: string | null;
  signed_tx: string | null;
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

export type PublicPayout = {
  id: string;
  payment_tx: string;
  listing_id: string;
  kind: PayoutKind;
  recipient: string;
  amount_boing: string;
  status: PayoutStatus;
  payout_tx: string | null;
  tx_url: string | null;
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const adminCache = new Map<string, string>();

export async function operatorSigner(
  env: Env,
): Promise<{ secret: Uint8Array; admin: string } | null> {
  const keyRaw = env.MULTI_TOKEN_ADMIN_SECRET_KEY?.trim();
  if (!keyRaw) return null;
  let keyHex: string;
  try {
    keyHex = hex64(keyRaw);
  } catch {
    return null;
  }
  const secret = hexToBytes(keyHex);
  let admin = adminCache.get(keyHex);
  if (!admin) {
    admin = "0x" + bytesToHex(await ed.getPublicKeyAsync(secret));
    adminCache.set(keyHex, admin);
  }
  return { secret, admin };
}

async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  try {
    return await rpcCall<T>(env, method, params);
  } catch (error) {
    if (error instanceof RpcRejected) throw error;
    throw new Error("Testnet RPC is unavailable");
  }
}

function isAlreadyKnown(e: unknown) {
  if (!(e instanceof RpcRejected)) return false;
  const reason = (e.data as { reason?: string } | undefined)?.reason;
  return (
    reason === "already_in_mempool" ||
    /duplicate transaction|already/i.test(e.message)
  );
}

function isInsufficientBalance(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return /insufficient|not enough/i.test(msg);
}

export function publicPayout(row: MarketPayoutRow): PublicPayout {
  return {
    id: row.id,
    payment_tx: row.payment_tx,
    listing_id: row.listing_id,
    kind: row.kind,
    recipient: row.recipient,
    amount_boing: row.amount_boing,
    status: row.status,
    payout_tx: row.payout_tx,
    tx_url: marketPayoutTxUrl(row.payout_tx),
    attempts: row.attempts,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function loadSellerPayouts(
  env: Env,
  owner: string,
): Promise<PublicPayout[]> {
  const rows = await env.DB.prepare(
    "SELECT * FROM market_payouts WHERE recipient=? ORDER BY created_at DESC LIMIT 40",
  )
    .bind(hex32(owner))
    .all<MarketPayoutRow>();
  return rows.results.map(publicPayout);
}

async function recordAlert(
  env: Env,
  payout: MarketPayoutRow,
  code: string,
  message: string,
  now: number,
) {
  const recent = await env.DB.prepare(
    "SELECT id FROM market_payout_alerts WHERE payout_id=? AND code=? AND resolved_at IS NULL AND created_at>=?",
  )
    .bind(payout.id, code, now - 60 * 60_000)
    .first();
  if (recent) return;
  await env.DB.prepare(
    "INSERT INTO market_payout_alerts(id,payout_id,payment_tx,code,message,created_at,resolved_at) VALUES(?,?,?,?,?,?,NULL)",
  )
    .bind(
      crypto.randomUUID(),
      payout.id,
      payout.payment_tx,
      code,
      message.slice(0, 500),
      now,
    )
    .run();
}

async function resolveAlerts(env: Env, payoutId: string, now: number) {
  await env.DB.prepare(
    "UPDATE market_payout_alerts SET resolved_at=? WHERE payout_id=? AND resolved_at IS NULL",
  )
    .bind(now, payoutId)
    .run();
}

async function operatorBalance(env: Env, admin: string): Promise<bigint> {
  const acc = await rpc<{ balance?: string; nonce?: number | string }>(
    env,
    "boing_getAccount",
    [admin],
  );
  return BigInt(acc?.balance ?? "0");
}

async function operatorNonce(env: Env, admin: string): Promise<number> {
  const acc = await rpc<{ nonce?: number | string }>(env, "boing_getAccount", [
    admin,
  ]);
  const n = Number(acc?.nonce ?? 0);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("Invalid operator nonce");
  return n;
}

async function signNativeTransfer(input: {
  secret: Uint8Array;
  admin: string;
  to: string;
  amount: bigint;
  nonce: number;
}): Promise<{ signed: string; hash: string; nonce: number }> {
  const tx = buildTransferTransaction({
    nonce: BigInt(input.nonce),
    senderHex: input.admin,
    toHex: input.to,
    amount: input.amount,
    accessList: {
      read: [input.admin, input.to],
      write: [input.admin, input.to],
    },
  });
  const signed = await signTransactionInput(tx, input.secret, {
    chainId: BigInt(CHAIN_ID),
  });
  return {
    signed,
    hash: transactionIdFromSignedTransactionHex(signed).toLowerCase(),
    nonce: input.nonce,
  };
}

async function confirmOrResubmit(
  env: Env,
  row: MarketPayoutRow,
  signer: { admin: string },
  now: number,
): Promise<MarketPayoutRow> {
  if (!row.payout_tx || !row.signed_tx) return row;
  let receipt: { success?: boolean } | null = null;
  try {
    const resolved = await resolveIncludedReceipt(
      (method, params) => rpc(env, method, params),
      row.payout_tx,
    );
    receipt = resolved.receipt;
  } catch {
    return row;
  }
  if (receipt?.success === true) {
    await env.DB.prepare(
      "UPDATE market_payouts SET status='confirmed', last_error=NULL, updated_at=? WHERE id=? AND status='sent'",
    )
      .bind(now, row.id)
      .run();
    await resolveAlerts(env, row.id, now);
    return { ...row, status: "confirmed", last_error: null, updated_at: now };
  }
  if (receipt && receipt.success === false) {
    await env.DB.prepare(
      "UPDATE market_payouts SET status='failed', payout_tx=NULL, signed_tx=NULL, last_error=?, updated_at=? WHERE id=? AND status='sent'",
    )
      .bind("Payout transaction failed on-chain", now, row.id)
      .run();
    return {
      ...row,
      status: "failed",
      payout_tx: null,
      signed_tx: null,
      last_error: "Payout transaction failed on-chain",
      updated_at: now,
    };
  }
  try {
    const currentNonce = await operatorNonce(env, signer.admin);
    // receipt missing: if the account nonce has moved past this tx and it
    // never included, the signed slot is dead.
    // We cannot know the signed nonce directly; resubmit first, then if the
    // node rejects with a nonce error, mark failed so a later retry re-signs.
    await rpc(env, "boing_submitTransaction", [row.signed_tx]);
    if (now - row.updated_at >= RETRY_AFTER_MS) {
      await env.DB.prepare(
        "UPDATE market_payouts SET updated_at=?, attempts=attempts+1 WHERE id=? AND status='sent'",
      )
        .bind(now, row.id)
        .run();
    }
    void currentNonce;
  } catch (error) {
    if (isAlreadyKnown(error)) return row;
    if (isInsufficientBalance(error)) {
      await recordAlert(
        env,
        row,
        "insufficient-balance",
        "Operator does not have enough testnet BOING to complete this payout.",
        now,
      );
      await env.DB.prepare(
        "UPDATE market_payouts SET last_error=?, updated_at=? WHERE id=?",
      )
        .bind("insufficient-balance", now, row.id)
        .run();
      return { ...row, last_error: "insufficient-balance", updated_at: now };
    }
    const msg = error instanceof Error ? error.message : "submit failed";
    if (/nonce/i.test(msg)) {
      await env.DB.prepare(
        "UPDATE market_payouts SET status='failed', payout_tx=NULL, signed_tx=NULL, last_error=?, updated_at=? WHERE id=? AND status='sent'",
      )
        .bind(
          "Operator nonce moved; payout will be re-signed on retry",
          now,
          row.id,
        )
        .run();
      return {
        ...row,
        status: "failed",
        payout_tx: null,
        signed_tx: null,
        last_error: "Operator nonce moved; payout will be re-signed on retry",
        updated_at: now,
      };
    }
  }
  return row;
}

async function sendFreshPayout(
  env: Env,
  row: MarketPayoutRow,
  signer: { secret: Uint8Array; admin: string },
  now: number,
  force: boolean,
): Promise<MarketPayoutRow> {
  if (!force && now - row.updated_at < RETRY_AFTER_MS && row.attempts > 0) {
    return row;
  }
  const amount = BigInt(row.amount_boing);
  try {
    const bal = await operatorBalance(env, signer.admin);
    if (bal < payoutSubmitBalanceRequired(amount)) {
      const attempts = row.attempts + 1;
      await env.DB.prepare(
        "UPDATE market_payouts SET attempts=?, last_error=?, updated_at=? WHERE id=? AND status IN ('pending','failed')",
      )
        .bind(attempts, "insufficient-balance", now, row.id)
        .run();
      await recordAlert(
        env,
        row,
        "insufficient-balance",
        `Operator balance is below the ${row.kind} payout of ${row.amount_boing} base units plus the ${NATIVE_TRANSFER_FEE_BASE_UNITS.toString()} base-unit network fee.`,
        now,
      );
      return {
        ...row,
        attempts,
        last_error: "insufficient-balance",
        updated_at: now,
      };
    }
    const nonce = await operatorNonce(env, signer.admin);
    const signed = await signNativeTransfer({
      secret: signer.secret,
      admin: signer.admin,
      to: row.recipient,
      amount,
      nonce,
    });
    const claimed = await env.DB.prepare(
      `UPDATE market_payouts
       SET status='sent', payout_tx=?, signed_tx=?, attempts=attempts+1, last_error=NULL, updated_at=?
       WHERE id=? AND status IN ('pending','failed') AND payout_tx IS NULL`,
    )
      .bind(signed.hash, signed.signed, now, row.id)
      .run();
    const changed =
      Number((claimed as { meta?: { changes?: number } }).meta?.changes ?? 0) ||
      Number((claimed as { changes?: number }).changes ?? 0);
    // D1/SQLite adapters may not always expose changes. Re-read to confirm we own the hash.
    const owned = await env.DB.prepare(
      "SELECT * FROM market_payouts WHERE id=? AND payout_tx=?",
    )
      .bind(row.id, signed.hash)
      .first<MarketPayoutRow>();
    if (!owned) {
      void changed;
      return row;
    }
    try {
      await rpc(env, "boing_submitTransaction", [signed.signed]);
    } catch (error) {
      if (isAlreadyKnown(error)) return { ...owned, status: "sent" };
      if (isInsufficientBalance(error)) {
        await recordAlert(
          env,
          owned,
          "insufficient-balance",
          "Operator does not have enough testnet BOING to complete this payout.",
          now,
        );
        await env.DB.prepare(
          "UPDATE market_payouts SET status='pending', payout_tx=NULL, signed_tx=NULL, last_error=?, updated_at=? WHERE id=? AND payout_tx=?",
        )
          .bind("insufficient-balance", now, row.id, signed.hash)
          .run();
        return {
          ...owned,
          status: "pending",
          payout_tx: null,
          signed_tx: null,
          last_error: "insufficient-balance",
          updated_at: now,
        };
      }
      const msg = error instanceof Error ? error.message : "submit failed";
      await env.DB.prepare(
        "UPDATE market_payouts SET last_error=?, updated_at=? WHERE id=? AND payout_tx=?",
      )
        .bind(msg.slice(0, 500), now, row.id, signed.hash)
        .run();
    }
    return { ...owned, status: "sent", updated_at: now };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "payout failed";
    if (isInsufficientBalance(error)) {
      await recordAlert(
        env,
        row,
        "insufficient-balance",
        "Operator does not have enough testnet BOING to complete this payout.",
        now,
      );
    }
    await env.DB.prepare(
      "UPDATE market_payouts SET attempts=attempts+1, last_error=?, updated_at=? WHERE id=? AND status IN ('pending','failed')",
    )
      .bind(msg.slice(0, 500), now, row.id)
      .run();
    return { ...row, last_error: msg, updated_at: now };
  }
}

const SIGNER_LOCK_ID = "market-payout-signer-lock";
const SIGNER_LOCK_TTL_MS = 30_000;

async function acquirePayoutSignerLock(
  env: Env,
  now: number,
): Promise<boolean> {
  try {
    await env.DB.prepare(
      "INSERT INTO market_payout_alerts(id,payout_id,payment_tx,code,message,created_at,resolved_at) VALUES(?,?,?,?,?,?,NULL)",
    )
      .bind(SIGNER_LOCK_ID, "", "", "signer-lock", "processing", now)
      .run();
    return true;
  } catch {
    const stolen = await env.DB.prepare(
      `UPDATE market_payout_alerts
       SET created_at=?, resolved_at=NULL, message='processing'
       WHERE id=? AND (resolved_at IS NOT NULL OR created_at<=?)`,
    )
      .bind(now, SIGNER_LOCK_ID, now - SIGNER_LOCK_TTL_MS)
      .run();
    const changes =
      Number((stolen as { meta?: { changes?: number } }).meta?.changes ?? 0) ||
      Number((stolen as { changes?: number }).changes ?? 0);
    return changes > 0;
  }
}

async function releasePayoutSignerLock(env: Env, now: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE market_payout_alerts SET resolved_at=? WHERE id=? AND resolved_at IS NULL",
  )
    .bind(now, SIGNER_LOCK_ID)
    .run();
}

export async function loadPendingPayoutTotals(env: Env): Promise<{
  pendingLegs: number;
  pendingPayoutAmounts: bigint;
}> {
  const rows = await env.DB.prepare(
    "SELECT amount_boing FROM market_payouts WHERE status IN ('pending','sent','failed')",
  ).all<{ amount_boing: string }>();
  let pendingPayoutAmounts = 0n;
  for (const row of rows.results) {
    pendingPayoutAmounts += BigInt(row.amount_boing);
  }
  return { pendingLegs: rows.results.length, pendingPayoutAmounts };
}

export async function evaluateOperatorGasReserve(
  env: Env,
  extraLegs = PAYOUT_LEGS_PER_FILL,
): Promise<
  ReturnType<typeof canAdmitMarketPurchase> & {
    operatorBalance: bigint;
    surplusBoing: string;
    requiredBoing: string;
  }
> {
  const { pendingLegs, pendingPayoutAmounts } =
    await loadPendingPayoutTotals(env);
  const balance = await operatorBalance(env, MARKET_ESCROW_ADDRESS);
  const reserve = canAdmitMarketPurchase({
    operatorBalance: balance,
    pendingPayoutAmounts,
    pendingLegs,
    extraLegs,
  });
  return {
    ...reserve,
    operatorBalance: balance,
    surplusBoing: formatMarketPriceBoing(reserve.surplus),
    requiredBoing: formatMarketPriceBoing(reserve.required),
  };
}

export function publicGasReserve(
  reserve: Awaited<ReturnType<typeof evaluateOperatorGasReserve>>,
) {
  return {
    ok: reserve.ok,
    surplusBoing: reserve.surplusBoing,
    requiredBoing: reserve.requiredBoing,
    pendingLegs: reserve.pendingLegs,
    floorBoing: MARKET_GAS_RESERVE_FLOOR_BOING,
  };
}

export async function processMarketPayoutsWithSigner(
  env: Env,
  signer: { secret: Uint8Array; admin: string },
  opts: {
    now: number;
    paymentTx?: string;
    force?: boolean;
    limit?: number;
  },
): Promise<MarketPayoutRow[]> {
  const locked = await acquirePayoutSignerLock(env, opts.now);
  if (!locked) return [];
  try {
    return await processMarketPayoutsWithSignerLocked(env, signer, opts);
  } finally {
    await releasePayoutSignerLock(env, opts.now);
  }
}

async function processMarketPayoutsWithSignerLocked(
  env: Env,
  signer: { secret: Uint8Array; admin: string },
  opts: {
    now: number;
    paymentTx?: string;
    force?: boolean;
    limit?: number;
  },
): Promise<MarketPayoutRow[]> {
  const limit = opts.limit ?? 16;
  const rows = opts.paymentTx
    ? (
        await env.DB.prepare(
          "SELECT * FROM market_payouts WHERE payment_tx=? ORDER BY kind DESC",
        )
          .bind(hex32(opts.paymentTx))
          .all<MarketPayoutRow>()
      ).results
    : (
        await env.DB.prepare(
          `SELECT * FROM market_payouts
           WHERE status IN ('pending','sent','failed')
           ORDER BY created_at ASC
           LIMIT ?`,
        )
          .bind(limit)
          .all<MarketPayoutRow>()
      ).results;

  const out: MarketPayoutRow[] = [];
  for (const row of rows) {
    if (
      row.kind === "sink" &&
      hex32(row.recipient) !== hex32(MARKET_SINK_ADDRESS)
    ) {
      // Do not send a sink payout to a non-address legacy row.
      out.push(row);
      continue;
    }
    if (row.status === "confirmed") {
      out.push(row);
      continue;
    }
    if (row.status === "sent" && row.payout_tx && row.signed_tx) {
      out.push(await confirmOrResubmit(env, row, signer, opts.now));
      continue;
    }
    if (row.status === "pending" || row.status === "failed") {
      out.push(
        await sendFreshPayout(env, row, signer, opts.now, opts.force === true),
      );
    } else {
      out.push(row);
    }
  }
  return out;
}

export async function processMarketPayouts(
  env: Env,
  opts: {
    now: number;
    paymentTx?: string;
    force?: boolean;
    limit?: number;
  },
): Promise<MarketPayoutRow[]> {
  const signer = await operatorSigner(env);
  if (!signer) return [];
  if (hex32(signer.admin) !== hex32(MARKET_ESCROW_ADDRESS)) {
    // Refuse to sign payouts if the configured operator is not the escrow.
    return [];
  }
  return processMarketPayoutsWithSigner(env, signer, opts);
}

export function scheduleMarketPayouts(
  waitUntil: WaitUntilFn | undefined,
  env: Env,
  opts: { now: number; paymentTx?: string; force?: boolean },
) {
  const work = processMarketPayouts(env, opts).catch(() => undefined);
  if (waitUntil) waitUntil(work);
  return work;
}

async function verifyOperatorSignature(
  admin: string,
  message: string,
  signature: unknown,
) {
  if (typeof signature !== "string" || !/^(0x)?[0-9a-f]{128}$/i.test(signature))
    throw new HttpError(400, "Invalid signature format");
  const ok = await ed.verifyAsync(
    hexToBytes(signature.replace(/^0x/i, "")),
    blake3(new TextEncoder().encode(message)),
    hexToBytes(admin.slice(2)),
  );
  if (!ok)
    throw new HttpError(403, "Signature does not match the market operator");
}

export async function marketPayoutsGet(
  req: Request,
  env: Env,
  now: number,
  waitUntil?: WaitUntilFn,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/market/payouts") return null;
  const owner = hex32(url.searchParams.get("owner"));
  scheduleMarketPayouts(waitUntil, env, { now });
  const payouts = await loadSellerPayouts(env, owner);
  return Response.json({ owner, payouts, now });
}

export async function marketPayoutsPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
  waitUntil?: WaitUntilFn,
): Promise<Response | null> {
  if (url.pathname !== "/api/admin/market/payouts/retry") return null;
  const signer = await operatorSigner(env);
  if (!signer)
    throw new HttpError(503, "Market operator signing is not configured");
  const issuedAt = Number(body.issued_at);
  if (
    !Number.isFinite(issuedAt) ||
    Math.abs(now - issuedAt) > ADMIN_RETRY_MAX_SKEW_MS
  )
    throw new HttpError(400, "Retry authorization is expired or invalid");
  const message =
    body.message != null
      ? String(body.message)
      : `Boing Pets market payout retry v1\nOrigin: ${env.APP_ORIGIN}\nIssued: ${issuedAt}`;
  if (
    !message.includes("Boing Pets market payout retry v1") ||
    !message.includes(String(issuedAt))
  )
    throw new HttpError(400, "Retry authorization is expired or invalid");
  await verifyOperatorSignature(signer.admin, message, body.signature);
  const paymentTx =
    typeof body.payment_tx === "string" && body.payment_tx
      ? hex32(body.payment_tx)
      : undefined;
  const rows = await processMarketPayouts(env, {
    now,
    paymentTx,
    force: true,
  });
  waitUntil?.(Promise.resolve());
  return Response.json({
    ok: true,
    payouts: rows.map(publicPayout),
    now,
  });
}

export function marketPayoutsError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  return null;
}

export { marketPayoutId, MARKET_SINK_ADDRESS };
