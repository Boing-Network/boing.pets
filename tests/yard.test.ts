import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import app from "../worker/index";

function memoryEnv(owner: string) {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new NodeURL("../migrations/0001_pasture.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new NodeURL("../migrations/0002_yard.sql", import.meta.url), "utf8"));
  db.prepare("INSERT INTO pets(owner,hatch_tx,created_at) VALUES(?,?,?)").run(owner, "0x" + "ab".repeat(32), Date.now() - 86_400_000);
  const adapter = {
    prepare: (sql: string) => {
      const statement = {
        sql,
        values: [] as unknown[],
        bind(...values: unknown[]) {
          statement.values = values;
          return statement;
        },
        async first() {
          return db.prepare(sql).get(...(statement.values as never[])) ?? null;
        },
        async all() {
          return { results: db.prepare(sql).all(...(statement.values as never[])) };
        },
        async run() {
          return db.prepare(sql).run(...(statement.values as never[]));
        },
      };
      return statement;
    },
    batch: async (statements: Array<{ sql: string; values: unknown[] }>) => {
      db.exec("BEGIN");
      try {
        for (const statement of statements) db.prepare(statement.sql).run(...(statement.values as never[]));
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const env = {
    DB: adapter,
    ASSETS: { fetch: async () => new Response("assets") },
    RPC_URL: "https://rpc.example",
    APP_ORIGIN: "http://localhost:5177",
  };
  return { db, env };
}

async function sign(key: Uint8Array, message: string) {
  return "0x" + bytesToHex(await ed.signAsync(blake3(new TextEncoder().encode(message)), key));
}

describe("yard actions", () => {
  it("collects kibble with a signature and spends it on a pen", async () => {
    const key = new Uint8Array(32).fill(4);
    const owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(key));
    const { db, env } = memoryEnv(owner);
    const challenge = await app.fetch(
      new Request("http://localhost:5177/api/challenge", {
        method: "POST",
        headers: { origin: env.APP_ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ owner, action: "collect" }),
      }),
      env as unknown as Env,
    );
    expect(challenge.status).toBe(200);
    const body = (await challenge.json()) as { id: string; message: string };
    const confirmed = await app.fetch(
      new Request("http://localhost:5177/api/confirm", {
        method: "POST",
        headers: { origin: env.APP_ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ id: body.id, signature: await sign(key, body.message) }),
      }),
      env as unknown as Env,
    );
    expect(confirmed.status).toBe(200);
    const yard = await app.fetch(new Request("http://localhost:5177/api/yard?viewer=" + owner), env as unknown as Env);
    const view = (await yard.json()) as { me: { kibble: number } };
    expect(view.me.kibble).toBeGreaterThan(0);
    db.close();
  });

  it("equips owned clothes and refuses a client-chosen catalog id", async () => {
    const key = new Uint8Array(32).fill(9);
    const owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(key));
    const { db, env } = memoryEnv(owner);
    const headers = { origin: env.APP_ORIGIN, "content-type": "application/json" };
    const grant = await app.fetch(
      new Request("http://localhost:5177/api/challenge", {
        method: "POST",
        headers,
        body: JSON.stringify({ owner, action: "grant", item: "star-slippers" }),
      }),
      env as unknown as Env,
    );
    expect(grant.status).toBe(400);
    const forged = await app.fetch(
      new Request("http://localhost:5177/api/challenge", {
        method: "POST",
        headers,
        body: JSON.stringify({ owner, action: "equip", piece: "moon-cape" }),
      }),
      env as unknown as Env,
    );
    expect(forged.status).toBe(404);
    expect(db.prepare("SELECT COUNT(*) AS n FROM wardrobe").get()).toEqual({ n: 0 });
    db.prepare("INSERT INTO wardrobe(id,owner,item,source,created_at) VALUES(?,?,?,?,?)").run(
      "piece-coat",
      owner,
      "patched-coat",
      "minigame",
      Date.now(),
    );
    const equip = await app.fetch(
      new Request("http://localhost:5177/api/challenge", {
        method: "POST",
        headers,
        body: JSON.stringify({ owner, action: "equip", piece: "piece-coat" }),
      }),
      env as unknown as Env,
    );
    expect(equip.status).toBe(200);
    const issued = (await equip.json()) as { id: string; message: string; detail: { slot: string } };
    expect(issued.detail.slot).toBe("body");
    const worn = await app.fetch(
      new Request("http://localhost:5177/api/confirm", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: issued.id, signature: await sign(key, issued.message) }),
      }),
      env as unknown as Env,
    );
    expect(worn.status).toBe(200);
    const yard = await app.fetch(new Request("http://localhost:5177/api/yard?viewer=" + owner), env as unknown as Env);
    const view = (await yard.json()) as {
      me: { wardrobe: { id: string; rarity: string; equipped: boolean }[] };
      pets: { wear: { item: string; slot: string }[] }[];
    };
    expect(view.me.wardrobe).toEqual([expect.objectContaining({ id: "piece-coat", rarity: "rare", equipped: true })]);
    expect(view.pets[0]?.wear).toEqual([expect.objectContaining({ item: "patched-coat", slot: "body" })]);
    const takeoff = await app.fetch(
      new Request("http://localhost:5177/api/challenge", {
        method: "POST",
        headers,
        body: JSON.stringify({ owner, action: "unequip", slot: "body" }),
      }),
      env as unknown as Env,
    );
    const off = (await takeoff.json()) as { id: string; message: string };
    const cleared = await app.fetch(
      new Request("http://localhost:5177/api/confirm", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: off.id, signature: await sign(key, off.message) }),
      }),
      env as unknown as Env,
    );
    expect(cleared.status).toBe(200);
    const after = await app.fetch(new Request("http://localhost:5177/api/yard?viewer=" + owner), env as unknown as Env);
    const bare = (await after.json()) as { pets: { wear: unknown[] }[]; me: { wardrobe: { equipped: boolean }[] } };
    expect(bare.pets[0]?.wear).toEqual([]);
    expect(bare.me.wardrobe[0]?.equipped).toBe(false);
    db.close();
  });
});
