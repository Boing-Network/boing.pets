import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
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
const fixtureKey = new Uint8Array(32).fill(7);
const fixtureKeyB = new Uint8Array(32).fill(9);
let owner = "";

async function request(path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers.origin = origin;
    headers["content-type"] = "application/json";
  }
  return app.fetch(
    new Request(
      origin + path,
      body === undefined
        ? undefined
        : { method: "POST", headers, body: JSON.stringify(body) },
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

function hatch(who: string) {
  db.prepare("INSERT INTO pets(owner,hatch_tx,created_at) VALUES(?,?,?)").run(
    who,
    "0x" + "ab".repeat(32) + who.slice(-4),
    Date.now(),
  );
}

function grant(who: string, itemId: string, qty: number) {
  db.prepare(
    "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?) ON CONFLICT(owner,item_id) DO UPDATE SET qty=excluded.qty",
  ).run(who, itemId, qty);
}

beforeEach(async () => {
  owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKey));
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
  db.close();
});

describe("crafting API", () => {
  it("lists recipes without a session", async () => {
    const res = await request("/api/craft/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      recipes: unknown[];
      craftedToday: number;
    };
    expect(body.recipes.length).toBe(9);
    expect(body.craftedToday).toBe(0);
  });

  it("rejects unauthenticated and unhatched craft requests", async () => {
    const noOwner = await request("/api/craft/challenge", {
      recipe_id: "craft-iron-pick",
    });
    expect(noOwner.status).toBeGreaterThanOrEqual(400);
    const noPet = await request("/api/craft/challenge", {
      owner,
      recipe_id: "craft-iron-pick",
    });
    expect(noPet.status).toBe(404);
    const confirm = await request("/api/craft/confirm", {
      id: "missing",
      signature: "0x" + "ab".repeat(64),
    });
    expect(confirm.status).toBe(404);
  });

  it("crafts a recipe, consumes inputs, and grants the output", async () => {
    hatch(owner);
    grant(owner, "ore-pebble", 3);
    grant(owner, "ore-spark", 1);
    const challenge = await request("/api/craft/challenge", {
      owner,
      recipe_id: "craft-iron-pick",
    });
    expect(challenge.status).toBe(200);
    const c = (await challenge.json()) as { id: string; message: string };
    const confirm = await request("/api/craft/confirm", {
      id: c.id,
      signature: await signConfirm(c.message),
    });
    expect(confirm.status).toBe(200);
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, "ore-pebble")?.qty,
    ).toBe(0);
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, "tool-pick-iron")?.qty,
    ).toBe(1);
    expect(
      db
        .prepare(
          "SELECT source FROM inventory_acquisitions WHERE owner=? AND item_id=?",
        )
        .get(owner, "tool-pick-iron")?.source,
    ).toBe("craft");
    expect(
      db.prepare("SELECT output_item FROM craft_log WHERE owner=?").get(owner)
        ?.output_item,
    ).toBe("tool-pick-iron");
  });

  it("refuses to craft when ingredients are missing", async () => {
    hatch(owner);
    grant(owner, "ore-pebble", 1);
    const challenge = await request("/api/craft/challenge", {
      owner,
      recipe_id: "craft-iron-pick",
    });
    expect(challenge.status).toBe(409);
    const body = (await challenge.json()) as { error: string };
    expect(body.error).toMatch(/Need 3 ore-pebble/);
  });

  it("allows only one of two concurrent crafts to consume the same stacks", async () => {
    hatch(owner);
    grant(owner, "ore-pebble", 3);
    grant(owner, "ore-spark", 1);
    const first = await request("/api/craft/challenge", {
      owner,
      recipe_id: "craft-iron-pick",
    });
    const second = await request("/api/craft/challenge", {
      owner,
      recipe_id: "craft-iron-pick",
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = (await first.json()) as { id: string; message: string };
    const b = (await second.json()) as { id: string; message: string };
    const results = await Promise.all([
      request("/api/craft/confirm", {
        id: a.id,
        signature: await signConfirm(a.message),
      }),
      request("/api/craft/confirm", {
        id: b.id,
        signature: await signConfirm(b.message),
      }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, "tool-pick-iron")?.qty,
    ).toBe(1);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM craft_log WHERE owner=?").get(owner)
        ?.n,
    ).toBe(1);
  });

  it("rejects a confirm with the wrong signature", async () => {
    hatch(owner);
    grant(owner, "ore-pebble", 3);
    grant(owner, "ore-spark", 1);
    const challenge = await request("/api/craft/challenge", {
      owner,
      recipe_id: "craft-iron-pick",
    });
    const c = (await challenge.json()) as { id: string; message: string };
    const bad = await request("/api/craft/confirm", {
      id: c.id,
      signature: await signConfirm(c.message, fixtureKeyB),
    });
    expect(bad.status).toBe(403);
  });
});
