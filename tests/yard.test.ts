import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import app from "../worker/index";

describe("yard actions", () => {
  it("collects kibble with a signature and spends it on a pen", async () => {
    const key = new Uint8Array(32).fill(4);
    const owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(key));
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
    const signature = "0x" + bytesToHex(await ed.signAsync(blake3(new TextEncoder().encode(body.message)), key));
    const confirmed = await app.fetch(
      new Request("http://localhost:5177/api/confirm", {
        method: "POST",
        headers: { origin: env.APP_ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ id: body.id, signature }),
      }),
      env as unknown as Env,
    );
    expect(confirmed.status).toBe(200);
    const yard = await app.fetch(new Request("http://localhost:5177/api/yard?viewer=" + owner), env as unknown as Env);
    const view = (await yard.json()) as { me: { kibble: number } };
    expect(view.me.kibble).toBeGreaterThan(0);
    db.close();
  });
});