/**
 * Withdraw mined resources from the off-chain inventory into a Boing reference multi-token
 * v1 contract (shared item types). Feature-flagged: every route answers "disabled" unless
 * MULTI_TOKEN_CONTRACT and the MULTI_TOKEN_ADMIN_SECRET_KEY secret are both configured.
 *
 * Withdraw flow: challenge (player signs the exact item + qty) -> confirm: the operator
 * reuses its on-chain balance of that item when it can (a transfer to the player), and
 * mints only the shortfall. The first leg is simulated when it is next in line, the
 * inventory debit and the signed tx(s) are written atomically, then the tx(s) are
 * submitted. Pending withdrawals are re-checked on read: a failed receipt, or the
 * operator nonce moving past a leg without a receipt, refunds only the undelivered
 * quantity exactly once.
 *
 * Deposit flow: the player signs `transfer(operator, item, qty)` in Express and submits
 * it themselves (v1 has no burn). `POST /api/items/deposit/confirm` verifies the included
 * receipt and credits inventory exactly once per tx hash.
 */
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  buildContractCallTransaction,
  signTransactionInput,
  transactionIdFromSignedTransactionHex,
} from "@boing-network/boing-sdk";
import { decodeMultiTokenTransferLog } from "@boing-network/boing-sdk";
import {
  MT_ADMIN_STORAGE_KEY,
  ONCHAIN_ITEMS,
  ONCHAIN_WITHDRAW_MAX_QTY,
  bytesToHex,
  hex64,
  mtBalanceStorageKey,
  mtMintCalldata,
  mtTransferCalldata,
  onchainItemByGameId,
  onchainItemByItemId,
  storageWordHex,
  storageWordQty,
} from "../src/content/onchainItems";
import { hex32 } from "../src/core";
import { mapPool, rpc as rpcCall, RpcRejected } from "./rpc";
import { resolveIncludedReceipt } from "./proof";

const CHAIN_ID = 6913;
/** Resubmit unresolved signed withdrawal txs at most this often. */
const RESUBMIT_AFTER_MS = 60_000;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Config {
  contract: string;
  secret: Uint8Array;
  admin: string;
}

interface WithdrawalRow {
  id: string;
  owner: string;
  game_item_id: string;
  item_id: number;
  qty: number;
  contract: string;
  admin_nonce: number;
  signed_tx: string;
  tx_hash: string;
  status: "submitted" | "minted" | "refunded";
  error: string | null;
  created_at: number;
  updated_at: number;
}

const adminCache = new Map<string, string>();

/** Parsed config, or null when the feature is off (missing or malformed settings). */
export async function onchainConfig(env: Env): Promise<Config | null> {
  const contractRaw = env.MULTI_TOKEN_CONTRACT?.trim();
  const keyRaw = env.MULTI_TOKEN_ADMIN_SECRET_KEY?.trim();
  if (!contractRaw || !keyRaw) return null;
  let contract: string, keyHex: string;
  try {
    contract = "0x" + hex64(contractRaw);
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
  return { contract, secret, admin };
}

async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  try {
    return await rpcCall<T>(env, method, params);
  } catch (error) {
    if (error instanceof RpcRejected) throw error;
    throw new HttpError(503, "Testnet RPC is unavailable. Retry later.");
  }
}

async function onchainBalance(
  env: Env,
  cfg: Config,
  owner: string,
  itemId: number,
) {
  return storageWordQty(
    await rpc<unknown>(env, "boing_getContractStorage", [
      cfg.contract,
      mtBalanceStorageKey(owner, itemId),
    ]),
  );
}

async function adminNonce(env: Env, admin: string): Promise<number> {
  const acc = await rpc<{ nonce?: number | string }>(env, "boing_getAccount", [
    admin,
  ]);
  const n = Number(acc?.nonce ?? 0);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new HttpError(503, "Invalid operator nonce");
  return n;
}

type WithdrawLegKind = "transfer" | "mint";

interface WithdrawLeg {
  kind: WithdrawLegKind;
  qty: number;
  nonce: number;
  signed: string;
  hash: string;
}

interface WithdrawLegsPayload {
  v: 1;
  legs: WithdrawLeg[];
}

/** New rows store one or two signed legs as JSON. Legacy rows are a raw signed mint hex. */
function parseLegs(w: WithdrawalRow): WithdrawLeg[] {
  const raw = (w.signed_tx || "").trim();
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as WithdrawLegsPayload;
      if (
        parsed?.v === 1 &&
        Array.isArray(parsed.legs) &&
        parsed.legs.length > 0
      )
        return parsed.legs;
    } catch {
      /* Fall through to the legacy single-mint encoding. */
    }
  }
  return [
    {
      kind: "mint",
      qty: w.qty,
      nonce: w.admin_nonce,
      signed: w.signed_tx,
      hash: w.tx_hash,
    },
  ];
}

function encodeLegs(legs: WithdrawLeg[]): string {
  const payload: WithdrawLegsPayload = { v: 1, legs };
  return JSON.stringify(payload);
}

async function signOperatorCall(
  cfg: Config,
  nonce: number,
  to: string,
  calldata: Uint8Array,
) {
  const tx = buildContractCallTransaction({
    nonce: BigInt(nonce),
    senderHex: cfg.admin,
    contractHex: cfg.contract,
    calldata,
    accessList: {
      read: [cfg.admin, cfg.contract, to],
      write: [cfg.admin, cfg.contract, to],
    },
  });
  const signed = await signTransactionInput(tx, cfg.secret, {
    chainId: BigInt(CHAIN_ID),
  });
  return {
    signed,
    hash: transactionIdFromSignedTransactionHex(signed).toLowerCase(),
  };
}

async function signMint(
  cfg: Config,
  nonce: number,
  to: string,
  itemId: number,
  qty: number,
) {
  return signOperatorCall(cfg, nonce, to, mtMintCalldata(to, itemId, qty));
}

async function signTransfer(
  cfg: Config,
  nonce: number,
  to: string,
  itemId: number,
  qty: number,
) {
  return signOperatorCall(cfg, nonce, to, mtTransferCalldata(to, itemId, qty));
}

/** Transfer the operator's existing balance first; mint only the shortfall. */
async function planWithdrawLegs(
  env: Env,
  cfg: Config,
  startNonce: number,
  to: string,
  itemId: number,
  qty: number,
): Promise<WithdrawLeg[]> {
  const operatorBal = await onchainBalance(env, cfg, cfg.admin, itemId);
  const transferQty = Math.min(Math.max(0, operatorBal), qty);
  const mintQty = qty - transferQty;
  const legs: WithdrawLeg[] = [];
  let nonce = startNonce;
  if (transferQty > 0) {
    const signed = await signTransfer(cfg, nonce, to, itemId, transferQty);
    legs.push({ kind: "transfer", qty: transferQty, nonce, ...signed });
    nonce += 1;
  }
  if (mintQty > 0) {
    const signed = await signMint(cfg, nonce, to, itemId, mintQty);
    legs.push({ kind: "mint", qty: mintQty, nonce, ...signed });
  }
  if (legs.length === 0)
    throw new HttpError(500, "Withdrawal produced no transactions");
  return legs;
}

function isAlreadyKnown(e: unknown) {
  if (!(e instanceof RpcRejected)) return false;
  const reason = (e.data as { reason?: string } | undefined)?.reason;
  return (
    reason === "already_in_mempool" ||
    /duplicate transaction|already/i.test(e.message)
  );
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
  if (!ok) throw new HttpError(403, "Signature does not match");
}

function refundStatements(
  env: Env,
  w: WithdrawalRow,
  reason: string,
  now: number,
  refundQty = w.qty,
  status: "refunded" | "minted" = "refunded",
) {
  // Credit first, guarded on the row still being in flight, then close the row: exactly-once.
  return [
    env.DB.prepare(
      `INSERT INTO inventory(owner,item_id,qty)
       SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM onchain_withdrawals WHERE id=? AND status='submitted')
       ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty`,
    ).bind(w.owner, w.game_item_id, refundQty, w.id),
    env.DB.prepare(
      "UPDATE onchain_withdrawals SET status=?, error=?, updated_at=? WHERE id=? AND status='submitted'",
    ).bind(status, reason.slice(0, 200), now, w.id),
  ];
}

type LegOutcome = "ok" | "fail" | "dropped" | "pending";

/** Resolve one in-flight withdrawal against the chain. Never throws on RPC trouble. */
async function settle(
  env: Env,
  cfg: Config,
  w: WithdrawalRow,
  now: number,
): Promise<void> {
  if (w.status !== "submitted") return;
  try {
    // Nonce before receipts: if the nonce has moved past a leg and there is still no
    // receipt, that slot went to another tx and the leg can never land.
    const operatorNonce = await adminNonce(env, cfg.admin);
    const legs = parseLegs(w);
    const outcomes: LegOutcome[] = [];
    for (const leg of legs) {
      let receipt: { success?: boolean; error?: string | null } | null;
      try {
        const resolved = await resolveIncludedReceipt(
          (method, params) => rpc(env, method, params),
          leg.hash,
        );
        receipt = resolved.receipt;
      } catch {
        // Receipt RPC failed after the nonce read; do not guess at drops.
        return;
      }
      if (receipt) {
        outcomes.push(receipt.success === true ? "ok" : "fail");
      } else if (operatorNonce > leg.nonce) {
        outcomes.push("dropped");
      } else {
        outcomes.push("pending");
      }
    }

    if (outcomes.every((outcome) => outcome === "ok")) {
      await env.DB.prepare(
        "UPDATE onchain_withdrawals SET status='minted', error=NULL, updated_at=? WHERE id=? AND status='submitted'",
      )
        .bind(now, w.id)
        .run();
      return;
    }

    if (outcomes.some((outcome) => outcome === "pending")) {
      if (now - w.updated_at >= RESUBMIT_AFTER_MS) {
        for (let i = 0; i < legs.length; i++) {
          if (outcomes[i] !== "pending") continue;
          try {
            await rpc(env, "boing_submitTransaction", [legs[i]!.signed]);
          } catch {
            /* still pending or already known */
          }
        }
        await env.DB.prepare(
          "UPDATE onchain_withdrawals SET updated_at=? WHERE id=? AND status='submitted'",
        )
          .bind(now, w.id)
          .run();
      }
      return;
    }

    const delivered = legs.reduce(
      (sum, leg, i) => sum + (outcomes[i] === "ok" ? leg.qty : 0),
      0,
    );
    const refundQty = Math.max(0, w.qty - delivered);
    const failed = legs
      .filter((_, i) => outcomes[i] !== "ok")
      .map((leg) => `${leg.kind} of ${leg.qty}`)
      .join(" and ");
    if (refundQty <= 0) {
      await env.DB.prepare(
        "UPDATE onchain_withdrawals SET status='minted', error=NULL, updated_at=? WHERE id=? AND status='submitted'",
      )
        .bind(now, w.id)
        .run();
      return;
    }
    const status = delivered > 0 ? "minted" : "refunded";
    const reason =
      delivered > 0
        ? `On-chain ${failed} did not land; ${refundQty} returned to inventory.`
        : failed.includes("fail")
          ? "The withdrawal did not land (transaction failed)"
          : "The withdrawal did not land (dropped by the network)";
    await env.DB.batch(
      refundStatements(env, w, reason, now, refundQty, status),
    );
  } catch {
    /* RPC unavailable: try again on the next read */
  }
}

function view(w: WithdrawalRow) {
  const legs = parseLegs(w);
  return {
    id: w.id,
    game_item_id: w.game_item_id,
    item_id: w.item_id,
    qty: w.qty,
    status: w.status,
    tx_hash: w.tx_hash,
    tx_hashes: legs.map((leg) => leg.hash),
    error: w.error,
    created_at: w.created_at,
  };
}

const disabled = () =>
  Response.json({
    enabled: false,
    reason: "On-chain items are not configured on this deployment.",
    items: ONCHAIN_ITEMS,
  });

interface DepositRow {
  tx_hash: string;
  owner: string;
  game_item_id: string;
  item_id: number;
  qty: number;
  contract: string;
  created_at: number;
}

function depositView(d: DepositRow) {
  return {
    tx_hash: d.tx_hash,
    game_item_id: d.game_item_id,
    item_id: d.item_id,
    qty: d.qty,
    status: "credited" as const,
    created_at: d.created_at,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function contractCallFromTx(tx: unknown): { sender: string; contract: string } {
  const rec = asRecord(tx);
  if (!rec) throw new HttpError(400, "Malformed transaction in the block");
  const sender = hex32(String(rec.sender ?? ""));
  const payload = asRecord(rec.payload);
  const call = asRecord(payload?.ContractCall ?? payload?.contract_call);
  if (!call?.contract)
    throw new HttpError(
      400,
      "Transaction does not call the Pets item contract",
    );
  return { sender, contract: "0x" + hex64(String(call.contract)) };
}

function qualifyingDepositTransfer(
  logs: unknown,
  owner: string,
  operator: string,
): { def: NonNullable<ReturnType<typeof onchainItemByItemId>>; qty: number } {
  if (!Array.isArray(logs))
    throw new HttpError(400, "Transaction receipt is missing logs");
  const hits: Array<{
    def: NonNullable<ReturnType<typeof onchainItemByItemId>>;
    qty: number;
  }> = [];
  for (const raw of logs) {
    const log = asRecord(raw);
    if (!log || !Array.isArray(log.topics) || log.data == null) continue;
    const decoded = decodeMultiTokenTransferLog({
      topics: log.topics.map((topic) => String(topic)),
      data: String(log.data),
    });
    if (!decoded || decoded.isMint) continue;
    if (hex32(decoded.from) !== owner) continue;
    if (hex32(decoded.to) !== operator) continue;
    const itemId = Number(decoded.itemId);
    const qty = Number(decoded.amount);
    const def = onchainItemByItemId(itemId);
    if (!def) continue;
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > ONCHAIN_WITHDRAW_MAX_QTY)
      throw new HttpError(
        400,
        `Deposit quantity must be 1..${ONCHAIN_WITHDRAW_MAX_QTY}`,
      );
    hits.push({ def, qty });
  }
  if (hits.length === 0)
    throw new HttpError(
      400,
      "Expected a transfer of a mapped item to the Pets operator",
    );
  if (hits.length > 1)
    throw new HttpError(
      400,
      "Deposit transactions must transfer a single item type",
    );
  return hits[0]!;
}

async function fetchIncludedTx(
  env: Env,
  txHash: string,
): Promise<{
  receipt: {
    success?: boolean;
    error?: string | null;
    block_height?: number;
    tx_index?: number;
    tx_id?: string;
    logs?: unknown;
  };
  tx: { sender: string; contract: string };
}> {
  const { receipt, block } = await resolveIncludedReceipt(
    (method, params) => rpc(env, method, params),
    txHash,
  );
  if (!receipt) {
    throw new HttpError(
      425,
      "Transaction is not included yet. Wait and retry confirmation.",
    );
  }
  if (
    receipt.success !== true ||
    hex32(String(receipt.tx_id ?? txHash)) !== txHash
  )
    throw new HttpError(
      400,
      receipt.error
        ? `Transaction failed (${receipt.error})`
        : "Transaction failed or receipt does not match",
    );
  const height = Number(receipt.block_height);
  const index = Number(receipt.tx_index);
  if (
    !Number.isSafeInteger(height) ||
    height < 0 ||
    !Number.isSafeInteger(index) ||
    index < 0
  )
    throw new HttpError(400, "Transaction receipt is missing a block position");
  if (!block || Number(block.header?.height) !== height)
    throw new HttpError(400, "Block is unavailable");
  const rawTx = block.transactions?.[index];
  if (!rawTx) throw new HttpError(400, "Transaction is missing from its block");
  return { receipt, tx: contractCallFromTx(rawTx) };
}

async function prepareDeposit(
  env: Env,
  cfg: Config,
  body: Record<string, unknown>,
) {
  const owner = hex32(body.owner);
  const def =
    typeof body.game_item_id === "string"
      ? onchainItemByGameId(body.game_item_id)
      : undefined;
  if (!def) throw new HttpError(400, "This item cannot be deposited on-chain");
  const qty = Number(body.qty);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > ONCHAIN_WITHDRAW_MAX_QTY)
    throw new HttpError(400, `Quantity must be 1..${ONCHAIN_WITHDRAW_MAX_QTY}`);
  const calldata =
    "0x" + bytesToHex(mtTransferCalldata(cfg.admin, def.itemId, qty));
  return Response.json({
    owner,
    game_item_id: def.gameItemId,
    item_id: def.itemId,
    qty,
    operator: cfg.admin,
    contract: cfg.contract,
    transaction: {
      type: "contract_call",
      contract: cfg.contract,
      calldata,
      access_list: {
        read: [owner, cfg.admin, cfg.contract],
        write: [owner, cfg.admin, cfg.contract],
      },
      display: `Deposit ${qty} ${def.name} from your wallet back into Boing Pets.`,
    },
  });
}

async function confirmDeposit(
  env: Env,
  cfg: Config,
  body: Record<string, unknown>,
  now: number,
) {
  const owner = hex32(body.owner);
  const txHash = hex32(body.tx_hash);
  await env.DB.prepare(
    "DELETE FROM onchain_deposit_attempts WHERE created_at<?",
  )
    .bind(now - 60 * 60_000)
    .run();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM onchain_deposit_attempts WHERE owner=? AND created_at>?",
  )
    .bind(owner, now - 60_000)
    .first<{ n: number }>();
  if ((recent?.n || 0) >= 5)
    throw new HttpError(429, "Too many deposits. Try again shortly.");
  await env.DB.prepare(
    "INSERT INTO onchain_deposit_attempts(id,owner,tx_hash,created_at) VALUES(?,?,?,?)",
  )
    .bind(crypto.randomUUID(), owner, txHash, now)
    .run();

  const existing = await env.DB.prepare(
    "SELECT * FROM onchain_deposits WHERE tx_hash=?",
  )
    .bind(txHash)
    .first<DepositRow>();
  if (existing) {
    throw new HttpError(409, "This deposit was already credited");
  }

  const { receipt, tx } = await fetchIncludedTx(env, txHash);
  if (tx.sender !== owner)
    throw new HttpError(400, "Transaction belongs to another wallet");
  if (tx.contract !== cfg.contract)
    throw new HttpError(
      400,
      "Transaction does not call the Pets item contract",
    );
  const { def, qty } = qualifyingDepositTransfer(
    receipt.logs,
    owner,
    cfg.admin,
  );

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO onchain_deposits(tx_hash,owner,game_item_id,item_id,qty,contract,created_at)
         VALUES(?,?,?,?,?,?,?)`,
      ).bind(txHash, owner, def.gameItemId, def.itemId, qty, cfg.contract, now),
      env.DB.prepare(
        `INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?)
         ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty`,
      ).bind(owner, def.gameItemId, qty),
    ]);
  } catch {
    const raced = await env.DB.prepare(
      "SELECT * FROM onchain_deposits WHERE tx_hash=?",
    )
      .bind(txHash)
      .first<DepositRow>();
    if (raced) throw new HttpError(409, "This deposit was already credited");
    throw new HttpError(500, "Could not credit this deposit. Retry shortly.");
  }

  const row = await env.DB.prepare(
    "SELECT * FROM onchain_deposits WHERE tx_hash=?",
  )
    .bind(txHash)
    .first<DepositRow>();
  if (!row)
    throw new HttpError(500, "Could not credit this deposit. Retry shortly.");
  return Response.json({ ok: true, deposit: depositView(row) });
}

export async function onchainItemsGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/items/onchain") return null;
  const cfg = await onchainConfig(env);
  if (!cfg) return disabled();
  const ownerParam = url.searchParams.get("owner");
  const base = {
    enabled: true,
    chain_id: CHAIN_ID,
    contract: cfg.contract,
    operator: cfg.admin,
    max_qty: ONCHAIN_WITHDRAW_MAX_QTY,
  };
  if (!ownerParam) return Response.json({ ...base, items: ONCHAIN_ITEMS });
  const owner = hex32(ownerParam);
  const pending = await env.DB.prepare(
    "SELECT * FROM onchain_withdrawals WHERE owner=? AND status='submitted' ORDER BY created_at LIMIT 3",
  )
    .bind(owner)
    .all<WithdrawalRow>();
  for (const w of pending.results) await settle(env, cfg, w, now);
  const inv = await env.DB.prepare(
    "SELECT item_id,qty FROM inventory WHERE owner=?",
  )
    .bind(owner)
    .all<{ item_id: string; qty: number }>();
  const offchain = new Map(inv.results.map((r) => [r.item_id, Number(r.qty)]));
  const items = await mapPool(ONCHAIN_ITEMS, 4, async (def) => {
    let onchain: number | null = null;
    try {
      onchain = await onchainBalance(env, cfg, owner, def.itemId);
    } catch {
      onchain = null;
    }
    return {
      ...def,
      offchain_qty: offchain.get(def.gameItemId) || 0,
      onchain_qty: onchain,
    };
  });
  const recent = await env.DB.prepare(
    "SELECT * FROM onchain_withdrawals WHERE owner=? ORDER BY created_at DESC LIMIT 10",
  )
    .bind(owner)
    .all<WithdrawalRow>();
  const deposits = await env.DB.prepare(
    "SELECT * FROM onchain_deposits WHERE owner=? ORDER BY created_at DESC LIMIT 10",
  )
    .bind(owner)
    .all<DepositRow>();
  return Response.json({
    ...base,
    owner,
    items,
    withdrawals: recent.results.map(view),
    deposits: deposits.results.map(depositView),
  });
}

async function assertWithdrawable(env: Env, owner: string, gameItemId: string) {
  const equipped = await env.DB.prepare(
    "SELECT slot FROM pet_cosmetics WHERE owner=? AND item_id=?",
  )
    .bind(owner, gameItemId)
    .first<{ slot: string }>();
  if (equipped)
    throw new HttpError(409, "Unequip this cosmetic before withdrawing it");
  const placed = await env.DB.prepare(
    "SELECT id FROM housing_placements WHERE owner=? AND item_id=?",
  )
    .bind(owner, gameItemId)
    .first<{ id: string }>();
  if (placed)
    throw new HttpError(
      409,
      "Pick this item up from your home plot before withdrawing it",
    );
}

export async function onchainItemsPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (
    url.pathname !== "/api/items/withdraw/challenge" &&
    url.pathname !== "/api/items/withdraw/confirm" &&
    url.pathname !== "/api/items/deposit/prepare" &&
    url.pathname !== "/api/items/deposit/confirm"
  )
    return null;
  const cfg = await onchainConfig(env);
  if (!cfg)
    throw new HttpError(
      503,
      "On-chain items are not configured on this deployment.",
    );

  if (url.pathname === "/api/items/deposit/prepare")
    return prepareDeposit(env, cfg, body);
  if (url.pathname === "/api/items/deposit/confirm")
    return confirmDeposit(env, cfg, body, now);

  if (url.pathname === "/api/items/withdraw/challenge") {
    const owner = hex32(body.owner);
    const def =
      typeof body.game_item_id === "string"
        ? onchainItemByGameId(body.game_item_id)
        : undefined;
    if (!def)
      throw new HttpError(400, "This item cannot be withdrawn on-chain");
    const qty = Number(body.qty);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > ONCHAIN_WITHDRAW_MAX_QTY)
      throw new HttpError(
        400,
        `Quantity must be 1..${ONCHAIN_WITHDRAW_MAX_QTY}`,
      );
    await assertWithdrawable(env, owner, def.gameItemId);
    const have = await env.DB.prepare(
      "SELECT qty FROM inventory WHERE owner=? AND item_id=?",
    )
      .bind(owner, def.gameItemId)
      .first<{ qty: number }>();
    if (Number(have?.qty || 0) < qty)
      throw new HttpError(409, `Not enough ${def.name} in your inventory`);
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM onchain_withdraw_challenges WHERE owner=? AND created_at>?",
    )
      .bind(owner, now - 60_000)
      .first<{ n: number }>();
    if ((recent?.n || 0) >= 5)
      throw new HttpError(429, "Too many withdrawals. Try again shortly.");
    await env.DB.prepare(
      "DELETE FROM onchain_withdraw_challenges WHERE expires_at<?",
    )
      .bind(now)
      .run();
    const id = crypto.randomUUID();
    const expires = now + 10 * 60_000;
    const message = `Boing Pets on-chain withdraw v1\nOrigin: ${env.APP_ORIGIN}\nChain: ${CHAIN_ID}\nOwner: ${owner}\nContract: ${cfg.contract}\nItem: ${def.gameItemId} (#${def.itemId})\nQuantity: ${qty}\nNonce: ${id}\nExpires: ${expires}`;
    await env.DB.prepare(
      "INSERT INTO onchain_withdraw_challenges(id,owner,game_item_id,item_id,qty,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(id, owner, def.gameItemId, def.itemId, qty, message, now, expires)
      .run();
    return Response.json({
      id,
      owner,
      game_item_id: def.gameItemId,
      item_id: def.itemId,
      qty,
      message,
      expires_at: expires,
    });
  }

  // confirm
  if (typeof body.id !== "string" || body.id.length > 64)
    throw new HttpError(400, "Invalid withdrawal challenge");
  const c = await env.DB.prepare(
    "SELECT * FROM onchain_withdraw_challenges WHERE id=?",
  )
    .bind(body.id)
    .first<{
      id: string;
      owner: string;
      game_item_id: string;
      item_id: number;
      qty: number;
      message: string;
      expires_at: number;
    }>();
  if (!c) throw new HttpError(404, "Withdrawal challenge not found");
  if (c.expires_at < now)
    throw new HttpError(410, "Withdrawal challenge expired. Start again.");
  await verifySignature(c.owner, c.message, body.signature);
  const def = onchainItemByGameId(c.game_item_id);
  if (!def || def.itemId !== Number(c.item_id))
    throw new HttpError(409, "Item mapping changed; start again");
  await assertWithdrawable(env, c.owner, def.gameItemId);
  await env.DB.prepare("DELETE FROM onchain_withdraw_challenges WHERE id=?")
    .bind(c.id)
    .run();

  let adminWord: string;
  try {
    adminWord = storageWordHex(
      await rpc<unknown>(env, "boing_getContractStorage", [
        cfg.contract,
        MT_ADMIN_STORAGE_KEY,
      ]),
    );
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, "Could not read the item contract");
  }
  if ("0x" + adminWord !== cfg.admin)
    throw new HttpError(
      503,
      "The Pets operator key is not the item contract admin; withdrawals are paused.",
    );

  const chainNonce = await adminNonce(env, cfg.admin);
  const inflight = await env.DB.prepare(
    "SELECT MAX(admin_nonce) AS n FROM onchain_withdrawals WHERE contract=? AND status='submitted'",
  )
    .bind(cfg.contract)
    .first<{ n: number | null }>();
  let startNonce = Math.max(
    chainNonce,
    inflight?.n == null ? 0 : Number(inflight.n) + 1,
  );
  const id = c.id;
  let recorded = false;
  let legs: WithdrawLeg[] = [];
  for (let attempt = 0; attempt < 3 && !recorded; attempt++) {
    if (attempt > 0) {
      const again = await env.DB.prepare(
        "SELECT MAX(admin_nonce) AS n FROM onchain_withdrawals WHERE contract=? AND status='submitted'",
      )
        .bind(cfg.contract)
        .first<{ n: number | null }>();
      startNonce = Math.max(
        startNonce + 1,
        chainNonce,
        again?.n == null ? 0 : Number(again.n) + 1,
      );
    }
    legs = await planWithdrawLegs(
      env,
      cfg,
      startNonce,
      c.owner,
      def.itemId,
      c.qty,
    );
    const first = legs[0]!;
    const lastNonce = legs[legs.length - 1]!.nonce;
    // Simulate only when the first leg is next in line (a queued nonce cannot simulate).
    if (attempt === 0 && first.nonce === chainNonce) {
      let sim: { success?: boolean; error?: string };
      try {
        sim = await rpc(env, "boing_simulateTransaction", [first.signed]);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(
          502,
          "The withdrawal could not be simulated; nothing was withdrawn.",
        );
      }
      if (sim?.success !== true)
        throw new HttpError(
          502,
          `The withdrawal would fail (${sim?.error || "simulation failed"}); nothing was withdrawn.`,
        );
    }
    try {
      // Debit and record atomically; the insert only happens when the stack still covers qty.
      // admin_nonce is the highest nonce used so a concurrent withdraw cannot steal a split leg.
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO onchain_withdrawals(id,owner,game_item_id,item_id,qty,contract,admin_nonce,signed_tx,tx_hash,status,error,created_at,updated_at)
           SELECT ?,?,?,?,?,?,?,?,?,'submitted',NULL,?,?
           WHERE EXISTS (SELECT 1 FROM inventory WHERE owner=? AND item_id=? AND qty>=?)`,
        ).bind(
          id,
          c.owner,
          def.gameItemId,
          def.itemId,
          c.qty,
          cfg.contract,
          lastNonce,
          encodeLegs(legs),
          first.hash,
          now,
          now,
          c.owner,
          def.gameItemId,
          c.qty,
        ),
        env.DB.prepare(
          "UPDATE inventory SET qty=qty-? WHERE owner=? AND item_id=? AND qty>=? AND EXISTS (SELECT 1 FROM onchain_withdrawals WHERE id=?)",
        ).bind(c.qty, c.owner, def.gameItemId, c.qty, id),
      ]);
      recorded = true;
    } catch {
      const exists = await env.DB.prepare(
        "SELECT 1 AS ok FROM onchain_withdrawals WHERE id=?",
      )
        .bind(id)
        .first();
      if (exists)
        throw new HttpError(409, "This withdrawal was already confirmed");
      // Nonce taken by a concurrent withdrawal: retry with a later starting nonce.
    }
  }
  if (!recorded)
    throw new HttpError(409, "Withdrawals are busy. Try again shortly.");
  const row = await env.DB.prepare(
    "SELECT * FROM onchain_withdrawals WHERE id=?",
  )
    .bind(id)
    .first<WithdrawalRow>();
  if (!row)
    throw new HttpError(409, `Not enough ${def.name} in your inventory`);

  let submittedAny = false;
  for (const leg of legs) {
    try {
      const res = await rpc<{ tx_hash?: string; tx_id?: string }>(
        env,
        "boing_submitTransaction",
        [leg.signed],
      );
      const nodeHash = (res?.tx_id ?? res?.tx_hash ?? "").toLowerCase();
      if (/^0x[0-9a-f]{64}$/.test(nodeHash) && nodeHash !== leg.hash) {
        leg.hash = nodeHash;
      }
      submittedAny = true;
    } catch (e) {
      if (e instanceof RpcRejected && !isAlreadyKnown(e)) {
        if (!submittedAny) {
          await env.DB.batch(refundStatements(env, row, e.message, now));
          throw new HttpError(
            502,
            `The network rejected the withdrawal (${e.message}). Your items were returned.`,
          );
        }
        // A later leg was rejected after an earlier one was submitted; settle on read.
        break;
      }
      // Unavailable or already known: the signed tx is stored and will be settled on read.
    }
  }
  const encoded = encodeLegs(legs);
  if (encoded !== row.signed_tx || legs[0]!.hash !== row.tx_hash) {
    await env.DB.prepare(
      "UPDATE onchain_withdrawals SET signed_tx=?, tx_hash=? WHERE id=?",
    )
      .bind(encoded, legs[0]!.hash, id)
      .run();
    row.signed_tx = encoded;
    row.tx_hash = legs[0]!.hash;
  }
  return Response.json({ ok: true, withdrawal: view(row) });
}

export function onchainItemsError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof RpcRejected)
    return Response.json(
      { error: `Testnet RPC rejected the request (${error.message})` },
      { status: 502 },
    );
  return null;
}
