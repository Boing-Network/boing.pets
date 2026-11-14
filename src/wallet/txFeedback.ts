/** Map raw wallet, RPC, and gas errors into short player-facing copy. */

export type WalletFeedbackKind = "declined" | "slow-rpc" | "low-gas" | "other";

export type WalletFeedback = {
  kind: WalletFeedbackKind;
  message: string;
  retryable: boolean;
};

const DECLINED_RE =
  /user rejected|user denied|rejected the request|denied transaction|denied message|request rejected|action_rejected|user cancelled|user canceled|signature denied|declined the|was rejected|4001/;

const LOW_GAS_RE =
  /insufficient funds|insufficient gas|out of gas|gas required exceeds|intrinsic gas|gas too low|max fee too low|maxFeePerGas|can't pay for gas|cannot pay for gas|not enough (?:gas|BOING|funds)|underpriced/;

const SLOW_RPC_RE =
  /timeout|timed out|time out|headers timeout|timeoutError|etimedout|econnreset|econnrefused|enotfound|failed to fetch|network error|network blocked|json-rpc.*timeout|rpc(?:\s|_|-)?(?:timeout|unavailable|error)|gateway time-out|too many requests|rate limit|temporarily unavailable|connection refused|could not connect|aborterror|the user aborted|fetch failed/;

function readCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number" || typeof code === "string")
      return String(code);
  }
  return "";
}

export function rawWalletErrorText(error: unknown): string {
  if (error instanceof Error) {
    const extra = readCode(error);
    const name = error.name && error.name !== "Error" ? error.name : "";
    return [error.message, name, extra].filter(Boolean).join(" ");
  }
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const body = error as {
      message?: unknown;
      code?: unknown;
      data?: { message?: unknown };
    };
    return [body.message, body.code, body.data?.message]
      .filter((value) => value != null && String(value).length > 0)
      .join(" ");
  }
  return "";
}

export function classifyWalletError(error: unknown): WalletFeedback {
  const text = rawWalletErrorText(error);
  const code = readCode(error);
  const haystack = `${text} ${code}`.toLowerCase();

  if (
    code === "4001" ||
    code === "action_rejected" ||
    DECLINED_RE.test(haystack)
  ) {
    return {
      kind: "declined",
      message: "Signature declined. You can retry when you're ready.",
      retryable: true,
    };
  }
  if (LOW_GAS_RE.test(haystack)) {
    return {
      kind: "low-gas",
      message:
        "Not enough gas to send this transaction. Add a little testnet BOING and retry.",
      retryable: true,
    };
  }
  if (
    (error instanceof Error && error.name === "TimeoutError") ||
    SLOW_RPC_RE.test(haystack)
  ) {
    return {
      kind: "slow-rpc",
      message: "The network is responding slowly. Retry in a moment.",
      retryable: true,
    };
  }
  return {
    kind: "other",
    message:
      (error instanceof Error ? error.message : text).trim() ||
      "Something went wrong. Please retry.",
    retryable: false,
  };
}
