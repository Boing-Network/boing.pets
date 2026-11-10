/** Verify a native testnet-BOING transfer into the market escrow. */

import { hex32 } from "../src/core";
import { MARKET_ESCROW_ADDRESS } from "../src/market";

export type NativeTransfer = {
  sender: string;
  to: string;
  amount: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error("Malformed transaction");
  }
  return value as Record<string, unknown>;
}

/** Pull a native Transfer out of a block transaction (same shape as care proofs). */
export function extractNativeTransfer(tx: unknown): NativeTransfer {
  const row = record(tx);
  const sender = hex32(String(row.sender || ""));
  const payload = record(row.payload);
  const transfer = record(payload.Transfer);
  const to = hex32(String(transfer.to || ""));
  const amount = String(transfer.amount ?? "");
  if (!/^\d+$/.test(amount) || amount === "0") {
    throw new Error("Transfer amount is missing");
  }
  return { sender, to, amount };
}

export function assertEscrowPayment(input: {
  transfer: NativeTransfer;
  buyer: string;
  escrow?: string;
  priceBaseUnits: string;
}): void {
  const escrow = hex32(input.escrow || MARKET_ESCROW_ADDRESS);
  if (hex32(input.transfer.sender) !== hex32(input.buyer)) {
    throw new Error("Payment was sent from a different wallet");
  }
  if (input.transfer.to !== escrow) {
    throw new Error("Payment was not sent to the market escrow");
  }
  if (BigInt(input.transfer.amount) !== BigInt(input.priceBaseUnits)) {
    throw new Error("Payment amount does not match the listing price");
  }
}

type RpcBlock = {
  header?: { height?: number };
  transactions?: unknown[];
};

export async function loadIncludedTransfer(
  env: Env,
  txHash: string,
): Promise<{ transfer: NativeTransfer; blockHeight: number }> {
  const receipt = await rpcJson<{
    success?: boolean;
    tx_id?: string;
    block_height?: number;
    tx_index?: number;
  } | null>(env, "boing_getTransactionReceipt", [txHash]);
  if (!receipt) {
    throw new Error(
      "Transaction is not included yet. Wait and retry confirmation.",
    );
  }
  if (
    receipt.success !== true ||
    hex32(String(receipt.tx_id ?? txHash)) !== hex32(txHash)
  ) {
    throw new Error("Transaction failed or receipt does not match");
  }
  const height = Number(receipt.block_height);
  const index = Number(receipt.tx_index);
  const block = await rpcJson<RpcBlock | null>(env, "boing_getBlockByHeight", [
    height,
    true,
    false,
  ]);
  if (!block || Number(block.header?.height) !== height) {
    throw new Error("Block is unavailable");
  }
  const raw = block.transactions?.[index];
  if (!raw) throw new Error("Transaction is missing from its block");
  return { transfer: extractNativeTransfer(raw), blockHeight: height };
}

async function rpcJson<T>(
  env: Env,
  method: string,
  params: unknown[],
): Promise<T> {
  const r = await fetch(env.RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error("Testnet RPC is unavailable");
  const body = (await r.json()) as { result?: T; error?: unknown };
  if (body.error || body.result === undefined)
    throw new Error("RPC rejected request");
  return body.result;
}
