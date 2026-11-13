import { hex32 } from "../src/core";

export interface Receipt {
  tx_id: string;
  block_height: number;
  tx_index: number;
  success: boolean;
  error?: string | null;
  logs?: unknown;
}

export interface ProofChallenge {
  owner: string;
  amount: string;
  min_height: number;
}

export interface RpcBlock {
  header: { height: number };
  transactions: unknown[];
  receipts?: Array<Receipt | null>;
}

/** Injected JSON-RPC so callers share one receipt-resolution path. */
export type ChainRpc = <T>(method: string, params: unknown[]) => Promise<T>;

/** Node stores `VmError::InvalidNonce` as this prefix (often `Invalid nonce: …`). */
export const NONCE_REJECT_ERROR_PREFIX = "Invalid nonce";

export const ACCOUNT_TX_PAGE_SIZE = 50;
export const ACCOUNT_TX_MAX_PAGES = 3;
/** Fallback window when account history is unavailable, only for nonce rejects. */
export const NEARBY_INCLUSION_SPAN = 16;

export function isNonceRejectError(error: unknown): boolean {
  return (
    typeof error === "string" && error.startsWith(NONCE_REJECT_ERROR_PREFIX)
  );
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object")
    throw new Error("Malformed RPC proof");
  return value as Record<string, unknown>;
}

function receiptHash(r: { tx_id?: unknown }, fallback: string): string | null {
  if (typeof r.tx_id !== "string" || r.tx_id.length === 0)
    return hex32(fallback);
  try {
    return hex32(r.tx_id);
  } catch {
    return null;
  }
}

function receiptRank(r: Receipt): number {
  if (r.success === true) return 2;
  if (isNonceRejectError(r.error)) return 0;
  return 1;
}

/** Receipts in this list whose tx_id matches `hash`. */
export function receiptsForTx(
  hash: string,
  receipts: Array<Receipt | null | undefined> | undefined,
): Receipt[] {
  const want = hex32(hash);
  const out: Receipt[] = [];
  for (const item of receipts ?? []) {
    if (!item) continue;
    const id = receiptHash(item, hash);
    if (id === want) out.push(item);
  }
  return out;
}

/** Successful receipt for `hash` in a block's per-height receipt list, if any. */
export function successfulReceiptForTx(
  hash: string,
  receipts: Array<Receipt | null | undefined> | undefined,
): Receipt | undefined {
  return receiptsForTx(hash, receipts).find((item) => item.success === true);
}

/**
 * Prefer a real execution over a later no-op duplicate (`Invalid nonce`),
 * matching the node's receipt index ranking. Fail closed when nothing
 * authoritative is present. Earlier block wins ties.
 */
export function pickAuthoritativeReceipt(
  hash: string,
  candidates: Array<Receipt | null | undefined>,
): Receipt | undefined {
  const matched = receiptsForTx(hash, candidates);
  if (matched.length === 0) return undefined;
  return matched.reduce((best, item) => {
    const rankDiff = receiptRank(item) - receiptRank(best);
    if (rankDiff > 0) return item;
    if (rankDiff < 0) return best;
    if (item.block_height < best.block_height) return item;
    return best;
  });
}

export function senderFromBlockTx(
  block: RpcBlock | null | undefined,
  index: number,
): string | null {
  if (!block || !Number.isSafeInteger(index) || index < 0) return null;
  const raw = block.transactions?.[index];
  if (!raw || typeof raw !== "object") return null;
  const sender = (raw as { sender?: unknown }).sender;
  if (typeof sender !== "string") return null;
  try {
    return hex32(sender);
  } catch {
    return null;
  }
}

export async function loadBlockWithReceipts(
  rpc: ChainRpc,
  height: number,
): Promise<RpcBlock | null> {
  if (!Number.isSafeInteger(height) || height < 0) return null;
  const block = await rpc<RpcBlock | null>("boing_getBlockByHeight", [
    height,
    true,
    false,
  ]);
  if (!block || Number(block.header?.height) !== height) return null;
  return block;
}

async function accountInclusionHeights(
  rpc: ChainRpc,
  hash: string,
  sender: string,
): Promise<number[] | null> {
  const want = hex32(hash);
  const heights = new Set<number>();
  let cursor: string | undefined;
  try {
    for (let page = 0; page < ACCOUNT_TX_MAX_PAGES; page++) {
      const opts: { limit: number; cursor?: string } = {
        limit: ACCOUNT_TX_PAGE_SIZE,
      };
      if (cursor) opts.cursor = cursor;
      const result = await rpc<{
        transactions?: Array<{ tx_id?: unknown; block_height?: unknown }>;
        next_cursor?: string | null;
      } | null>("boing_getAccountTransactions", [sender, opts]);
      if (!result || !Array.isArray(result.transactions)) return null;
      for (const row of result.transactions) {
        if (!row || typeof row.tx_id !== "string") continue;
        try {
          if (hex32(row.tx_id) !== want) continue;
        } catch {
          continue;
        }
        const height = Number(row.block_height);
        if (Number.isSafeInteger(height) && height >= 0) heights.add(height);
      }
      if (!result.next_cursor) break;
      if (heights.size > 1) break;
      cursor = result.next_cursor;
    }
    return [...heights];
  } catch {
    return null;
  }
}

function nearbyHeights(center: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= NEARBY_INCLUSION_SPAN; d++) {
    if (center - d >= 0) out.push(center - d);
    out.push(center + d);
  }
  return out;
}

async function firstSuccessInHeights(
  rpc: ChainRpc,
  hash: string,
  heights: number[],
  skip?: number,
): Promise<{ receipt: Receipt; block: RpcBlock } | null> {
  const seen = new Set<number>();
  for (const height of heights) {
    if (!Number.isSafeInteger(height) || height < 0 || height === skip)
      continue;
    if (seen.has(height)) continue;
    seen.add(height);
    let block: RpcBlock | null;
    try {
      block = await loadBlockWithReceipts(rpc, height);
    } catch {
      continue;
    }
    const success = successfulReceiptForTx(hash, block?.receipts);
    if (success && block) return { receipt: success, block };
  }
  return null;
}

export type ResolvedInclusion = {
  receipt: Receipt | null;
  block: RpcBlock | null;
};

/**
 * Resolve the authoritative inclusion for a tx hash.
 *
 * `boing_getTransactionReceipt` is keyed by tx id and historically
 * last-write-wins, so a later `Invalid nonce` duplicate can hide a real
 * success. Per-height `block.receipts` are not overwritten that way, so we
 * prefer a successful receipt in the hinted block, then in other inclusion
 * blocks. Returns the failed receipt when no success exists (fail closed).
 */
export async function resolveIncludedReceipt(
  rpc: ChainRpc,
  hash: string,
  hinted?: Receipt | null,
): Promise<ResolvedInclusion> {
  const want = hex32(hash);
  const hint =
    hinted !== undefined
      ? hinted
      : await rpc<Receipt | null>("boing_getTransactionReceipt", [hash]);
  if (!hint) return { receipt: null, block: null };

  const hintId = receiptHash(hint, hash);
  const hintHeight = Number(hint.block_height);
  let block: RpcBlock | null = null;
  if (Number.isSafeInteger(hintHeight) && hintHeight >= 0) {
    try {
      block = await loadBlockWithReceipts(rpc, hintHeight);
    } catch {
      block = null;
    }
  }
  const inBlock = successfulReceiptForTx(hash, block?.receipts);
  if (inBlock && block) return { receipt: inBlock, block };
  if (hint.success === true && hintId === want) {
    return { receipt: hint, block };
  }

  const known = Number.isSafeInteger(hintHeight) ? hintHeight : undefined;
  const sender = senderFromBlockTx(
    block,
    Number.isSafeInteger(Number(hint.tx_index)) ? Number(hint.tx_index) : -1,
  );
  let heights: number[] = [];
  let listed: number[] | null = null;
  if (sender) listed = await accountInclusionHeights(rpc, hash, sender);
  if (listed && listed.length > 0) {
    heights = listed;
  } else if (
    listed === null &&
    isNonceRejectError(hint.error) &&
    known != null
  ) {
    heights = nearbyHeights(known);
  }
  const found = await firstSuccessInHeights(rpc, hash, heights, known);
  if (found) return found;
  return { receipt: hint, block };
}

/**
 * Confirm a self-transfer proof. When the provided receipt or the receipt
 * at `tx_index` is a failed duplicate, a successful receipt for the same
 * tx_id in this block is used instead. Callers should run
 * `resolveIncludedReceipt` first so success in another inclusion block is
 * already selected. Still throws when no success exists.
 */
export function verifyProof(
  hash: string,
  c: ProofChallenge,
  r: Receipt | null,
  b: RpcBlock | null,
): void {
  if (!r)
    throw new Error(
      "Transaction is not included yet. Wait and retry confirmation.",
    );
  const want = hex32(hash);
  const blockSuccess = successfulReceiptForTx(hash, b?.receipts);
  let receipt = r;
  if (r.success !== true || receiptHash(r, hash) !== want) {
    if (!blockSuccess)
      throw new Error("Transaction failed or receipt does not match");
    receipt = blockSuccess;
  }
  if (
    !Number.isSafeInteger(receipt.block_height) ||
    receipt.block_height <= c.min_height ||
    !Number.isSafeInteger(receipt.tx_index) ||
    receipt.tx_index < 0
  )
    throw new Error("Transaction predates this challenge");
  if (!b || b.header.height !== receipt.block_height)
    throw new Error("Block is unavailable");
  const atIndex = b.receipts?.[receipt.tx_index];
  const br =
    atIndex && atIndex.success === true && receiptHash(atIndex, hash) === want
      ? atIndex
      : blockSuccess;
  if (!br || br.success !== true || receiptHash(br, hash) !== want)
    throw new Error("Block receipt does not match");
  const tx = record(b.transactions[br.tx_index]);
  if (hex32(tx.sender) !== c.owner)
    throw new Error("Transaction belongs to another wallet");
  const transfer = record(record(tx.payload).Transfer);
  if (hex32(transfer.to) !== c.owner || String(transfer.amount) !== c.amount)
    throw new Error("Expected the exact Boing Pets self-transfer");
}
