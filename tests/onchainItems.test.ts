import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import app from "../worker/index";
import {
  MT_ADMIN_STORAGE_KEY,
  mtBalanceStorageKey,
  mtMintCalldata,
  storageWordQty,
} from "../src/content/onchainItems";

class Statement {
  values: SQLInputValue[] = [];
  constructor(
    public db: DatabaseSync,
    public sql: string,
  ) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.values) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.values) };
  }
  async run() {
    return this.db.prepare(this.sql).run(...this.values);
  }
}

const origin = "http://localhost:5177";
const playerKey = new Uint8Array(32).fill(7);
const adminKey = new Uint8Array(32).fill(3);
const CONTRACT = "0x" + "07".repeat(32);
let db: DatabaseSync;
let env: Parameters<typeof app.fetch>[1];
let owner = "";
let admin = "";
let rpcState: {
  adminWord: string;
  nonce: number;
  simulate: { success: boolean; error?: string };
  submitError: { code: number; message: string } | null;
  receipt: { success: boolean; error?: string } | null;
  balance: number;
  calls: string[];
};

async function post(path: string, body: unknown) {
  return app.fetch(
    new Request(origin + path, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}
const get = (path: string) => app.fetch(new Request(origin + path), env);

async function sign(message: string) {
  return (
    "0x" +
    bytesToHex(
      await ed.signAsync(blake3(new TextEncoder().encode(message)), playerKey),
    )
  );
}

function inventoryQty(item: string) {
  const row = db
    .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
    .get(owner, item) as { qty: number } | undefined;
  return row?.qty ?? 0;
}

async function withdraw(qty: number, item = "ore-spark") {
  const ch = await post("/api/items/withdraw/challenge", {
    owner,
    game_item_id: item,
    qty,
  });
  expect(ch.status).toBe(200);
  const c = (await ch.json()) as { id: string; message: string };
  expect(c.message).toContain(`Quantity: ${qty}`);
  return post("/api/items/withdraw/confirm", {
    id: c.id,
    signature: await sign(c.message),
  });
}

beforeEach(async () => {
  owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(playerKey));
  admin = "0x" + bytesToHex(await ed.getPublicKeyAsync(adminKey));
  db = new DatabaseSync(":memory:");
  const dir = new NodeURL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir)
    .filter((n) => /^00(0\d|1\d|20|22)_.*\.sql$/.test(n))
    .sort())
    db.exec(readFileSync(new NodeURL(f, dir), "utf8"));
  db.prepare("INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?)").run(
    owner,
    "ore-spark",
    5,
  );
  rpcState = {
    adminWord: admin,
    nonce: 7,
    simulate: { success: true },
    submitError: null,
    receipt: null,
    balance: 0,
    calls: [],
  };
  env = {
    DB: {
      prepare: (sql: string) => new Statement(db, sql),
      batch: async (statements: Statement[]) => {
        db.exec("BEGIN");
        try {
          for (const s of statements) await s.run();
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    APP_ORIGIN: origin,
    RPC_URL: "https://testnet-rpc.boing.network",
    MULTI_TOKEN_CONTRACT: CONTRACT,
    MULTI_TOKEN_ADMIN_SECRET_KEY: bytesToHex(adminKey),
    ASSETS: { fetch: async () => new Response("ok") },
    PLAZA: { getByName: () => ({ fetch: async () => new Response("ok") }) },
  } as unknown as Parameters<typeof app.fetch>[1];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      const { method, params } = JSON.parse(String(init?.body || "{}")) as {
        method: string;
        params: unknown[];
      };
      rpcState.calls.push(method);
      const ok = (result: unknown) =>
        Response.json({ jsonrpc: "2.0", id: 1, result });
      if (method === "boing_getContractStorage") {
        const key = String(params[1]);
        if (key === MT_ADMIN_STORAGE_KEY)
          return ok({ value: rpcState.adminWord });
        return ok({
          value: "0x" + rpcState.balance.toString(16).padStart(64, "0"),
        });
      }
      if (method === "boing_getAccount")
        return ok({ nonce: rpcState.nonce, balance: "0" });
      if (method === "boing_simulateTransaction") return ok(rpcState.simulate);
      if (method === "boing_submitTransaction") {
        if (rpcState.submitError)
          return Response.json({
            jsonrpc: "2.0",
            id: 1,
            error: rpcState.submitError,
          });
        return ok({ tx_hash: "ok" });
      }
      if (method === "boing_getTransactionReceipt") return ok(rpcState.receipt);
      return ok(null);
    }),
  );
});

afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
});

describe("on-chain item encoders", () => {
  it("encodes mint calldata and balance keys like the reference contract", () => {
    const cd = mtMintCalldata("0x" + "ab".repeat(32), 2, 40);
    expect(cd.length).toBe(128);
    expect(cd[31]).toBe(0x22);
    expect(cd[32]).toBe(0xab);
    expect(cd[95]).toBe(2);
    expect(cd[127]).toBe(40);
    // zero account, item 0 -> the XOR tag itself
    const tag = Array.from("BOING_REFMT_BAL_V1", (ch) =>
      ch.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");
    expect(mtBalanceStorageKey("0x" + "00".repeat(32), 0)).toBe(
      "0x" + tag.padEnd(64, "0"),
    );
    expect(storageWordQty({ value: "0x" + "00".repeat(31) + "3c" })).toBe(60);
  });
});

describe("on-chain item withdrawals", () => {
  it("is disabled without operator config", async () => {
    (env as unknown as Record<string, unknown>).MULTI_TOKEN_ADMIN_SECRET_KEY =
      undefined;
    const res = await get("/api/items/onchain?owner=" + owner);
    expect(((await res.json()) as { enabled: boolean }).enabled).toBe(false);
    const ch = await post("/api/items/withdraw/challenge", {
      owner,
      game_item_id: "ore-spark",
      qty: 1,
    });
    expect(ch.status).toBe(503);
    expect(rpcState.calls).toEqual([]);
  });

  it("debits inventory, mints, and settles as minted", async () => {
    const res = await withdraw(3);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      withdrawal: { status: string; tx_hash: string };
    };
    expect(body.withdrawal.status).toBe("submitted");
    expect(body.withdrawal.tx_hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(inventoryQty("ore-spark")).toBe(2);
    const row = db
      .prepare("SELECT admin_nonce, status FROM onchain_withdrawals")
      .get() as {
      admin_nonce: number;
      status: string;
    };
    expect(row).toEqual({ admin_nonce: 7, status: "submitted" });
    expect(rpcState.calls).toContain("boing_simulateTransaction");

    rpcState.receipt = { success: true };
    rpcState.balance = 3;
    const status = (await (
      await get("/api/items/onchain?owner=" + owner)
    ).json()) as {
      items: Array<{
        gameItemId: string;
        offchain_qty: number;
        onchain_qty: number;
      }>;
      withdrawals: Array<{ status: string }>;
    };
    expect(status.withdrawals[0]!.status).toBe("minted");
    const spark = status.items.find((i) => i.gameItemId === "ore-spark")!;
    expect(spark).toMatchObject({ offchain_qty: 2, onchain_qty: 3 });
  });

  it("queues a second mint on the next operator nonce", async () => {
    expect((await withdraw(1)).status).toBe(200);
    expect((await withdraw(1)).status).toBe(200);
    const nonces = db
      .prepare(
        "SELECT admin_nonce FROM onchain_withdrawals ORDER BY admin_nonce",
      )
      .all();
    expect(nonces).toEqual([{ admin_nonce: 7 }, { admin_nonce: 8 }]);
    expect(inventoryQty("ore-spark")).toBe(3);
  });

  it("refuses to overdraw and leaves inventory untouched", async () => {
    const ch = await post("/api/items/withdraw/challenge", {
      owner,
      game_item_id: "ore-spark",
      qty: 6,
    });
    expect(ch.status).toBe(409);
    const ok = await post("/api/items/withdraw/challenge", {
      owner,
      game_item_id: "ore-spark",
      qty: 5,
    });
    const c = (await ok.json()) as { id: string; message: string };
    db.prepare("UPDATE inventory SET qty=1 WHERE owner=?").run(owner);
    const res = await post("/api/items/withdraw/confirm", {
      id: c.id,
      signature: await sign(c.message),
    });
    expect(res.status).toBe(409);
    expect(inventoryQty("ore-spark")).toBe(1);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM onchain_withdrawals").get(),
    ).toEqual({ n: 0 });
    expect(rpcState.calls).not.toContain("boing_submitTransaction");
  });

  it("refunds when the network rejects the mint", async () => {
    rpcState.submitError = {
      code: -32000,
      message: "Insufficient balance for fee",
    };
    const res = await withdraw(2);
    expect(res.status).toBe(502);
    expect(inventoryQty("ore-spark")).toBe(5);
    expect(db.prepare("SELECT status FROM onchain_withdrawals").get()).toEqual({
      status: "refunded",
    });
  });

  it("refunds exactly once when the mint is dropped", async () => {
    expect((await withdraw(2)).status).toBe(200);
    rpcState.nonce = 8; // operator nonce moved on, no receipt
    await get("/api/items/onchain?owner=" + owner);
    await get("/api/items/onchain?owner=" + owner);
    expect(inventoryQty("ore-spark")).toBe(5);
    expect(db.prepare("SELECT status FROM onchain_withdrawals").get()).toEqual({
      status: "refunded",
    });
  });

  it("pauses when the operator key is not the contract admin", async () => {
    rpcState.adminWord = "0x" + "99".repeat(32);
    const res = await withdraw(1);
    expect(res.status).toBe(503);
    expect(inventoryQty("ore-spark")).toBe(5);
  });

  it("rejects a forged signature", async () => {
    const ch = await post("/api/items/withdraw/challenge", {
      owner,
      game_item_id: "ore-spark",
      qty: 1,
    });
    const c = (await ch.json()) as { id: string };
    const res = await post("/api/items/withdraw/confirm", {
      id: c.id,
      signature: "0x" + "11".repeat(64),
    });
    expect(res.status).toBe(403);
    expect(inventoryQty("ore-spark")).toBe(5);
  });
});
