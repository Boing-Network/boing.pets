import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GATEWAY_RPC_URL,
  DEFAULT_RPC_TIMEOUT_MS,
  mapPool,
  resetRpcGate,
  rpc,
  rpcUrls,
  RpcRejected,
} from "../worker/rpc";

const PRIMARY = "https://testnet-rpc.boing.network";

afterEach(() => {
  resetRpcGate();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("rpcUrls", () => {
  it("falls back to the public gateway after the configured primary", () => {
    expect(rpcUrls({ RPC_URL: PRIMARY })).toEqual([PRIMARY, GATEWAY_RPC_URL]);
  });

  it("does not duplicate the gateway when it is already primary", () => {
    expect(rpcUrls({ RPC_URL: GATEWAY_RPC_URL })).toEqual([GATEWAY_RPC_URL]);
  });
});

describe("rpc", () => {
  it("uses the official endpoint when it answers", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(String(input));
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method: string;
        };
        expect(body.method).toBe("boing_getNetworkInfo");
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: { chain_id: 6913 },
        });
      },
    );
    const result = await rpc<{ chain_id: number }>(
      { RPC_URL: PRIMARY },
      "boing_getNetworkInfo",
    );
    expect(result).toEqual({ chain_id: 6913 });
    expect(seen).toEqual([PRIMARY]);
  });

  it("falls back to the gateway when the official RPC is blocked", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url === PRIMARY) throw new Error("network blocked");
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { chain_id: 6913, via: "gateway" },
      });
    });
    const result = await rpc<{ chain_id: number; via: string }>(
      { RPC_URL: PRIMARY },
      "boing_getNetworkInfo",
    );
    expect(result).toEqual({ chain_id: 6913, via: "gateway" });
    expect(seen).toEqual([PRIMARY, GATEWAY_RPC_URL]);
  });

  it("times out a hung official RPC and then uses the gateway", async () => {
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === PRIMARY) {
          const signal = init?.signal;
          if (signal?.aborted)
            throw new DOMException("aborted", "TimeoutError");
          await new Promise<void>((_, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "TimeoutError")),
            );
          });
        }
        return Response.json({ jsonrpc: "2.0", id: 1, result: { ok: true } });
      },
    );
    const result = await rpc<{ ok: boolean }>(
      { RPC_URL: PRIMARY },
      "boing_getNetworkInfo",
      [],
      50,
    );
    expect(result).toEqual({ ok: true });
  });

  it("does not retry the gateway when the node returns a JSON-RPC error", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "unknown method" },
      });
    });
    await expect(
      rpc({ RPC_URL: PRIMARY }, "boing_nope"),
    ).rejects.toBeInstanceOf(RpcRejected);
    expect(seen).toEqual([PRIMARY]);
  });
});

describe("mapPool", () => {
  it("caps in-flight work so item reads cannot fan out unbounded", async () => {
    let live = 0;
    let maxLive = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);
    const out = await mapPool(items, 3, async (n) => {
      live += 1;
      maxLive = Math.max(maxLive, live);
      await new Promise((r) => setTimeout(r, 10));
      live -= 1;
      return n * 2;
    });
    expect(out).toEqual(items.map((n) => n * 2));
    expect(maxLive).toBeLessThanOrEqual(3);
  });
});

describe("defaults", () => {
  it("keeps the official RPC timeout well under the old 15s hang", () => {
    expect(DEFAULT_RPC_TIMEOUT_MS).toBeLessThanOrEqual(6_000);
  });
});
