import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import app from "../worker/index";
import { needleAt } from "../src/minigames/fishingGame";

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
let amount = "";
let rpcHash = "";
const origin = "http://localhost:5177";
const fixtureKey = new Uint8Array(32).fill(7);
let owner = "";
let chainId = 6913,
  receiptSuccess = true,
  pending = false;

async function request(
  path: string,
  body?: unknown,
  from = origin,
  extraHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) {
    headers.origin = from;
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
  const sig = await ed.signAsync(
    blake3(new TextEncoder().encode(message)),
    key,
  );
  return "0x" + bytesToHex(sig);
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

async function hatchOwner(key: Uint8Array, hash: string) {
  const ow = "0x" + bytesToHex(await ed.getPublicKeyAsync(key));
  const prev = owner;
  owner = ow;
  const c = await request("/api/challenge", { owner: ow, action: "hatch" });
  expect(c.status).toBe(200);
  const body = (await c.json()) as { id: string; amount: string };
  amount = body.amount;
  rpcHash = hash;
  const conf = await request("/api/confirm", { id: body.id, tx_hash: hash });
  expect(conf.status).toBe(200);
  owner = prev || ow;
  return ow;
}

beforeEach(async () => {
  owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKey));
  db = new DatabaseSync(":memory:");
  for (const file of [
    "../migrations/0001_pasture.sql",
    "../migrations/0002_phase1_progression.sql",
    "../migrations/0003_world_positions.sql",
    "../migrations/0004_economy.sql",
    "../migrations/0005_content_framework.sql",
    "../migrations/0006_social.sql",
    "../migrations/0007_presence_tokens.sql",
    "../migrations/0008_fishing.sql",
    "../migrations/0009_housing.sql",
    "../migrations/0010_sparkles_claim.sql",
    "../migrations/0011_treasure.sql",
    "../migrations/0012_parties.sql",
    "../migrations/0013_gardening.sql",
    "../migrations/0014_cooking.sql",
    "../migrations/0015_mining.sql",
    "../migrations/0016_racing.sql",
    "../migrations/0017_security_hardening.sql",
    "../migrations/0018_pet_care_rollup.sql",
    "../migrations/0019_party_bonuses.sql",
    "../migrations/0020_activity_attempts.sql",
  ]) {
    db.exec(readFileSync(new NodeURL(file, import.meta.url), "utf8"));
  }
  chainId = 6913;
  receiptSuccess = true;
  pending = false;
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
    MARKET_WRITES: "on",
    RPC_URL: "https://testnet-rpc.boing.network",
    ASSETS: { fetch: async () => new Response("ok") },
    PLAZA: { getByName: () => ({ fetch: async () => new Response("ok") }) },
  } as unknown as Parameters<typeof app.fetch>[1];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      const { method } = JSON.parse(String(init?.body || "{}")) as {
        method: string;
      };
      const receipt = {
        tx_id: rpcHash,
        block_height: 101,
        tx_index: 0,
        success: receiptSuccess,
      };
      const result =
        method === "boing_getNetworkInfo"
          ? { chain_id: chainId }
          : method === "boing_chainHeight"
            ? 100
            : method === "boing_getTransactionReceipt"
              ? pending
                ? null
                : receipt
              : {
                  header: { height: 101 },
                  transactions: [
                    {
                      sender: owner,
                      payload: { Transfer: { to: owner, amount } },
                    },
                  ],
                  receipts: [receipt],
                };
      return Response.json({ jsonrpc: "2.0", id: 1, result });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  db.close();
});

describe("activity attempts API", () => {
  it("requires hatch + social session, fails without tx, claims only on success", async () => {
    const ow = await hatchOwner(fixtureKey, "0x" + "11".repeat(32));
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };

    const status0 = await request(
      `/api/activity/attempts/status?activity=fishing&owner=${ow}`,
    );
    expect(status0.status).toBe(200);
    const s0 = (await status0.json()) as {
      remaining: number;
      hatched: boolean;
      dailyCap: number;
    };
    expect(s0.hatched).toBe(true);
    expect(s0.dailyCap).toBe(3);
    expect(s0.remaining).toBe(3);

    const start = await request(
      "/api/activity/attempt/start",
      { owner: ow, activity: "fishing" },
      origin,
      auth,
    );
    expect(start.status).toBe(200);
    const started = (await start.json()) as {
      id: string;
      public: {
        periodMs: number;
        zoneStart: number;
        zoneWidth: number;
        phase: number;
      };
    };

    // Miss: too-early click rejected by play window floor
    const miss = await request(
      "/api/activity/attempt/finish",
      {
        id: started.id,
        owner: ow,
        input: { clickElapsedMs: 100 },
      },
      origin,
      auth,
    );
    expect(miss.status).toBe(200);
    const missed = (await miss.json()) as { ok: boolean; status: string };
    expect(missed.ok).toBe(false);
    expect(missed.status).toBe("failed");

    // Inventory unchanged (no claim path)
    const inv = db
      .prepare("SELECT COUNT(*) AS n FROM inventory WHERE owner=?")
      .get(ow) as { n: number };
    expect(inv.n).toBe(0);

    // Second attempt: hit zone then claim
    const start2 = await request(
      "/api/activity/attempt/start",
      { owner: ow, activity: "fishing" },
      origin,
      auth,
    );
    const s2 = (await start2.json()) as {
      id: string;
      public: {
        periodMs: number;
        zoneStart: number;
        zoneWidth: number;
        phase: number;
      };
    };
    const secret = {
      ...s2.public,
    };
    let hit = 300;
    for (let ms = 250; ms < 8000; ms += 4) {
      const pos = needleAt(ms, secret.periodMs, secret.phase);
      if (
        pos >= secret.zoneStart &&
        pos <= secret.zoneStart + secret.zoneWidth
      ) {
        hit = ms;
        break;
      }
    }
    const finish = await request(
      "/api/activity/attempt/finish",
      { id: s2.id, owner: ow, input: { clickElapsedMs: hit } },
      origin,
      auth,
    );
    expect(finish.status).toBe(200);
    const fin = (await finish.json()) as {
      ok: boolean;
      claim_message?: string;
      reward?: unknown;
    };
    expect(fin.ok).toBe(true);
    expect(fin.claim_message).toBeTruthy();
    // Outcome secrecy: no reward identity before claim
    expect(fin.reward).toBeUndefined();

    const claim = await request("/api/activity/attempt/claim", {
      id: s2.id,
      owner: ow,
      signature: await signConfirm(fin.claim_message!),
    });
    expect(claim.status).toBe(200);
    const claimed = (await claim.json()) as {
      ok: boolean;
      reward: { itemId: string };
    };
    expect(claimed.ok).toBe(true);
    expect(claimed.reward.itemId).toMatch(/^fish-/);

    const inv2 = db
      .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
      .get(ow, claimed.reward.itemId) as { qty: number };
    expect(inv2.qty).toBe(1);
  });

  it("enforces the daily attempt cap and rejects unauthenticated starts", async () => {
    const ow = await hatchOwner(fixtureKey, "0x" + "22".repeat(32));
    const noAuth = await request("/api/activity/attempt/start", {
      owner: ow,
      activity: "mining",
    });
    expect(noAuth.status).toBeGreaterThanOrEqual(401);

    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };
    for (let i = 0; i < 3; i++) {
      const start = await request(
        "/api/activity/attempt/start",
        { owner: ow, activity: "mining" },
        origin,
        auth,
      );
      expect(start.status).toBe(200);
      const body = (await start.json()) as {
        id: string;
        public: { combo: string[] };
      };
      await request(
        "/api/activity/attempt/finish",
        {
          id: body.id,
          owner: ow,
          input: {
            keys: ["x", "x", "x"],
            pressElapsedMs: [10, 20, 30],
          },
        },
        origin,
        auth,
      );
    }
    const blocked = await request(
      "/api/activity/attempt/start",
      { owner: ow, activity: "mining" },
      origin,
      auth,
    );
    expect(blocked.status).toBe(409);
  });

  it("flashes the cook recipe and returns hot-or-cold feedback on a miss", async () => {
    const ow = await hatchOwner(fixtureKey, "0x" + "33".repeat(32));
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };

    const start = await request(
      "/api/activity/attempt/start",
      { owner: ow, activity: "cook" },
      origin,
      auth,
    );
    expect(start.status).toBe(200);
    const started = (await start.json()) as {
      id: string;
      public: {
        ingredients: string[];
        scrambled: string[];
        timeLimitMs: number;
        flashMs: number;
        count: number;
      };
    };
    expect(started.public.flashMs).toBe(2500);
    expect(started.public.timeLimitMs).toBe(8000);
    expect(started.public.ingredients).toHaveLength(started.public.count);
    expect(started.public.scrambled.length).toBeGreaterThanOrEqual(
      started.public.count,
    );

    const missPicked = [...started.public.ingredients].reverse();
    const miss = await request(
      "/api/activity/attempt/finish",
      {
        id: started.id,
        owner: ow,
        input: {
          picked: missPicked,
          pickElapsedMs: missPicked.map(
            (_, i) => started.public.flashMs + 200 + i * 150,
          ),
        },
      },
      origin,
      auth,
    );
    expect(miss.status).toBe(200);
    const missed = (await miss.json()) as {
      ok: boolean;
      status: string;
      feedback?: {
        spots: string[];
        correct: number;
        total: number;
        summary: string;
      };
    };
    expect(missed.ok).toBe(false);
    expect(missed.status).toBe("failed");
    expect(missed.feedback).toBeTruthy();
    expect(missed.feedback!.total).toBe(started.public.count);
    expect(missed.feedback!.summary).toBe(
      `${missed.feedback!.correct} of ${started.public.count} in the right spot`,
    );
    expect(missed.feedback!.spots).toHaveLength(started.public.count);

    const status = await request(
      `/api/activity/attempts/status?activity=cook&owner=${ow}`,
    );
    const st = (await status.json()) as { remaining: number };
    expect(st.remaining).toBe(2);

    const start2 = await request(
      "/api/activity/attempt/start",
      { owner: ow, activity: "cook" },
      origin,
      auth,
    );
    const s2 = (await start2.json()) as {
      id: string;
      public: { ingredients: string[]; flashMs: number };
    };
    const finish = await request(
      "/api/activity/attempt/finish",
      {
        id: s2.id,
        owner: ow,
        input: {
          picked: [...s2.public.ingredients],
          pickElapsedMs: s2.public.ingredients.map(
            (_, i) => s2.public.flashMs + 100 + i * 100,
          ),
        },
      },
      origin,
      auth,
    );
    expect(finish.status).toBe(200);
    const fin = (await finish.json()) as {
      ok: boolean;
      claim_message?: string;
      feedback?: unknown;
    };
    expect(fin.ok).toBe(true);
    expect(fin.claim_message).toBeTruthy();
    expect(fin.feedback).toBeUndefined();
  });

  it("treats a late finish after success as already resolved by this client", async () => {
    const ow = await hatchOwner(fixtureKey, "0x" + "44".repeat(32));
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };

    const start = await request(
      "/api/activity/attempt/start",
      { owner: ow, activity: "garden" },
      origin,
      auth,
    );
    expect(start.status).toBe(200);
    const started = (await start.json()) as {
      id: string;
      public: { targetHoldMs: number };
    };
    const body = {
      id: started.id,
      owner: ow,
      input: { holdMs: started.public.targetHoldMs },
    };
    const finish = await request(
      "/api/activity/attempt/finish",
      body,
      origin,
      auth,
    );
    expect(finish.status).toBe(200);
    const fin = (await finish.json()) as {
      ok: boolean;
      status?: string;
      claim_message?: string;
    };
    expect(fin.ok).toBe(true);
    expect(fin.claim_message).toBeTruthy();

    const replay = await request(
      "/api/activity/attempt/finish",
      body,
      origin,
      auth,
    );
    expect(replay.status).toBe(200);
    const replayed = (await replay.json()) as {
      ok: boolean;
      status?: string;
      claim_message?: string;
      error?: string;
    };
    expect(replayed.ok).toBe(true);
    expect(replayed.status).toBe("success_pending");
    expect(replayed.claim_message).toBe(fin.claim_message);
    expect(replayed.error).toBeUndefined();

    const claim = await request("/api/activity/attempt/claim", {
      id: started.id,
      owner: ow,
      signature: await signConfirm(fin.claim_message!),
    });
    expect(claim.status).toBe(200);

    const afterClaim = await request(
      "/api/activity/attempt/finish",
      body,
      origin,
      auth,
    );
    expect(afterClaim.status).toBe(200);
    const claimed = (await afterClaim.json()) as {
      ok: boolean;
      status?: string;
      claim_message?: string;
      error?: string;
    };
    expect(claimed.ok).toBe(true);
    expect(claimed.status).toBe("claimed");
    expect(claimed.claim_message).toBeUndefined();
    expect(claimed.error).toBeUndefined();
  });
});
