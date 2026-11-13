import { describe, expect, it } from "vitest";
import {
  isNonceRejectError,
  pickAuthoritativeReceipt,
  resolveIncludedReceipt,
  successfulReceiptForTx,
  type ChainRpc,
  type Receipt,
  type RpcBlock,
} from "../worker/proof";

const hash = "0x" + "22".repeat(32);
const other = "0x" + "33".repeat(32);
const owner = "0x" + "11".repeat(32);

const success: Receipt = {
  tx_id: hash,
  block_height: 101,
  tx_index: 0,
  success: true,
  logs: [{ topics: ["0x01"] }],
};
const nonceFail: Receipt = {
  tx_id: hash,
  block_height: 102,
  tx_index: 0,
  success: false,
  error: "Invalid nonce: expected 8, got 7",
};
const reverted: Receipt = {
  tx_id: hash,
  block_height: 50,
  tx_index: 0,
  success: false,
  error: "Execution reverted",
};

function blockAt(height: number, receipt: Receipt, sender = owner): RpcBlock {
  return {
    header: { height },
    transactions: [
      { sender, payload: { Transfer: { to: sender, amount: "1" } } },
    ],
    receipts: [receipt],
  };
}

describe("duplicate receipt ranking", () => {
  it("prefers a success over a later Invalid nonce copy", () => {
    expect(isNonceRejectError(nonceFail.error)).toBe(true);
    expect(isNonceRejectError(reverted.error)).toBe(false);
    const picked = pickAuthoritativeReceipt(hash, [nonceFail, success]);
    expect(picked).toEqual(success);
    expect(successfulReceiptForTx(hash, [nonceFail, success])).toEqual(success);
    expect(successfulReceiptForTx(hash, [nonceFail])).toBeUndefined();
  });

  it("keeps a real failure when no success exists", () => {
    expect(pickAuthoritativeReceipt(hash, [reverted, nonceFail])).toEqual(
      reverted,
    );
    expect(pickAuthoritativeReceipt(hash, [nonceFail])).toEqual(nonceFail);
    expect(
      pickAuthoritativeReceipt(other, [success, nonceFail]),
    ).toBeUndefined();
  });
});

describe("resolveIncludedReceipt", () => {
  it("recovers a success from another inclusion block when the map hid it", async () => {
    const rpc: ChainRpc = async (method, params) => {
      if (method === "boing_getTransactionReceipt") return nonceFail as never;
      if (method === "boing_getBlockByHeight") {
        const height = Number(params[0]);
        if (height === 102) return blockAt(102, nonceFail) as never;
        if (height === 101) return blockAt(101, success) as never;
        return null as never;
      }
      if (method === "boing_getAccountTransactions") {
        return {
          transactions: [
            { tx_id: hash, block_height: 102, tx_index: 0 },
            { tx_id: hash, block_height: 101, tx_index: 0 },
          ],
        } as never;
      }
      throw new Error("unexpected " + method);
    };
    const resolved = await resolveIncludedReceipt(rpc, hash);
    expect(resolved.receipt).toEqual(success);
    expect(resolved.block?.header.height).toBe(101);
    expect(resolved.receipt?.logs).toEqual(success.logs);
  });

  it("still reports a real on-chain failure", async () => {
    const rpc: ChainRpc = async (method, params) => {
      if (method === "boing_getTransactionReceipt") return reverted as never;
      if (method === "boing_getBlockByHeight") {
        const height = Number(params[0]);
        if (height === 50) return blockAt(50, reverted) as never;
        return null as never;
      }
      if (method === "boing_getAccountTransactions") {
        return {
          transactions: [{ tx_id: hash, block_height: 50, tx_index: 0 }],
        } as never;
      }
      throw new Error("unexpected " + method);
    };
    const resolved = await resolveIncludedReceipt(rpc, hash);
    expect(resolved.receipt?.success).toBe(false);
    expect(resolved.receipt?.error).toBe("Execution reverted");
  });

  it("finds a same-block success when the hinted index is the nonce reject", async () => {
    const mixed: RpcBlock = {
      header: { height: 102 },
      transactions: [{ sender: owner }, { sender: owner }],
      receipts: [success, nonceFail],
    };
    const rpc: ChainRpc = async (method, params) => {
      if (method === "boing_getTransactionReceipt") return nonceFail as never;
      if (method === "boing_getBlockByHeight") {
        expect(params[0]).toBe(102);
        return mixed as never;
      }
      throw new Error("unexpected " + method);
    };
    const resolved = await resolveIncludedReceipt(rpc, hash);
    expect(resolved.receipt).toEqual(success);
  });

  it("returns null while the transaction is still pending", async () => {
    const rpc: ChainRpc = async (method) => {
      if (method === "boing_getTransactionReceipt") return null as never;
      throw new Error("unexpected " + method);
    };
    expect(await resolveIncludedReceipt(rpc, hash)).toEqual({
      receipt: null,
      block: null,
    });
  });
});
