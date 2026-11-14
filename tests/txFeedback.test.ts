import { describe, expect, it } from "vitest";
import { classifyWalletError } from "../src/wallet/txFeedback";

describe("wallet and transaction feedback", () => {
  it("maps declined signatures to a retryable friendly message", () => {
    const rejected = classifyWalletError({
      code: 4001,
      message: "User rejected the request",
    });
    expect(rejected).toEqual({
      kind: "declined",
      message: "Signature declined. You can retry when you're ready.",
      retryable: true,
    });
    expect(
      classifyWalletError(new Error("User denied message signature")).kind,
    ).toBe("declined");
  });

  it("maps slow or timed-out RPC errors to a retryable friendly message", () => {
    const timeout = new Error("Headers Timeout");
    timeout.name = "TimeoutError";
    expect(classifyWalletError(timeout)).toEqual({
      kind: "slow-rpc",
      message: "The network is responding slowly. Retry in a moment.",
      retryable: true,
    });
    expect(classifyWalletError(new Error("Failed to fetch")).kind).toBe(
      "slow-rpc",
    );
    expect(
      classifyWalletError(new Error("JSON-RPC timeout after 12s")).kind,
    ).toBe("slow-rpc");
  });

  it("maps low-gas errors to a retryable friendly message", () => {
    expect(
      classifyWalletError(
        new Error("insufficient funds for gas * price + value"),
      ),
    ).toEqual({
      kind: "low-gas",
      message:
        "Not enough gas to send this transaction. Add a little testnet BOING and retry.",
      retryable: true,
    });
    expect(classifyWalletError(new Error("intrinsic gas too low")).kind).toBe(
      "low-gas",
    );
  });

  it("leaves unrelated errors as their original message without a retry flag", () => {
    expect(
      classifyWalletError(new Error("Connect Boing Express first")),
    ).toEqual({
      kind: "other",
      message: "Connect Boing Express first",
      retryable: false,
    });
  });
});
