/**
 * Shared JSON-RPC helper for the Boing testnet.
 *
 * Public content GETs (collections, leaderboards, dailies, pasture lists)
 * must not wait on RPC. Callers that do need the chain should go through
 * this helper so a blocked official RPC times out quickly, falls back to
 * the public gateway, and never fans out unbounded in-flight requests.
 */
export const OFFICIAL_RPC_URL = "https://testnet-rpc.boing.network";
export const GATEWAY_RPC_URL =
  "https://boing-public-rpc-gateway.nico-chikuji.workers.dev";
export const DEFAULT_RPC_TIMEOUT_MS = 6_000;
export const RPC_MAX_CONCURRENT = 4;

export class RpcRejected extends Error {
  constructor(
    public code: number,
    message: string,
    public data: unknown,
  ) {
    super(message);
  }
}

export class RpcUnavailable extends Error {
  constructor(message = "Testnet RPC is unavailable") {
    super(message);
  }
}

type RpcEnv = { RPC_URL: string };

let inFlight = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inFlight < RPC_MAX_CONCURRENT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      inFlight += 1;
      resolve();
    });
  });
}

function releaseSlot() {
  inFlight = Math.max(0, inFlight - 1);
  const next = waiters.shift();
  if (next) next();
}

/** Test-only: drain the concurrency gate between cases. */
export function resetRpcGate() {
  inFlight = 0;
  waiters.length = 0;
}

export function rpcUrls(env: RpcEnv): string[] {
  const urls: string[] = [];
  const primary = (env.RPC_URL || "").trim().replace(/\/$/, "");
  if (primary) urls.push(primary);
  const gateway = GATEWAY_RPC_URL.replace(/\/$/, "");
  if (!urls.includes(gateway)) urls.push(gateway);
  return urls;
}

async function readRpcJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty RPC response");
  const decoder = new TextDecoder();
  let text = "",
    size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("RPC response exceeds 4 MiB");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}

async function fetchRpc(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<unknown> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error("HTTP error");
  return readRpcJson(r);
}

/**
 * Call a boing_* method. Tries env.RPC_URL first, then the public gateway
 * if the official endpoint times out, fails, or is blocked. A JSON-RPC
 * error from a reachable node is not retried (it is a valid response).
 */
export async function rpc<T>(
  env: RpcEnv,
  method: string,
  params: unknown[] = [],
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
): Promise<T> {
  const endpoints = rpcUrls(env);
  let lastError: unknown;
  await acquireSlot();
  try {
    for (const url of endpoints) {
      try {
        const body = (await fetchRpc(url, method, params, timeoutMs)) as {
          result?: T;
          error?: { code?: number; message?: string; data?: unknown };
        };
        if (body.error) {
          throw new RpcRejected(
            Number(body.error.code ?? 0),
            String(body.error.message ?? "RPC rejected request"),
            body.error.data,
          );
        }
        if (body.result === undefined) throw new Error("RPC rejected request");
        return body.result;
      } catch (error) {
        if (error instanceof RpcRejected) throw error;
        lastError = error;
      }
    }
  } finally {
    releaseSlot();
  }
  throw lastError instanceof Error ? lastError : new RpcUnavailable();
}

/** Run `fn` over items with a cap on in-flight work (no unbounded fan-out). */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const cap = Math.max(1, Math.min(limit, items.length || 1));
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array.from({ length: Math.min(cap, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return out;
}
