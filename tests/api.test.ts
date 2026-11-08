import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import app from "../worker/index";

// Real SQLite SQL/constraints/transactions, with a minimal D1-shaped adapter.
// No live RPC, wallets, chain writes or Cloudflare resources are used in tests.
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
const origin = "http://localhost:5177",
  tx = "0x" + "ab".repeat(32);
// Disposable deterministic fixture key, NOT a wallet or credential.
const fixtureKey = new Uint8Array(32).fill(7);
let owner = "";
let chainId = 6913,
  receiptSuccess = true,
  pending = false;
async function request(path: string, body?: unknown, from = origin) {
  return app.fetch(
    new Request(
      origin + path,
      body === undefined
        ? undefined
        : {
            method: "POST",
            headers: { origin: from, "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    ),
    env,
  );
}
async function challenge(action: string) {
  const r = await request("/api/challenge", { owner, action });
  expect(r.status).toBe(200);
  const c = (await r.json()) as { id: string; amount: string; message: string };
  amount = c.amount;
  return c;
}
async function hatch() {
  const c = await challenge("hatch");
  const r = await request("/api/confirm", { id: c.id, tx_hash: tx });
  expect(r.status).toBe(200);
  return c;
}
beforeEach(async () => {
  owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKey));
  chainId = 6913;
  rpcHash = tx;
  receiptSuccess = true;
  pending = false;
  db = new DatabaseSync(":memory:");
  for (const file of [
    "../migrations/0001_pasture.sql",
    "../migrations/0002_phase1_progression.sql",
    "../migrations/0003_world_positions.sql",
    "../migrations/0004_economy.sql",
    "../migrations/0005_content_framework.sql",
  ]) {
    db.exec(readFileSync(new NodeURL(file, import.meta.url), "utf8"));
  }
  const adapter = {
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
  };
  env = {
    DB: adapter as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("assets") } as unknown as Fetcher,
    RPC_URL: "https://rpc.example",
    APP_ORIGIN: origin,
    PLAZA: {
      getByName: () => ({
        fetch: async () => new Response("plaza stub"),
      }),
    } as unknown as Env["PLAZA"],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      const { method } = JSON.parse(init.body as string) as { method: string };
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
  db.close();
  vi.unstubAllGlobals();
});
describe("Pets API", () => {
  it("feeds with a fresh committed transaction, once per day", async () => {
    await hatch();
    const c = await challenge("feed");
    rpcHash = "0x" + "cd".repeat(32);
    expect(
      (await request("/api/confirm", { id: c.id, tx_hash: rpcHash })).status,
    ).toBe(200);
    expect(
      (await request("/api/challenge", { owner, action: "feed" })).status,
    ).toBe(409);
    const r = await request("/api/pet?owner=" + owner);
    expect(await r.json()).toMatchObject({
      pet: { state: { streak: 1, fedToday: true, hunger: 100 } },
    });
  });
  it("two pre-issued check-in challenges cannot count the day twice", async () => {
    await hatch();
    const a = await challenge("checkin"),
      b = await challenge("checkin");
    for (const c of [a, b]) {
      const signature =
        "0x" +
        bytesToHex(
          await ed.signAsync(
            blake3(new TextEncoder().encode(c.message)),
            fixtureKey,
          ),
        );
      expect(
        (await request("/api/confirm", { id: c.id, signature })).status,
      ).toBe(c === a ? 200 : 409);
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM events").get()?.n).toBe(2);
  });
  it("browses an empty pasture without authentication", async () => {
    const r = await request("/api/pasture");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ pets: [], next: null });
  });
  it("serves world config for the 3D Starter Town island", async () => {
    const r = await request("/api/world/config");
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      version: number;
      defaultZone: string;
      zones: Array<{ id: string; name: string }>;
    };
    expect(body).toMatchObject({ version: 1, defaultZone: "starter-town" });
    expect(body.zones.map((z) => z.id)).toEqual(
      expect.arrayContaining([
        "starter-town",
        "forest",
        "beach",
        "mountains",
        "city",
        "academy",
      ]),
    );
  });
  it("claims the story hatch quest reward", async () => {
    await hatch();
    const challenge = await request("/api/content/quest/challenge", {
      owner,
      quest_id: "story_first_bounce",
    });
    expect(challenge.status).toBe(200);
    const c = (await challenge.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/content/quest/confirm", {
          id: c.id,
          signature: await signConfirm(c.message),
        })
      ).status,
    ).toBe(200);
    const quests = await (
      await request("/api/content/quests?owner=" + owner)
    ).json();
    expect(quests).toMatchObject({
      quests: expect.arrayContaining([
        expect.objectContaining({
          id: "story_first_bounce",
          complete: true,
          claimed: true,
        }),
      ]),
    });
  });
  it("claims care Boinglets and buys a cosmetic from the catalog", async () => {
    await hatch();
    const challenge = await request("/api/economy/challenge", {
      owner,
      kind: "claim",
    });
    expect(challenge.status).toBe(200);
    const c = (await challenge.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/economy/confirm", {
          id: c.id,
          signature: await signConfirm(c.message),
        })
      ).status,
    ).toBe(200);
    const bal = await (
      await request("/api/economy/balance?owner=" + owner)
    ).json();
    expect(bal).toMatchObject({
      balances: { boinglets: 50 },
      care: { claimable: 0 },
    });
    const buy = await request("/api/economy/challenge", {
      owner,
      kind: "buy_catalog",
      item_id: "hat-ribbon",
    });
    expect(buy.status).toBe(200);
    const b = (await buy.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/economy/confirm", {
          id: b.id,
          signature: await signConfirm(b.message),
        })
      ).status,
    ).toBe(200);
    expect(
      await (await request("/api/economy/balance?owner=" + owner)).json(),
    ).toMatchObject({
      balances: { boinglets: 10 },
      inventory: [{ item_id: "hat-ribbon", qty: 1 }],
    });
  });
  it("syncs a signed world position and returns it publicly", async () => {
    expect(
      (await request("/api/world/position?owner=" + owner)).status,
    ).toBe(200);
    expect(
      await (await request("/api/world/position?owner=" + owner)).json(),
    ).toMatchObject({ position: null });
    const challenge = await request("/api/world/position/challenge", {
      owner,
      zone: "starter-town",
      x: 1.5,
      y: 0.9,
      z: -2.25,
    });
    expect(challenge.status).toBe(200);
    const c = (await challenge.json()) as { id: string; message: string };
    const signature =
      "0x" +
      bytesToHex(
        await ed.signAsync(
          blake3(new TextEncoder().encode(c.message)),
          fixtureKey,
        ),
      );
    expect(
      (await request("/api/world/position/confirm", { id: c.id, signature }))
        .status,
    ).toBe(200);
    expect(
      await (await request("/api/world/position?owner=" + owner)).json(),
    ).toMatchObject({
      position: { owner, zone: "starter-town", x: 1.5, y: 0.9, z: -2.25 },
    });
  });
  it("requires origin, valid identity and supported action", async () => {
    expect(
      (
        await request(
          "/api/challenge",
          { owner, action: "hatch" },
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("/api/challenge", { owner: "0x123", action: "hatch" }))
        .status,
    ).toBe(400);
    expect(
      (await request("/api/challenge", { owner, action: "kill" })).status,
    ).toBe(400);
    expect(
      (await request("/api/challenge", { owner, action: "feed" })).status,
    ).toBe(409);
  });
  it("hatches exactly once and retry is idempotent", async () => {
    const c = await hatch();
    expect(
      (await request("/api/confirm", { id: c.id, tx_hash: tx })).status,
    ).toBe(200);
    expect(
      (await request("/api/challenge", { owner, action: "hatch" })).status,
    ).toBe(409);
    const r = await request("/api/pet?owner=" + owner);
    expect(await r.json()).toMatchObject({
      pet: {
        owner,
        hatch_tx: tx,
        state: { streak: 1, hunger: 100 },
        mind: { mood: expect.any(String), suggestion: expect.any(String) },
      },
    });
    expect(db.prepare("SELECT COUNT(*) AS n FROM events").get()?.n).toBe(1);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM pet_memories").get()?.n,
    ).toBe(1);
  });
  async function signConfirm(message: string) {
    return (
      "0x" +
      bytesToHex(
        await ed.signAsync(blake3(new TextEncoder().encode(message)), fixtureKey),
      )
    );
  }
  it("verifies BLAKE3 + Ed25519 daily hello and rejects forged signatures", async () => {
    await hatch();
    const c = await challenge("checkin");
    expect(
      (
        await request("/api/confirm", {
          id: c.id,
          signature: "0x" + "00".repeat(64),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/confirm", {
          id: c.id,
          signature: await signConfirm(c.message),
        })
      ).status,
    ).toBe(200);
    expect(
      (await request("/api/challenge", { owner, action: "checkin" })).status,
    ).toBe(409);
    const r = await request("/api/pet?owner=" + owner);
    expect(await r.json()).toMatchObject({
      pet: { state: { streak: 1, checkedIn: true } },
    });
  });
  it("accepts once-per-day play and groom signatures and unlocks badges", async () => {
    await hatch();
    for (const action of ["play", "groom"] as const) {
      const c = await challenge(action);
      expect(
        (
          await request("/api/confirm", {
            id: c.id,
            signature: await signConfirm(c.message),
          })
        ).status,
      ).toBe(200);
      expect(
        (await request("/api/challenge", { owner, action })).status,
      ).toBe(409);
    }
    const r = await request("/api/pet?owner=" + owner);
    const body = (await r.json()) as {
      pet: {
        state: { playedToday: boolean; groomedToday: boolean; energy: number };
        achievements: Array<{ code: string }>;
      };
    };
    expect(body.pet.state).toMatchObject({
      playedToday: true,
      groomedToday: true,
      energy: 100,
    });
    expect(body.pet.achievements.map((a) => a.code)).toEqual(
      expect.arrayContaining(["first_bounce", "playtime", "fresh_coat"]),
    );
  });
  it("rejects expired and unknown challenges", async () => {
    const c = await challenge("hatch");
    db.prepare("UPDATE challenges SET expires_at=0 WHERE id=?").run(c.id);
    expect(
      (await request("/api/confirm", { id: c.id, tx_hash: tx })).status,
    ).toBe(410);
    expect(
      (await request("/api/confirm", { id: "missing", tx_hash: tx })).status,
    ).toBe(404);
  });
  it("never grants pets for pending/failed receipts or another chain", async () => {
    const c = await challenge("hatch");
    pending = true;
    expect(
      (await request("/api/confirm", { id: c.id, tx_hash: tx })).status,
    ).toBe(425);
    pending = false;
    receiptSuccess = false;
    expect(
      (await request("/api/confirm", { id: c.id, tx_hash: tx })).status,
    ).toBe(400);
    rpcHash = tx;
    receiptSuccess = true;
    chainId = 6914;
    expect(
      (await request("/api/confirm", { id: c.id, tx_hash: tx })).status,
    ).toBe(503);
    expect(db.prepare("SELECT COUNT(*) AS n FROM pets").get()?.n).toBe(0);
  });
  it("atomic hatch rolls back when its event insert fails", async () => {
    const c = await challenge("hatch");
    db.exec(
      "CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'fixture'); END;",
    );
    expect(
      (await request("/api/confirm", { id: c.id, tx_hash: tx })).status,
    ).toBe(409);
    expect(db.prepare("SELECT COUNT(*) AS n FROM pets").get()?.n).toBe(0);
  });
  it("rejects oversized bodies and bounds pagination", async () => {
    expect(
      (
        await request("/api/challenge", {
          owner,
          action: "hatch",
          padding: "x".repeat(5000),
        })
      ).status,
    ).toBe(413);
    expect((await request("/api/pasture?offset=-1")).status).toBe(400);
  });
});
