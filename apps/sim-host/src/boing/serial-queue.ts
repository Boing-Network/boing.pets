/**
 * One-at-a-time queue for operator transactions. Every mint (creature,
 * artifact, item) and every retry from `drain()` goes through one queue, so
 * two submits never read the same account nonce. Without it, a boot drain
 * that retries several rows while a new mint is queued can sign two txs
 * with the same nonce ("underpriced replacement").
 */
export type SerialQueue = {
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tasks waiting or running. */
  size(): number;
};

export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  let count = 0;
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      count += 1;
      const result = tail.then(task);
      // A failed task must not block the ones after it.
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      void tail.then(() => {
        count -= 1;
      });
      return result;
    },
    size() {
      return count;
    },
  };
}

/**
 * The process-wide queue for operator-signed transactions: the mint edge
 * (new mints and drain retries) and the genesis mint share it.
 */
export const operatorTxQueue: SerialQueue = createSerialQueue();

/**
 * Wait until the account's committed nonce moves past `usedNonce`, so the
 * next submit (which reads the committed nonce) does not reuse it. Returns
 * false on timeout; the caller keeps the tx hash either way (the tx may
 * still land, and re-submitting could mint twice).
 */
export async function waitForNonceAfter(
  readNonce: () => Promise<bigint>,
  usedNonce: bigint,
  options: {
    timeoutMs?: number;
    pollMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollMs = options.pollMs ?? 1_000;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;
  for (;;) {
    try {
      if ((await readNonce()) > usedNonce) return true;
    } catch {
      // RPC hiccup: keep polling until the deadline.
    }
    if (now() >= deadline) return false;
    await sleep(pollMs);
  }
}
