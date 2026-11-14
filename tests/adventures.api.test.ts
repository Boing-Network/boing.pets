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
  ONCHAIN_ITEMS,
  mtBalanceStorageKey,
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

let db: DatabaseSync;
let env: Parameters<typeof app.fetch>[1];
const origin = "http://localhost:5177";
const fixtureKey = new Uint8Array(32).fill(7);
const adminKey = new Uint8Array(32).fill(3);
const CONTRACT = "0x" + "07".repeat(32);
let owner = "";
let admin = "";

async function request(
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) {
    headers.origin = origin;
    headers["content-type"] = "application/json";
  }
  return app.fetch(
    new Request(
      origin + path,
      body === undefined
        ? Object.keys(headers).length
          ? { headers }
          : undefined
        : {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          },
    ),
    env,
  );
}

async function signConfirm(message: string, key: Uint8Array = fixtureKey) {
  return (
    "0x" +
    bytesToHex(
      await ed.signAsync(blake3(new TextEncoder().encode(message)), key),
    )
  );
}

async function sessionToken(key: Uint8Array = fixtureKey) {
  const ow = "0x" + bytesToHex(await ed.getPublicKeyAsync(key));
  const ch = await request("/api/social/session/challenge", { owner: ow });
  const c = (await ch.json()) as { id: string; message: string };
  const conf = await request("/api/social/session/confirm", {
    id: c.id,
    signature: await signConfirm(c.message, key),
  });
  expect(conf.status).toBe(200);
  return ((await conf.json()) as { token: string }).token;
}

beforeEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKey));
  admin = "0x" + bytesToHex(await ed.getPublicKeyAsync(adminKey));
  db = new DatabaseSync(":memory:");
  const dir = new NodeURL("../migrations/", import.meta.url);
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(new NodeURL(file, dir), "utf8"));
  }
  const adapter = {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (statements: Statement[]) => {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        db.exec("COMMIT");
        return results;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  env = {
    DB: adapter as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("assets") } as unknown as Fetcher,
    RPC_URL: "https://rpc.example",
    APP_ORIGIN: origin,
    MARKET_WRITES: "on",
    PLAZA: {
      getByName: () => ({
        fetch: async () => new Response("plaza stub"),
      }),
    } as unknown as Env["PLAZA"],
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  db.close();
});

describe("idle adventures API", () => {
  it("lists rates without a session, including Style Luck and diminishing", async () => {
    const res = await request("/api/adventures/rates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rates: {
        pityCap: number;
        pityGrants: string;
        noPityFor: string[];
        weightTotal: number;
        styleLuck: { multiplierCap: number };
        diminishing: { dailyCap: number };
        locations: { id: string }[];
        durations: { minutes: number }[];
      };
    };
    expect(body.rates.pityCap).toBe(40);
    expect(body.rates.pityGrants).toBe("legendary");
    expect(body.rates.noPityFor).toEqual(["mythic", "iconic"]);
    expect(body.rates.weightTotal).toBe(1_000_000);
    expect(body.rates.styleLuck.multiplierCap).toBe(2.25);
    expect(body.rates.diminishing.dailyCap).toBe(6);
    expect(body.rates.durations.map((row) => row.minutes)).toEqual([
      45, 180, 480, 1_440, 4_320,
    ]);
    expect(body.rates.locations.map((row) => row.id)).toContain(
      "the-lost-drop",
    );
  });

  it("ignores a client-supplied clock and only completes on the server timer", async () => {
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };
    const start = await request(
      "/api/adventures/start",
      {
        owner,
        location_id: "night-market",
        duration_id: "quick",
        now: Date.now() + 86_400_000,
      },
      auth,
    );
    expect(start.status).toBe(200);
    const started = (await start.json()) as {
      run: { id: string; status: string; endsAt: number };
      preview: { outcomes: { fail: number } };
    };
    expect(started.run.status).toBe("running");
    expect(started.run.endsAt).toBeGreaterThan(Date.now() + 30 * 60_000);
    expect(started.preview.outcomes.fail).toBeGreaterThan(0);
    const early = await request(
      "/api/adventures/claim",
      {
        owner,
        run_id: started.run.id,
        now: Date.now() + 86_400_000,
      },
      auth,
    );
    expect(early.status).toBe(425);
  });

  it("returns a Style Luck preview and refuses a locked Lost Drop", async () => {
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };
    const listed = await request(
      `/api/adventures?owner=${owner}`,
      undefined,
      auth,
    );
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      preview: { locationId: string; durationId: string; available: boolean }[];
      styleLuck: { multiplier: number };
    };
    expect(body.styleLuck.multiplier).toBeGreaterThanOrEqual(1);
    expect(
      body.preview.some(
        (row) => row.locationId === "the-lost-drop" && row.available === false,
      ),
    ).toBe(true);
    const blocked = await request(
      "/api/adventures/start",
      { owner, location_id: "the-lost-drop", duration_id: "quick" },
      auth,
    );
    expect(blocked.status).toBe(403);
  });

  it("lazily completes, claims once, and stays idempotent", async () => {
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };
    const start = await request(
      "/api/adventures/start",
      { owner, location_id: "rooftop-sessions", duration_id: "quick" },
      auth,
    );
    expect(start.status).toBe(200);
    const started = (await start.json()) as { run: { id: string } };
    db.prepare("UPDATE adventure_runs SET ends_at=? WHERE id=?").run(
      Date.now() - 1,
      started.run.id,
    );

    const first = await request(
      "/api/adventures/claim",
      { owner, run_id: started.run.id, claim_id: "claim-repeat" },
      auth,
    );
    expect(first.status).toBe(200);
    const claimed = (await first.json()) as {
      run: {
        status: string;
        outcome: string;
        rewards: { qty: number; kind: string; currency?: string }[];
      };
      idempotent: boolean;
    };
    expect(claimed.idempotent).toBe(false);
    expect(claimed.run.status).toBe("claimed");
    expect(["fail", "partial", "success", "bonus"]).toContain(
      claimed.run.outcome,
    );
    expect(claimed.run.rewards.length).toBeGreaterThan(0);

    const ledger = db
      .prepare(
        "SELECT COALESCE(SUM(delta),0) AS n FROM ledger WHERE owner=? AND reason='adventure-claim'",
      )
      .get(owner) as { n: number };
    const inv = db
      .prepare("SELECT COALESCE(SUM(qty),0) AS n FROM inventory WHERE owner=?")
      .get(owner) as { n: number };

    const second = await request(
      "/api/adventures/claim",
      { owner, run_id: started.run.id, claim_id: "claim-repeat" },
      auth,
    );
    expect(second.status).toBe(200);
    const again = (await second.json()) as {
      idempotent: boolean;
      run: { status: string };
    };
    expect(again.idempotent).toBe(true);
    const ledgerAfter = db
      .prepare(
        "SELECT COALESCE(SUM(delta),0) AS n FROM ledger WHERE owner=? AND reason='adventure-claim'",
      )
      .get(owner) as { n: number };
    const invAfter = db
      .prepare("SELECT COALESCE(SUM(qty),0) AS n FROM inventory WHERE owner=?")
      .get(owner) as { n: number };
    expect(ledgerAfter.n).toBe(ledger.n);
    expect(invAfter.n).toBe(inv.n);
  });

  it("claims every ready run through claim-all", async () => {
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };
    db.prepare(
      "INSERT INTO adventure_milestones(owner,completed_count,slots,updated_at) VALUES(?,?,?,?)",
    ).run(owner, 5, 2, Date.now());
    const first = await request(
      "/api/adventures/start",
      { owner, location_id: "night-market", duration_id: "quick" },
      auth,
    );
    const second = await request(
      "/api/adventures/start",
      { owner, location_id: "underground-show", duration_id: "quick" },
      auth,
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = (await first.json()) as { run: { id: string } };
    const b = (await second.json()) as { run: { id: string } };
    const past = Date.now() - 1;
    db.prepare("UPDATE adventure_runs SET ends_at=? WHERE id IN (?,?)").run(
      past,
      a.run.id,
      b.run.id,
    );
    const res = await request("/api/adventures/claim-all", { owner }, auth);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(2);
  });

  it("mints a mapped reward through the operator queue on a fixture RPC", async () => {
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };
    Object.assign(env, {
      MULTI_TOKEN_CONTRACT: CONTRACT,
      MULTI_TOKEN_ADMIN_SECRET_KEY: bytesToHex(adminKey),
    });
    const submitted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        const { method, params } = JSON.parse(String(init?.body || "{}")) as {
          method: string;
          params: unknown[];
        };
        submitted.push(method);
        const ok = (result: unknown) =>
          Response.json({ jsonrpc: "2.0", id: 1, result });
        if (method === "boing_getContractStorage") {
          const key = String(params[1]);
          if (key === MT_ADMIN_STORAGE_KEY) return ok({ value: admin });
          const operatorKeys = new Set(
            ONCHAIN_ITEMS.map((item) =>
              mtBalanceStorageKey(admin, item.itemId),
            ),
          );
          if (operatorKeys.has(key))
            return ok({ value: "0x" + "00".repeat(64) });
          return ok({ value: "0x" + "00".repeat(64) });
        }
        if (method === "boing_getAccount")
          return ok({ nonce: 4, balance: "0" });
        if (method === "boing_submitTransaction") return ok({ tx_hash: "ok" });
        if (method === "boing_getTransactionReceipt") {
          return ok({
            success: true,
            tx_id: params[0],
            block_height: 10,
            tx_index: 0,
          });
        }
        if (method === "boing_getBlockByHeight") {
          return ok({
            height: 10,
            receipts: [
              {
                success: true,
                tx_id: params[0],
                block_height: 10,
                tx_index: 0,
              },
            ],
          });
        }
        return ok(null);
      }),
    );

    const now = Date.now();
    const runId = "run-mint-1";
    const rewardId = "reward-mint-1";
    db.prepare(
      `INSERT INTO adventure_runs(
         id,owner,location_id,duration_id,slot,style_snapshot,started_at,ends_at,
         completed_at,outcome,status,claim_id,claimed_at,seed,diminishing,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,'ready',NULL,NULL,?,?,?)`,
    ).run(
      runId,
      owner,
      "rooftop-sessions",
      "quick",
      1,
      JSON.stringify({
        cosmeticIds: [],
        ownedItemIds: [],
        points: 0,
        rawPoints: 0,
        multiplier: 1,
        sets: [],
        eventIds: [],
        eventTags: [],
        stage: "teen",
        xp: 10,
        adventureBonus: 1,
        luck: 1,
      }),
      now - 60_000,
      now - 1,
      now - 1,
      "success",
      1,
      1,
      now,
    );
    db.prepare(
      `INSERT INTO adventure_rewards(
         id,run_id,owner,kind,game_item_id,currency,qty,rarity,duplicate,
         mint_status,mint_tx,mint_nonce,mint_error,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,0,'pending',NULL,NULL,NULL,?,?)`,
    ).run(
      rewardId,
      runId,
      owner,
      "item",
      "hat-stardust",
      null,
      1,
      "legendary",
      now,
      now,
    );

    const claimed = await request(
      "/api/adventures/claim",
      { owner, run_id: runId, claim_id: "mint-once" },
      auth,
    );
    expect(claimed.status).toBe(200);
    expect(submitted).toContain("boing_submitTransaction");
    const queue = db
      .prepare(
        "SELECT status, tx_hash, admin_nonce, signed_tx FROM operator_mint_queue WHERE reward_id=?",
      )
      .get(rewardId) as {
      status: string;
      tx_hash: string;
      admin_nonce: number;
      signed_tx: string;
    };
    expect(queue.admin_nonce).toBeGreaterThanOrEqual(4);
    expect(queue.signed_tx).toContain("legs");
    expect(["submitted", "minted"]).toContain(queue.status);
    const inv = db
      .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
      .get(owner, "hat-stardust") as { qty: number };
    expect(inv.qty).toBe(1);
  });
});
