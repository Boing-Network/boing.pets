import { hex32 } from "../src/core";
export interface Receipt {
  tx_id: string;
  block_height: number;
  tx_index: number;
  success: boolean;
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
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object")
    throw new Error("Malformed RPC proof");
  return value as Record<string, unknown>;
}
export function includedTx(
  hash: string,
  c: ProofChallenge,
  r: Receipt | null,
  b: RpcBlock | null,
): Record<string, unknown> {
  if (!r)
    throw new Error(
      "Transaction is not included yet. Wait and retry confirmation.",
    );
  if (r.success !== true || hex32(r.tx_id) !== hash)
    throw new Error("Transaction failed or receipt does not match");
  if (
    !Number.isSafeInteger(r.block_height) ||
    r.block_height <= c.min_height ||
    !Number.isSafeInteger(r.tx_index) ||
    r.tx_index < 0
  )
    throw new Error("Transaction predates this challenge");
  if (!b || b.header.height !== r.block_height)
    throw new Error("Block is unavailable");
  const br = b.receipts?.[r.tx_index];
  if (!br || br.success !== true || hex32(br.tx_id) !== hash)
    throw new Error("Block receipt does not match");
  return record(b.transactions[r.tx_index]);
}
export function verifyProof(
  hash: string,
  c: ProofChallenge,
  r: Receipt | null,
  b: RpcBlock | null,
): void {
  const tx = includedTx(hash, c, r, b);
  if (hex32(tx.sender) !== c.owner)
    throw new Error("Transaction belongs to another wallet");
  const transfer = record(record(tx.payload).Transfer);
  if (hex32(transfer.to) !== c.owner || String(transfer.amount) !== c.amount)
    throw new Error("Expected the exact Boing Pets self-transfer");
}
