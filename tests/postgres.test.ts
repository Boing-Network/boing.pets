import { PGlite } from "@electric-sql/pglite";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../worker/index";
import {
  createDb,
  migrateSql,
  normalizeRow,
  toPg,
  type Driver,
  type PetsDb,
} from "../server/db";
import { postgresSchema } from "../server/postgres-schema";

const origin = "http://localhost:5177";
const tx = "0x" + "ab".repeat(32);
const fixtureKey = new Uint8Array(32).fill(7);
let owner = "";
let amount = "";
let rpcHash = tx;
let chainId = 6913;
let receiptSuccess = true;
let pending = false;
let pgdb: PGlite;
let db: PetsDb;

function driverFor(database: PGlite): Driver {
  const query: Driver["query"] = async (sql, params) => {
    const result = await database.query(toPg(sql), params);
    return result.rows.map((row) =>
      normalizeRow(row as Record<string, unknown>),
    );
  };
  return {
    query,
    transaction: async (run) => {
      await database.exec("BEGIN");
      try {
        await run(query);
        await database.exec("COMMIT");
      } catch (error) {
        await database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

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
    {
      DB: db as unknown as D1Database,
      ASSETS: {
        fetch: async () => new Response("assets"),
      } as unknown as Fetcher,
      RPC_URL: "https://rpc.example",
      APP_ORIGIN: origin,
    },
  );
}

beforeEach(async () => {
  owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKey));
  chainId = 6913;
  rpcHash = tx;
  receiptSuccess = true;
  pending = false;
  amount = "";
  pgdb = new PGlite();
  const driver = driverFor(pgdb);
  await migrateSql(driver, postgresSchema);
  db = createDb(driver);
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
afterEach(async () => {
  vi.unstubAllGlobals();
  await pgdb.close();
});

describe("Postgres pasture", () => {
  it("keeps hatch, feed, and check-in constraints", async () => {
    const hatch = await request("/api/challenge", { owner, action: "hatch" });
    expect(hatch.status).toBe(200);
    const challenge = (await hatch.json()) as {
      id: string;
      amount: string;
      message: string;
    };
    amount = challenge.amount;
    expect(typeof challenge.amount).toBe("string");
    expect(
      (await request("/api/confirm", { id: challenge.id, tx_hash: tx })).status,
    ).toBe(200);
    expect(
      (await request("/api/confirm", { id: challenge.id, tx_hash: tx })).status,
    ).toBe(200);
    expect(
      (await request("/api/challenge", { owner, action: "hatch" })).status,
    ).toBe(409);
    const stored = await pgdb.query<{ amount: string }>(
      "SELECT amount FROM challenges WHERE id = $1",
      [challenge.id],
    );
    expect(stored.rows[0]?.amount).toBe(challenge.amount);
    const feed = await request("/api/challenge", { owner, action: "feed" });
    const fed = (await feed.json()) as { id: string; amount: string };
    amount = fed.amount;
    rpcHash = "0x" + "cd".repeat(32);
    expect(
      (await request("/api/confirm", { id: fed.id, tx_hash: rpcHash })).status,
    ).toBe(200);
    expect(
      (await request("/api/challenge", { owner, action: "feed" })).status,
    ).toBe(409);
    const hello = await request("/api/challenge", { owner, action: "checkin" });
    const checkin = (await hello.json()) as { id: string; message: string };
    const signature =
      "0x" +
      bytesToHex(
        await ed.signAsync(
          blake3(new TextEncoder().encode(checkin.message)),
          fixtureKey,
        ),
      );
    expect(
      (await request("/api/confirm", { id: checkin.id, signature })).status,
    ).toBe(200);
    const pet = await request("/api/pet?owner=" + owner);
    expect(await pet.json()).toMatchObject({
      pet: {
        state: { streak: 1, fedToday: true, checkedIn: true, hunger: 100 },
      },
    });
  });

  it("does not keep a pet when the care event rolls back", async () => {
    const hatch = await request("/api/challenge", { owner, action: "hatch" });
    const challenge = (await hatch.json()) as { id: string; amount: string };
    amount = challenge.amount;
    await pgdb.exec(`
      CREATE FUNCTION pets_fail_event() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'fixture';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_event BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION pets_fail_event();
    `);
    expect(
      (await request("/api/confirm", { id: challenge.id, tx_hash: tx })).status,
    ).toBe(409);
    const pets = await pgdb.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM pets",
    );
    expect(Number(pets.rows[0]?.n)).toBe(0);
  });

  it("rejects a receipt from another chain without writing a pet", async () => {
    const hatch = await request("/api/challenge", { owner, action: "hatch" });
    const challenge = (await hatch.json()) as { id: string; amount: string };
    amount = challenge.amount;
    chainId = 6914;
    expect(
      (await request("/api/confirm", { id: challenge.id, tx_hash: tx })).status,
    ).toBe(503);
    const pets = await pgdb.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM pets",
    );
    expect(Number(pets.rows[0]?.n)).toBe(0);
  });
});
