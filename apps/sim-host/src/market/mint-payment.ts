/**
 * Player-paid mint on demand: the wallet sends one plain BOING transfer of
 * at least the fee to the operator wallet, then names that tx in the mint
 * request. This module checks the payment on chain, read-only:
 *
 * 1. `boing_getTransactionReceipt(tx)`: the tx is included and succeeded
 *    (no receipt yet means "pending", and the client asks again).
 * 2. `boing_getBlockByHeight(receipt.block_height)`, tx at `receipt.tx_index`:
 *    sender is the requesting wallet, payload is a `Transfer` to the operator,
 *    amount >= fee, and the block is younger than MINT_RULES.paymentMaxAgeMs.
 *
 * "Each payment counts once" is not checked here: the item service keys the
 * claim lot and the LPIT mint row on the tx id (`claim:<tx>`), and both are
 * unique per world, so a tx id can back at most one claim.
 */
import { MINT_RULES } from "@boing-pets/contract";

/** The RPC reads the check needs (a subset of the SDK BoingClient). */
export type PaymentChain = {
  getTransactionReceipt(txId: string): Promise<{
    tx_id?: string;
    block_height: number;
    tx_index: number;
    success: boolean;
    error?: string | null;
  } | null>;
  getBlockByHeight(
    height: number,
    includeReceipts?: boolean,
    includeCode?: boolean,
  ): Promise<{
    header: { timestamp: number };
    transactions: unknown[];
  } | null>;
};

export type PaymentCheck =
  | { ok: true; amountWei: bigint }
  | { ok: false; pending: true; detail: string }
  | { ok: false; pending: false; detail: string };

const WEI_PER_BOING = 10n ** 18n;
const TX_ID = /^0x[0-9a-f]{64}$/;

/** `0x` + 64 lowercase hex, or null. */
export function normalizeTxId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  const hex = v.startsWith("0x") ? v : `0x${v}`;
  return TX_ID.test(hex) ? hex : null;
}

/** "0.0005" (BOING) -> 500000000000000n. Null on anything malformed. */
export function boingToWei(value: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(value.trim());
  if (m == null) return null;
  const whole = BigInt(m[1]!);
  const frac = BigInt((m[2] ?? "").padEnd(18, "0"));
  return whole * WEI_PER_BOING + frac;
}

/** 500000000000000n -> "0.0005". */
export function weiToBoing(wei: bigint): string {
  const whole = wei / WEI_PER_BOING;
  const frac = (wei % WEI_PER_BOING)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  return frac === "" ? whole.toString() : `${whole}.${frac}`;
}

/**
 * Fee per mint request from LIVING_PETS_ITEM_MINT_FEE (BOING, e.g. "0.0005").
 * Unset or invalid falls back to MINT_RULES.defaultFeeWei. Zero is refused
 * (players must pay; a free mint would need a code change on purpose).
 */
export function mintFeeFromEnv(
  env: Record<string, string | undefined>,
): bigint {
  const raw = env.LIVING_PETS_ITEM_MINT_FEE?.trim();
  const fallback = BigInt(MINT_RULES.defaultFeeWei);
  if (raw == null || raw === "") return fallback;
  const wei = boingToWei(raw);
  return wei == null || wei <= 0n ? fallback : wei;
}

function hex32(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  const hex = v.startsWith("0x") ? v : `0x${v}`;
  return /^0x[0-9a-f]{64}$/.test(hex) ? hex : null;
}

/** `{ sender, payload: { Transfer: { to, amount } } }` from a block tx. */
function readTransfer(
  tx: unknown,
): { sender: string; to: string; amount: bigint } | null {
  if (tx == null || typeof tx !== "object") return null;
  const t = tx as { sender?: unknown; payload?: unknown };
  const sender = hex32(t.sender);
  const payload = t.payload as {
    Transfer?: { to?: unknown; amount?: unknown };
  };
  const transfer = payload?.Transfer;
  if (sender == null || transfer == null) return null;
  const to = hex32(transfer.to);
  const raw = transfer.amount;
  if (to == null) return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  if (!/^\d+$/.test(String(raw))) return null;
  return { sender, to, amount: BigInt(raw) };
}

export async function verifyMintPayment(input: {
  chain: PaymentChain;
  txId: string;
  walletHex: string;
  payToHex: string;
  feeWei: bigint;
  nowMs: number;
  maxAgeMs?: number;
}): Promise<PaymentCheck> {
  const txId = normalizeTxId(input.txId);
  const wallet = hex32(input.walletHex);
  const payTo = hex32(input.payToHex);
  if (txId == null)
    return { ok: false, pending: false, detail: "payment tx id" };
  if (wallet == null || payTo == null) {
    return { ok: false, pending: false, detail: "wallet" };
  }
  let receipt: Awaited<ReturnType<PaymentChain["getTransactionReceipt"]>>;
  try {
    receipt = await input.chain.getTransactionReceipt(txId);
  } catch {
    return {
      ok: false,
      pending: true,
      detail: "could not read the chain; retrying",
    };
  }
  if (receipt == null) {
    return { ok: false, pending: true, detail: "payment not on chain yet" };
  }
  if (receipt.tx_id != null && normalizeTxId(receipt.tx_id) !== txId) {
    return { ok: false, pending: false, detail: "payment receipt mismatch" };
  }
  if (!receipt.success) {
    return { ok: false, pending: false, detail: "payment tx failed on chain" };
  }
  let block: Awaited<ReturnType<PaymentChain["getBlockByHeight"]>>;
  try {
    block = await input.chain.getBlockByHeight(
      receipt.block_height,
      false,
      false,
    );
  } catch {
    return {
      ok: false,
      pending: true,
      detail: "could not read the chain; retrying",
    };
  }
  if (block == null) {
    return {
      ok: false,
      pending: true,
      detail: "payment block not readable yet",
    };
  }
  const transfer = readTransfer(block.transactions[receipt.tx_index]);
  if (transfer == null) {
    return {
      ok: false,
      pending: false,
      detail: "payment must be a plain BOING transfer",
    };
  }
  if (transfer.sender !== wallet) {
    return {
      ok: false,
      pending: false,
      detail: "payment was not sent by this wallet",
    };
  }
  if (transfer.to !== payTo) {
    return {
      ok: false,
      pending: false,
      detail: "payment did not go to the operator",
    };
  }
  if (transfer.amount < input.feeWei) {
    return {
      ok: false,
      pending: false,
      detail: `payment is below the ${weiToBoing(input.feeWei)} BOING fee`,
    };
  }
  const maxAgeMs = input.maxAgeMs ?? MINT_RULES.paymentMaxAgeMs;
  if (input.nowMs - block.header.timestamp * 1000 > maxAgeMs) {
    return { ok: false, pending: false, detail: "payment is too old to use" };
  }
  return { ok: true, amountWei: transfer.amount };
}
