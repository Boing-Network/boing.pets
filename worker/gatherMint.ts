/**
 * Vault mint. One queue row is one item id. `planOperatorDelivery` may
 * transfer operator stock and mint the shortfall; both legs share this row.
 * Inventory is debited only after operator config, the gas reserve, and a
 * sign plan succeed. A failed submit or receipt refunds the bank.
 * Receipts settle lazily. No cron.
 */

import {
  MARKET_GAS_BUDGET_PER_LEG_BASE_UNITS,
  marketGasReserveFloor,
} from "../src/market";
import {
  MINT_BATCH_MAX,
  parseMintClientKey,
  parseMintQty,
} from "../src/content/gathering";
import { onchainItemByGameId } from "../src/content/onchainItems";
import { HttpError } from "./social";
import {
  nextOperatorNonce,
  onchainConfig,
  planOperatorDelivery,
  submitOperatorTransaction,
} from "./onchainItems";
import { resolveIncludedReceipt } from "./proof";
import { rpc as rpcCall } from "./rpc";

const RESUBMIT_AFTER_MS = 60_000;

type MintRow = {
  id: string;
  client_key: string;
  owner: string;
  game_item_id: string;
  item_id: number;
  qty: number;
  contract: string | null;
  admin_nonce: number | null;
  signed_tx: string | null;
  tx_hash: string | null;
  status: string;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

type MintLeg = {
  kind: string;
  qty: number;
  nonce: number;
  signed: string;
  hash: string;
};

export type GatherMintView = {
  id: string;
  clientKey: string;
  itemId: string;
  qty: number;
  status: string;
  txHash: string | null;
  error: string | null;
};

function view(row: MintRow): GatherMintView {
  return {
    id: row.id,
    clientKey: row.client_key,
    itemId: row.game_item_id,
    qty: row.qty,
    status: row.status,
    txHash: row.tx_hash,
    error: row.last_error,
  };
}

function missingTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /no such table/i.test(message);
}

function asHttp(error: unknown, fallback: string, status = 502): HttpError {
  if (error instanceof HttpError) return error;
  const code = (error as { status?: unknown } | null)?.status;
  if (typeof code === "number") {
    const message =
      error instanceof Error && error.message ? error.message : fallback;
    return new HttpError(code, message);
  }
  return new HttpError(status, fallback);
}

function encodeLegs(legs: MintLeg[]): string {
  return JSON.stringify({ v: 1, legs });
}

function parseLegs(row: MintRow): MintLeg[] {
  const raw = (row.signed_tx || "").trim();
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { v?: number; legs?: MintLeg[] };
      if (parsed.v === 1 && parsed.legs?.length) return parsed.legs;
    } catch {
      /* fall through */
    }
  }
  if (row.signed_tx && row.tx_hash) {
    return [
      {
        kind: "mint",
        qty: row.qty,
        nonce: row.admin_nonce ?? 0,
        signed: row.signed_tx,
        hash: row.tx_hash,
      },
    ];
  }
  return [];
}

async function findByKey(
  env: Env,
  owner: string,
  clientKey: string,
): Promise<MintRow | null> {
  return env.DB.prepare(
    "SELECT * FROM gather_mint_queue WHERE owner=? AND client_key=?",
  )
    .bind(owner, clientKey)
    .first<MintRow>();
}

async function findById(env: Env, id: string): Promise<MintRow | null> {
  return env.DB.prepare("SELECT * FROM gather_mint_queue WHERE id=?")
    .bind(id)
    .first<MintRow>();
}

export async function loadMintableBank(
  env: Env,
  owner: string,
): Promise<Array<{ item_id: string; qty: number }>> {
  const rows = await env.DB.prepare(
    "SELECT item_id, qty FROM inventory WHERE owner=? AND qty>0 ORDER BY item_id",
  )
    .bind(owner)
    .all<{ item_id: string; qty: number }>();
  return (rows.results ?? []).filter((row) => onchainItemByGameId(row.item_id));
}

async function pendingLegs(env: Env): Promise<number> {
  let gatherN = 0;
  try {
    const gather = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM gather_mint_queue
       WHERE status IN ('queued','submitted')`,
    ).first<{ n: number }>();
    gatherN = Number(gather?.n || 0);
  } catch (error) {
    if (missingTable(error))
      throw new HttpError(503, "Mint storage is not ready.");
    throw error;
  }
  let extra = 0;
  try {
    const ops = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM operator_mint_queue
       WHERE status IN ('queued','signing','submitted')`,
    ).first<{ n: number }>();
    extra += Number(ops?.n || 0);
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  try {
    const withdrawals = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM onchain_withdrawals WHERE status='submitted'",
    ).first<{ n: number }>();
    extra += Number(withdrawals?.n || 0);
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  return gatherN + extra;
}

async function assertReserve(env: Env, admin: string) {
  let balance = 0n;
  try {
    const account = await rpcCall<{ balance?: string }>(
      env,
      "boing_getAccount",
      [admin],
    );
    balance = BigInt(account?.balance ?? "0");
  } catch {
    throw new HttpError(503, "Testnet RPC is unavailable. Nothing was minted.");
  }
  const legs = (await pendingLegs(env)) + 1;
  const required =
    BigInt(legs) * MARKET_GAS_BUDGET_PER_LEG_BASE_UNITS +
    marketGasReserveFloor();
  if (balance < required) {
    throw new HttpError(
      503,
      "Mint is paused until the operator has testnet BOING reserved for the mint fee.",
    );
  }
}

async function finishRow(
  env: Env,
  row: MintRow,
  now: number,
  delivered: number,
  reason: string,
) {
  const refundQty = Math.max(0, row.qty - delivered);
  const status = delivered > 0 && refundQty === 0 ? "minted" : "failed";
  const statements: D1PreparedStatement[] = [];
  if (delivered > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO item_mint_balance(owner,item_id,qty)
         SELECT ?,?,? WHERE EXISTS (
           SELECT 1 FROM gather_mint_queue WHERE id=? AND status IN ('queued','submitted')
         )
         ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty`,
      ).bind(row.owner, row.game_item_id, delivered, row.id),
    );
  }
  if (refundQty > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO inventory(owner,item_id,qty)
         SELECT ?,?,? WHERE EXISTS (
           SELECT 1 FROM gather_mint_queue WHERE id=? AND status IN ('queued','submitted')
         )
         ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty`,
      ).bind(row.owner, row.game_item_id, refundQty, row.id),
    );
  }
  statements.push(
    env.DB.prepare(
      `UPDATE gather_mint_queue
       SET status=?, last_error=?, updated_at=?
       WHERE id=? AND status IN ('queued','submitted')`,
    ).bind(
      status,
      status === "minted" ? null : reason.slice(0, 200),
      now,
      row.id,
    ),
  );
  await env.DB.batch(statements);
}

async function outcomesFor(
  env: Env,
  row: MintRow,
  chainNonce: number,
): Promise<Array<"ok" | "fail" | "pending" | "dropped"> | null> {
  const legs = parseLegs(row);
  if (!legs.length) return [];
  const outcomes: Array<"ok" | "fail" | "pending" | "dropped"> = [];
  for (const leg of legs) {
    let receipt: { success?: boolean } | null;
    try {
      const resolved = await resolveIncludedReceipt(
        (method, params) => rpcCall(env, method, params),
        leg.hash,
      );
      receipt = resolved.receipt;
    } catch {
      return null;
    }
    if (receipt?.success === true) outcomes.push("ok");
    else if (receipt) outcomes.push("fail");
    else if (chainNonce > leg.nonce) outcomes.push("dropped");
    else outcomes.push("pending");
  }
  return outcomes;
}

export async function settleGatherMints(
  env: Env,
  now: number,
  owner?: string,
): Promise<void> {
  let queued: { results?: MintRow[] };
  try {
    queued = owner
      ? await env.DB.prepare(
          `SELECT * FROM gather_mint_queue
           WHERE owner=? AND status IN ('queued','submitted')
           ORDER BY created_at LIMIT 8`,
        )
          .bind(owner)
          .all<MintRow>()
      : await env.DB.prepare(
          `SELECT * FROM gather_mint_queue
           WHERE status IN ('queued','submitted')
           ORDER BY created_at LIMIT 8`,
        ).all<MintRow>();
  } catch (error) {
    if (missingTable(error)) return;
    throw error;
  }
  const rows = queued.results ?? [];
  if (!rows.length) return;
  const cfg = await onchainConfig(env);
  if (!cfg) return;
  let chainNonce = 0;
  try {
    chainNonce = (await nextOperatorNonce(env, cfg)).chainNonce;
  } catch {
    return;
  }
  for (const row of rows) {
    const outcomes = await outcomesFor(env, row, chainNonce);
    if (!outcomes) continue;
    const legs = parseLegs(row);
    if (outcomes.length && outcomes.every((outcome) => outcome === "ok")) {
      await finishRow(env, row, now, row.qty, "");
      continue;
    }
    if (outcomes.some((outcome) => outcome === "pending") || !outcomes.length) {
      if (now - row.updated_at >= RESUBMIT_AFTER_MS && legs.length) {
        for (let i = 0; i < legs.length; i++) {
          if (outcomes[i] && outcomes[i] !== "pending") continue;
          try {
            await submitOperatorTransaction(env, legs[i]!.signed);
          } catch {
            /* still pending or already known */
          }
        }
        await env.DB.prepare(
          "UPDATE gather_mint_queue SET updated_at=?, attempts=attempts+1 WHERE id=? AND status IN ('queued','submitted')",
        )
          .bind(now, row.id)
          .run();
      }
      continue;
    }
    const delivered = legs.reduce(
      (sum, leg, index) => sum + (outcomes[index] === "ok" ? leg.qty : 0),
      0,
    );
    await finishRow(env, row, now, delivered, "mint_receipt_failed");
  }
}

function rawQty(value: unknown): number {
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return typeof value === "number" ? value : Number.NaN;
}

export async function queueGatherMint(
  env: Env,
  owner: string,
  body: Record<string, unknown>,
  now: number,
): Promise<GatherMintView> {
  let clientKey: string;
  try {
    clientKey = parseMintClientKey(body.client_key ?? body.clientKey);
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error
        ? error.message
        : "Mint request needs a client key",
    );
  }

  let existing: MintRow | null;
  try {
    existing = await findByKey(env, owner, clientKey);
  } catch (error) {
    if (missingTable(error))
      throw new HttpError(503, "Mint storage is not ready.");
    throw error;
  }
  if (existing) {
    await settleGatherMints(env, now, owner);
    const fresh = await findByKey(env, owner, clientKey);
    return view(fresh ?? existing);
  }

  const cfg = await onchainConfig(env);
  if (!cfg) throw new HttpError(503, "Mint operator is not configured.");

  const itemId = String(body.item_id ?? body.itemId ?? body.game_item_id ?? "");
  const mapped = onchainItemByGameId(itemId);
  if (!mapped) throw new HttpError(400, "This item cannot be minted.");

  const bankedRow = await env.DB.prepare(
    "SELECT qty FROM inventory WHERE owner=? AND item_id=?",
  )
    .bind(owner, itemId)
    .first<{ qty: number }>();
  let qty: number;
  try {
    qty = parseMintQty(rawQty(body.qty), Number(bankedRow?.qty || 0));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid mint";
    throw new HttpError(/not enough/i.test(message) ? 409 : 400, message);
  }
  if (qty > MINT_BATCH_MAX)
    throw new HttpError(400, "Mint amount is too large");

  await assertReserve(env, cfg.admin);

  let legs: MintLeg[];
  let chainNonce = 0;
  try {
    const nonce = await nextOperatorNonce(env, cfg);
    chainNonce = nonce.chainNonce;
    const planned = await planOperatorDelivery(
      env,
      cfg,
      nonce.startNonce,
      owner,
      mapped.itemId,
      qty,
    );
    legs = planned.map((leg) => ({
      kind: leg.kind,
      qty: leg.qty,
      nonce: leg.nonce,
      signed: leg.signed,
      hash: leg.hash,
    }));
  } catch (error) {
    throw asHttp(error, "The mint could not be planned. Nothing was minted.");
  }
  if (!legs.length) {
    throw new HttpError(
      500,
      "The mint produced no transaction. Nothing was minted.",
    );
  }
  const first = legs[0]!;
  if (first.nonce === chainNonce) {
    try {
      const sim = await rpcCall<{ success?: boolean; error?: string }>(
        env,
        "boing_simulateTransaction",
        [first.signed],
      );
      if (sim?.success !== true) {
        throw new HttpError(
          502,
          `The mint would fail (${sim?.error || "simulation failed"}). Nothing was minted.`,
        );
      }
    } catch (error) {
      throw asHttp(
        error,
        "The mint could not be simulated. Nothing was minted.",
      );
    }
  }

  const id = crypto.randomUUID();
  const last = legs[legs.length - 1]!;
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO gather_mint_queue(
           id, client_key, owner, game_item_id, item_id, qty,
           contract, admin_nonce, signed_tx, tx_hash,
           status, attempts, last_error, created_at, updated_at
         )
         SELECT ?,?,?,?,?,?,?,?,?,?,'queued',0,NULL,?,?
         WHERE EXISTS (
           SELECT 1 FROM inventory WHERE owner=? AND item_id=? AND qty>=?
         )`,
      ).bind(
        id,
        clientKey,
        owner,
        mapped.gameItemId,
        mapped.itemId,
        qty,
        cfg.contract,
        last.nonce,
        encodeLegs(legs),
        first.hash,
        now,
        now,
        owner,
        mapped.gameItemId,
        qty,
      ),
      env.DB.prepare(
        `UPDATE inventory SET qty=qty-?
         WHERE owner=? AND item_id=? AND qty>=?
         AND EXISTS (SELECT 1 FROM gather_mint_queue WHERE id=?)`,
      ).bind(qty, owner, mapped.gameItemId, qty, id),
    ]);
  } catch (error) {
    if (missingTable(error))
      throw new HttpError(503, "Mint storage is not ready.");
    const raced = await findByKey(env, owner, clientKey);
    if (raced) return view(raced);
    throw new HttpError(409, "Mint could not be queued.");
  }

  const queued = await findById(env, id);
  if (!queued) throw new HttpError(409, "Not enough banked of that item.");

  try {
    for (const leg of legs) await submitOperatorTransaction(env, leg.signed);
  } catch {
    await finishRow(env, queued, now, 0, "mint_submit_failed");
    throw new HttpError(
      502,
      "Mint did not submit. The banked stack was returned.",
    );
  }
  await env.DB.prepare(
    `UPDATE gather_mint_queue
     SET status='submitted', attempts=attempts+1, updated_at=?
     WHERE id=? AND status='queued'`,
  )
    .bind(now, id)
    .run();
  await settleGatherMints(env, now, owner);
  const done = await findById(env, id);
  return view(done ?? { ...queued, status: "submitted" });
}
