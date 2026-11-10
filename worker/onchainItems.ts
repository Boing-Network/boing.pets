/**
 * Withdraw mined resources from the off-chain inventory into a Boing reference multi-token
 * v1 contract (shared item types). Feature-flagged: every route answers "disabled" unless
 * MULTI_TOKEN_CONTRACT and the MULTI_TOKEN_ADMIN_SECRET_KEY secret are both configured.
 *
 * Flow: challenge (player signs the exact item + qty) -> confirm: the operator key signs a
 * `mint(player, item, qty)` tx, it is simulated, the inventory debit and the signed tx are
 * written atomically, then the tx is submitted. Pending mints are re-checked on read: a
 * failed receipt, or the operator nonce moving past the tx without a receipt, refunds the
 * stack exactly once.
 */
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  buildContractCallTransaction,
  signTransactionInput,
  transactionIdFromSignedTransactionHex,
} from "@boing-network/boing-sdk";
import {
  MT_ADMIN_STORAGE_KEY,
  ONCHAIN_ITEMS,
  ONCHAIN_WITHDRAW_MAX_QTY,
  bytesToHex,
  hex64,
  mtBalanceStorageKey,
  mtMintCalldata,
  onchainItemByGameId,
  storageWordHex,
  storageWordQty,
} from "../src/content/onchainItems";
import { hex32 } from "../src/core";

const CHAIN_ID = 6913;
/** Resubmit an unresolved signed mint at most this often. */
const RESUBMIT_AFTER_MS = 60_000;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

class RpcRejected extends Error {
  constructor(
    public code: number,
    message: string,
    public data: unknown,
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
  let body: {
    result?: T;
    error?: { code?: number; message?: string; data?: unknown };
  };
  try {
    const r = await fetch(env.RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error("HTTP error");
    body = (await r.json()) as typeof body;
  } catch {
    throw new HttpError(
      503,
      "Testnet RPC is unavailable. Nothing was withdrawn; retry later.",
    );
  }
  if (body.error)
    throw new RpcRejected(
      Number(body.error.code ?? 0),
      String(body.error.message ?? "RPC rejected request"),
      body.error.data,
    );
  return body.result as T;
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

async function signMint(
  cfg: Config,
  nonce: number,
  to: string,
  itemId: number,
  qty: number,
) {
  const tx = buildContractCallTransaction({
    nonce: BigInt(nonce),
    senderHex: cfg.admin,
    contractHex: cfg.contract,
    calldata: mtMintCalldata(to, itemId, qty),
    accessList: {
      read: [cfg.admin, cfg.contract],
      write: [cfg.admin, cfg.contract],
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
) {
  // Credit first, guarded on the row still being in flight, then close the row: exactly-once.
  return [
    env.DB.prepare(
      `INSERT INTO inventory(owner,item_id,qty)
       SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM onchain_withdrawals WHERE id=? AND status='submitted')
       ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty`,
    ).bind(w.owner, w.game_item_id, w.qty, w.id),
    env.DB.prepare(
      "UPDATE onchain_withdrawals SET status='refunded', error=?, updated_at=? WHERE id=? AND status='submitted'",
    ).bind(reason.slice(0, 200), now, w.id),
  ];
}

/** Resolve one in-flight mint against the chain. Never throws on RPC trouble. */
async function settle(
  env: Env,
  cfg: Config,
  w: WithdrawalRow,
  now: number,
): Promise<void> {
  if (w.status !== "submitted") return;
  try {
    // Nonce before receipt: if the nonce has moved past us and there is still no receipt,
    // the slot went to another tx and this mint can never land.
    const nonce = await adminNonce(env, cfg.admin);
    const receipt = await rpc<{ success?: boolean; error?: string } | null>(
      env,
      "boing_getTransactionReceipt",
      [w.tx_hash],
    );
    if (receipt) {
      if (receipt.success === true) {
        await env.DB.prepare(
          "UPDATE onchain_withdrawals SET status='minted', updated_at=? WHERE id=? AND status='submitted'",
        )
          .bind(now, w.id)
          .run();
      } else {
        await env.DB.batch(
          refundStatements(
            env,
            w,
            receipt.error || "Mint transaction failed",
            now,
          ),
        );
      }
      return;
    }
    if (nonce > w.admin_nonce) {
      await env.DB.batch(
        refundStatements(env, w, "Mint was dropped by the network", now),
      );
      return;
    }
    if (now - w.updated_at >= RESUBMIT_AFTER_MS) {
      try {
        await rpc(env, "boing_submitTransaction", [w.signed_tx]);
      } catch {
        /* still pending or already known */
      }
      await env.DB.prepare(
        "UPDATE onchain_withdrawals SET updated_at=? WHERE id=?",
      )
        .bind(now, w.id)
        .run();
    }
  } catch {
    /* RPC unavailable: try again on the next read */
  }
}

function view(w: WithdrawalRow) {
  return {
    id: w.id,
    game_item_id: w.game_item_id,
    item_id: w.item_id,
    qty: w.qty,
    status: w.status,
    tx_hash: w.tx_hash,
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
  const items = [];
  for (const def of ONCHAIN_ITEMS) {
    let onchain: number | null = null;
    try {
      onchain = await onchainBalance(env, cfg, owner, def.itemId);
    } catch {
      onchain = null;
    }
    items.push({
      ...def,
      offchain_qty: offchain.get(def.gameItemId) || 0,
      onchain_qty: onchain,
    });
  }
  const recent = await env.DB.prepare(
    "SELECT * FROM onchain_withdrawals WHERE owner=? ORDER BY created_at DESC LIMIT 10",
  )
    .bind(owner)
    .all<WithdrawalRow>();
  return Response.json({
    ...base,
    owner,
    items,
    withdrawals: recent.results.map(view),
  });
}

export async function onchainItemsPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (
    url.pathname !== "/api/items/withdraw/challenge" &&
    url.pathname !== "/api/items/withdraw/confirm"
  )
    return null;
  const cfg = await onchainConfig(env);
  if (!cfg)
    throw new HttpError(
      503,
      "On-chain items are not configured on this deployment.",
    );

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
  let nonce = Math.max(
    chainNonce,
    inflight?.n == null ? 0 : Number(inflight.n) + 1,
  );
  const id = c.id;
  let recorded = false;
  let signed = "";
  let hash = "";
  for (let attempt = 0; attempt < 3 && !recorded; attempt++, nonce++) {
    ({ signed, hash } = await signMint(cfg, nonce, c.owner, def.itemId, c.qty));
    // Simulate only when this mint is next in line (a queued nonce cannot simulate).
    if (attempt === 0 && nonce === chainNonce) {
      let sim: { success?: boolean; error?: string };
      try {
        sim = await rpc(env, "boing_simulateTransaction", [signed]);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(
          502,
          "The mint could not be simulated; nothing was withdrawn.",
        );
      }
      if (sim?.success !== true)
        throw new HttpError(
          502,
          `The mint would fail (${sim?.error || "simulation failed"}); nothing was withdrawn.`,
        );
    }
    try {
      // Debit and record atomically; the insert only happens when the stack still covers qty.
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
          nonce,
          signed,
          hash,
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
      // Nonce taken by a concurrent withdrawal: retry with the next one.
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

  try {
    const res = await rpc<{ tx_hash?: string; tx_id?: string }>(
      env,
      "boing_submitTransaction",
      [signed],
    );
    const nodeHash = (res?.tx_id ?? res?.tx_hash ?? "").toLowerCase();
    if (/^0x[0-9a-f]{64}$/.test(nodeHash) && nodeHash !== hash) {
      await env.DB.prepare(
        "UPDATE onchain_withdrawals SET tx_hash=? WHERE id=?",
      )
        .bind(nodeHash, id)
        .run();
      row.tx_hash = nodeHash;
    }
  } catch (e) {
    if (e instanceof RpcRejected && !isAlreadyKnown(e)) {
      await env.DB.batch(refundStatements(env, row, e.message, now));
      throw new HttpError(
        502,
        `The network rejected the mint (${e.message}). Your items were returned.`,
      );
    }
    // Unavailable or already known: the signed tx is stored and will be settled on read.
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
