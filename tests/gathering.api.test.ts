import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToHex } from "@noble/hashes/utils";
import app from "../worker/index";
import { resetRpcGate } from "../worker/rpc";
import { GATHER_PACK_UNITS } from "../src/content/gathering";

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
const owner = "0x" + "ab".repeat(32);
let db: DatabaseSync;
let env: Parameters<typeof app.fetch>[1];
let now = 1_700_000_000_000;

async function request(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return app.fetch(
    new Request(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        "content-type": "application/json",
        authorization: "Bearer quarry-session",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

beforeEach(() => {
  now = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  db = new DatabaseSync(":memory:");
  const dir = new NodeURL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(new NodeURL(file, dir), "utf8"));
  }
  db.prepare("INSERT INTO pets(owner, hatch_tx, created_at) VALUES(?,?,?)").run(
    owner,
    "0x" + "11".repeat(32),
    now,
  );
  db.prepare(
    "INSERT INTO social_session_tokens(token, owner, created_at, expires_at) VALUES(?,?,?,?)",
  ).run("quarry-session", owner, now, now + 60 * 60_000);
  env = {
    DB: {
      prepare: (sql: string) => new Statement(db, sql),
      batch: async (statements: Statement[]) => {
        db.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements)
            results.push(await statement.run());
          db.exec("COMMIT");
          return results;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
    APP_ORIGIN: origin,
    MARKET_WRITES: "on",
    GATHER_QUARRY: "on",
    GATHER_MINT: "on",
    RPC_URL: "https://testnet-rpc.boing.network",
    ASSETS: { fetch: async () => new Response("ok") },
    PLAZA: { getByName: () => ({ fetch: async () => new Response("ok") }) },
  } as unknown as Parameters<typeof app.fetch>[1];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetRpcGate();
  db.close();
});

describe("quarry API", () => {
  it("stays closed when the flag is off", async () => {
    (env as { GATHER_QUARRY: string }).GATHER_QUARRY = "off";
    (env as { GATHER_MINT: string }).GATHER_MINT = "off";
    const status = await request("/api/gather/status");
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      enabled: false,
      mintEnabled: false,
    });
    const start = await request("/api/gather/start", { owner });
    expect(start.status).toBe(403);
  });

  it("does not trust a client tick count", async () => {
    const start = await request("/api/gather/start", {
      owner,
      ticks: 500,
      elapsed: 999_999,
    });
    expect(start.status).toBe(200);
    const opened = (await start.json()) as {
      session: { ticksSettled: number; tickMs: number; status: string };
    };
    expect(opened.session.ticksSettled).toBe(0);
    expect(opened.session.status).toBe("running");
    const early = await request("/api/gather/settle", {
      owner,
      ticks: 9_999,
      elapsed: 9_999_999,
    });
    expect(early.status).toBe(200);
    const still = (await early.json()) as { session: { ticksSettled: number } };
    expect(still.session.ticksSettled).toBe(0);
    now += opened.session.tickMs;
    const once = await request("/api/gather/settle", { owner, ticks: 40 });
    const body = (await once.json()) as {
      session: { ticksSettled: number };
      pack: { units: number };
    };
    expect(body.session.ticksSettled).toBe(1);
    expect(body.pack.units).toBeLessThanOrEqual(1);
    const again = await request("/api/gather/settle", { owner, ticks: 40 });
    const same = (await again.json()) as { session: { ticksSettled: number } };
    expect(same.session.ticksSettled).toBe(1);
  });

  it("never puts more than 28 in the pack", async () => {
    const start = await request("/api/gather/start", { owner });
    expect(start.status).toBe(200);
    now += 6 * 60_000;
    const settled = await request("/api/gather/settle", { owner });
    const body = (await settled.json()) as {
      pack: { units: number };
      session: { status: string } | null;
    };
    expect(body.pack.units).toBeLessThanOrEqual(GATHER_PACK_UNITS);
    const full = db
      .prepare(
        "SELECT COALESCE(SUM(qty),0) AS n FROM gather_backpack WHERE owner=?",
      )
      .get(owner) as { n: number };
    expect(full.n).toBeLessThanOrEqual(GATHER_PACK_UNITS);
    if (full.n >= GATHER_PACK_UNITS) {
      expect(body.session?.status).toBe("packed");
    }
  });

  it("caps Cred at 80 banked units and keeps the rest as items", async () => {
    const insert = db.prepare(
      "INSERT INTO gather_backpack(owner, item_id, qty) VALUES(?,?,?)",
    );
    let paid = 0;
    for (let round = 0; round < 4; round++) {
      insert.run(owner, "ore-pebble", 28);
      const bank = await request("/api/gather/bank", { owner });
      expect(bank.status).toBe(200);
      const body = (await bank.json()) as {
        credGained: number;
        pack: { units: number };
      };
      paid += body.credGained;
      expect(body.pack.units).toBe(0);
    }
    expect(paid).toBe(80);
    const inv = db
      .prepare(
        "SELECT qty FROM inventory WHERE owner=? AND item_id='ore-pebble'",
      )
      .get(owner) as { qty: number };
    expect(inv.qty).toBe(112);
    const cred = db
      .prepare(
        "SELECT COALESCE(SUM(delta),0) AS n FROM ledger WHERE owner=? AND reason='gather_bank'",
      )
      .get(owner) as { n: number };
    expect(cred.n).toBe(80);
  });

  it("refuses minting when the flag is off and does not move the bank", async () => {
    (env as { GATHER_MINT: string }).GATHER_MINT = "off";
    db.prepare("INSERT INTO inventory(owner, item_id, qty) VALUES(?,?,?)").run(
      owner,
      "ore-pebble",
      100,
    );
    const mint = await request("/api/gather/mint", {
      owner,
      itemId: "ore-pebble",
      qty: 10,
      clientKey: "mint-key-1",
    });
    expect(mint.status).toBe(403);
    const inv = db
      .prepare(
        "SELECT qty FROM inventory WHERE owner=? AND item_id='ore-pebble'",
      )
      .get(owner) as { qty: number };
    expect(inv.qty).toBe(100);
    const queued = db
      .prepare("SELECT COUNT(*) AS n FROM gather_mint_queue")
      .get() as { n: number };
    expect(queued.n).toBe(0);
  });

  it("does not debit when the mint operator is not configured", async () => {
    db.prepare("INSERT INTO inventory(owner, item_id, qty) VALUES(?,?,?)").run(
      owner,
      "ore-pebble",
      100,
    );
    const mint = await request("/api/gather/mint", {
      owner,
      itemId: "ore-pebble",
      qty: 10,
      clientKey: "mint-key-1",
    });
    expect(mint.status).toBe(503);
    const inv = db
      .prepare(
        "SELECT qty FROM inventory WHERE owner=? AND item_id='ore-pebble'",
      )
      .get(owner) as { qty: number };
    expect(inv.qty).toBe(100);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM gather_mint_queue").get(),
    ).toEqual({ n: 0 });
  });

  it("debits the bank, shares the operator nonce, and credits minted balance on receipt", async () => {
    const record = env as unknown as Record<string, string>;
    record.MULTI_TOKEN_CONTRACT = "0x" + "12".repeat(32);
    record.MULTI_TOKEN_ADMIN_SECRET_KEY = bytesToHex(
      new Uint8Array(32).fill(4),
    );
    db.prepare("INSERT INTO inventory(owner, item_id, qty) VALUES(?,?,?)").run(
      owner,
      "ore-pebble",
      100,
    );
    db.prepare(
      `INSERT INTO gather_mint_queue(
         id, client_key, owner, game_item_id, item_id, qty, admin_nonce,
         status, attempts, created_at, updated_at
       ) VALUES('hold','hold-key-01',?,'ore-spark',2,1,20,'submitted',0,?,?)`,
    ).run(owner, now, now);
    let receipt: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const { method, params } = JSON.parse(String(init?.body || "{}")) as {
          method: string;
          params?: unknown[];
        };
        const ok = (result: unknown) =>
          Response.json({ jsonrpc: "2.0", id: 1, result });
        if (method === "boing_getAccount") {
          return ok({ nonce: 4, balance: "1000000000000000000" });
        }
        if (method === "boing_getContractStorage") {
          return ok({ value: "0x" + "0".repeat(64) });
        }
        if (method === "boing_simulateTransaction")
          return ok({ success: true });
        if (method === "boing_submitTransaction") return ok({ tx_hash: "ok" });
        if (method === "boing_getTransactionReceipt") {
          const hash = String(params?.[0] ?? "");
          return ok(receipt ? { ...receipt, tx_id: hash } : null);
        }
        if (method === "boing_getBlockByHeight") return ok(null);
        return ok(null);
      }),
    );
    const mint = await request("/api/gather/mint", {
      owner,
      itemId: "ore-pebble",
      qty: 10,
      clientKey: "mint-key-1",
    });
    expect(mint.status).toBe(200);
    const body = (await mint.json()) as {
      mint: { status: string; qty: number };
    };
    expect(body.mint).toMatchObject({ status: "submitted", qty: 10 });
    expect(
      db
        .prepare(
          "SELECT qty FROM inventory WHERE owner=? AND item_id='ore-pebble'",
        )
        .get(owner),
    ).toEqual({ qty: 90 });
    const again = await request("/api/gather/mint", {
      owner,
      itemId: "ore-pebble",
      qty: 10,
      clientKey: "mint-key-1",
    });
    expect(again.status).toBe(200);
    expect(
      db
        .prepare(
          "SELECT qty FROM inventory WHERE owner=? AND item_id='ore-pebble'",
        )
        .get(owner),
    ).toEqual({ qty: 90 });
    expect(
      db
        .prepare(
          "SELECT admin_nonce, status FROM gather_mint_queue WHERE client_key='mint-key-1'",
        )
        .get(),
    ).toEqual({ admin_nonce: 21, status: "submitted" });

    receipt = { success: true };
    const status = await request("/api/gather/status?owner=" + owner);
    expect(status.status).toBe(200);
    expect(
      db
        .prepare(
          "SELECT qty FROM item_mint_balance WHERE owner=? AND item_id='ore-pebble'",
        )
        .get(owner),
    ).toEqual({ qty: 10 });
    expect(
      db
        .prepare(
          "SELECT status FROM gather_mint_queue WHERE client_key='mint-key-1'",
        )
        .get(),
    ).toEqual({ status: "minted" });
    expect(
      db
        .prepare(
          "SELECT qty FROM inventory WHERE owner=? AND item_id='ore-pebble'",
        )
        .get(owner),
    ).toEqual({ qty: 90 });
  });

  it("refunds the bank when the mint does not submit", async () => {
    const record = env as unknown as Record<string, string>;
    record.MULTI_TOKEN_CONTRACT = "0x" + "12".repeat(32);
    record.MULTI_TOKEN_ADMIN_SECRET_KEY = bytesToHex(
      new Uint8Array(32).fill(4),
    );
    db.prepare("INSERT INTO inventory(owner, item_id, qty) VALUES(?,?,?)").run(
      owner,
      "ore-pebble",
      100,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const { method } = JSON.parse(String(init?.body || "{}")) as {
          method: string;
        };
        const ok = (result: unknown) =>
          Response.json({ jsonrpc: "2.0", id: 1, result });
        if (method === "boing_getAccount") {
          return ok({ nonce: 4, balance: "1000000000000000000" });
        }
        if (method === "boing_getContractStorage") {
          return ok({ value: "0x" + "0".repeat(64) });
        }
        if (method === "boing_simulateTransaction")
          return ok({ success: true });
        if (method === "boing_submitTransaction") {
          return Response.json({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32000, message: "Insufficient balance for fee" },
          });
        }
        return ok(null);
      }),
    );
    const mint = await request("/api/gather/mint", {
      owner,
      itemId: "ore-pebble",
      qty: 10,
      clientKey: "mint-key-2",
    });
    expect(mint.status).toBe(502);
    expect(
      db
        .prepare(
          "SELECT qty FROM inventory WHERE owner=? AND item_id='ore-pebble'",
        )
        .get(owner),
    ).toEqual({ qty: 100 });
    expect(
      db
        .prepare("SELECT status FROM gather_mint_queue WHERE client_key=?")
        .get("mint-key-2"),
    ).toEqual({ status: "failed" });
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM item_mint_balance").get(),
    ).toEqual({ n: 0 });
    const retry = await request("/api/gather/mint", {
      owner,
      itemId: "ore-pebble",
      qty: 10,
      clientKey: "mint-key-2",
    });
    expect(retry.status).toBe(200);
    expect(
      db
        .prepare(
          "SELECT qty FROM inventory WHERE owner=? AND item_id='ore-pebble'",
        )
        .get(owner),
    ).toEqual({ qty: 100 });
  });

  it("retires the mining doors while the quarry flag is on", async () => {
    const challenge = await request("/api/mining/challenge", { owner });
    expect(challenge.status).toBe(409);
    const attempt = await request("/api/activity/attempt/start", {
      owner,
      activity: "mining",
    });
    expect(attempt.status).toBe(409);
    const fish = await request("/api/activity/attempt/start", {
      owner,
      activity: "fishing",
    });
    expect(fish.status).not.toBe(409);
  });

  it("keeps a wood pick off the high ores", async () => {
    db.prepare(
      "INSERT INTO gather_skills(owner, skill, xp, updated_at) VALUES(?,?,?,?)",
    ).run(owner, "quarry", 101333, now);
    const start = await request("/api/gather/start", { owner });
    expect(start.status).toBe(200);
    const opened = (await start.json()) as { nodes: Array<{ id: string }> };
    expect(opened.nodes.map((node) => node.id)).toEqual([
      "ore-pebble",
      "ore-spark",
    ]);
    now += 6 * 60_000;
    await request("/api/gather/settle", { owner });
    const found = db
      .prepare("SELECT item_id FROM gather_backpack WHERE owner=?")
      .all(owner) as Array<{ item_id: string }>;
    for (const row of found) {
      expect(["ore-pebble", "ore-spark"]).toContain(row.item_id);
    }
  });
});
