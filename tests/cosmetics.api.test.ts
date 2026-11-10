import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../worker/index";

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
const owner = "0x" + "ab".repeat(32);
const other = "0x" + "cd".repeat(32);

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
        : { method: "POST", headers, body: JSON.stringify(body) },
    ),
    env,
  );
}

beforeEach(() => {
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
    "../migrations/0022_onchain_items.sql",
    "../migrations/0023_pet_cosmetics.sql",
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
    MARKET_WRITES: "on",
    PLAZA: {
      getByName: () => ({
        fetch: async () => new Response("plaza stub"),
      }),
    } as unknown as Env["PLAZA"],
  };
  const now = Date.now();
  db.prepare("INSERT INTO pets(owner,hatch_tx,created_at) VALUES(?,?,?)").run(
    owner,
    "0x" + "11".repeat(32),
    now,
  );
  db.prepare("INSERT INTO pets(owner,hatch_tx,created_at) VALUES(?,?,?)").run(
    other,
    "0x" + "22".repeat(32),
    now,
  );
  db.prepare("INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?)").run(
    owner,
    "hat-ribbon",
    1,
  );
  db.prepare("INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?)").run(
    owner,
    "frame-gold",
    1,
  );
  db.prepare(
    "INSERT INTO social_session_tokens(token,owner,created_at,expires_at) VALUES(?,?,?,?)",
  ).run("sess-ok-token", owner, now, now + 15 * 60_000);
});

afterEach(() => {
  db.close();
});

describe("pet cosmetics API", () => {
  it("equips an owned cosmetic and returns it on pasture payloads", async () => {
    const auth = { Authorization: "Bearer sess-ok-token" };
    const equipped = await request(
      "/api/pet/cosmetics/equip",
      { owner, slot: "hat", item_id: "hat-ribbon" },
      auth,
    );
    expect(equipped.status).toBe(200);
    const body = (await equipped.json()) as {
      equipped: { hat?: string };
    };
    expect(body.equipped).toEqual({ hat: "hat-ribbon" });

    const get = await request(`/api/pet/cosmetics?owner=${owner}`);
    expect(get.status).toBe(200);
    const listing = (await get.json()) as {
      equipped: { hat?: string };
      owned: Array<{ id: string }>;
    };
    expect(listing.equipped.hat).toBe("hat-ribbon");
    expect(listing.owned.map((item) => item.id)).toEqual(
      expect.arrayContaining(["hat-ribbon", "frame-gold"]),
    );

    const pasture = await request("/api/pasture?offset=0");
    expect(pasture.status).toBe(200);
    const data = (await pasture.json()) as {
      pets: Array<{ owner: string; cosmetics?: { hat?: string } }>;
    };
    const mine = data.pets.find((pet) => pet.owner === owner);
    const friend = data.pets.find((pet) => pet.owner === other);
    expect(mine?.cosmetics).toEqual({ hat: "hat-ribbon" });
    expect(friend?.cosmetics).toEqual({});
  });

  it("rejects equipping a cosmetic the wallet does not own", async () => {
    const denied = await request(
      "/api/pet/cosmetics/equip",
      { owner, slot: "hat", item_id: "hat-stardust" },
      { Authorization: "Bearer sess-ok-token" },
    );
    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { error: string };
    expect(body.error).toMatch(/do not own/i);
  });

  it("requires a social session to equip", async () => {
    const res = await request("/api/pet/cosmetics/equip", {
      owner,
      slot: "hat",
      item_id: "hat-ribbon",
    });
    expect(res.status).toBe(401);
  });
});
