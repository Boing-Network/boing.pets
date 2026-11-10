import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
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
let amount = "";
let rpcHash = "";
const origin = "http://localhost:5177";
const tx = "0x" + "ab".repeat(32);
const fixtureKey = new Uint8Array(32).fill(7);
const fixtureKeyB = new Uint8Array(32).fill(9);
let owner = "";
let ownerB = "";
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

async function sessionToken(key: Uint8Array) {
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
  owner = ow; // RPC receipt mock uses sender=owner
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
  ownerB = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKeyB));
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
  db.close();
  vi.unstubAllGlobals();
});

describe("party bonus API", () => {
  it("pays party bonus for eligible friends in a party", async () => {
    owner = await hatchOwner(fixtureKey, tx);
    ownerB = await hatchOwner(fixtureKeyB, "0x" + "cd".repeat(32));
    owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKey));

    // Age pets + invent care history for eligibility
    const aged = Date.now() - 2 * 24 * 60 * 60_000;
    db.prepare("UPDATE pets SET created_at=? WHERE owner=?").run(aged, owner);
    db.prepare("UPDATE pets SET created_at=? WHERE owner=?").run(aged, ownerB);

    const tokenA = await sessionToken(fixtureKey);
    const tokenB = await sessionToken(fixtureKeyB);

    // Friend request / accept
    let ch = await request("/api/social/challenge", {
      owner,
      kind: "friend_request",
      target: ownerB,
    });
    expect(ch.status).toBe(200);
    let c = (await ch.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/social/confirm", {
          id: c.id,
          signature: await signConfirm(c.message, fixtureKey),
        })
      ).status,
    ).toBe(200);
    const reqs = await request(
      `/api/social/requests?owner=${ownerB}`,
      undefined,
      origin,
      {
        Authorization: `Bearer ${tokenB}`,
      },
    );
    expect(reqs.status).toBe(200);
    const incoming = (
      (await reqs.json()) as { incoming: Array<{ id: string }> }
    ).incoming[0];
    expect(incoming).toBeTruthy();
    ch = await request("/api/social/challenge", {
      owner: ownerB,
      kind: "friend_accept",
      request_id: incoming.id,
    });
    c = (await ch.json()) as { id: string; message: string };
    await request("/api/social/confirm", {
      id: c.id,
      signature: await signConfirm(c.message, fixtureKeyB),
    });
    // Age friendship
    db.prepare("UPDATE friendships SET created_at=?").run(
      Date.now() - 13 * 60 * 60_000,
    );

    // Party create / invite / accept
    ch = await request("/api/social/challenge", {
      owner,
      kind: "party_create",
    });
    c = (await ch.json()) as { id: string; message: string };
    await request("/api/social/confirm", {
      id: c.id,
      signature: await signConfirm(c.message, fixtureKey),
    });
    ch = await request("/api/social/challenge", {
      owner,
      kind: "party_invite",
      target: ownerB,
    });
    c = (await ch.json()) as { id: string; message: string };
    await request("/api/social/confirm", {
      id: c.id,
      signature: await signConfirm(c.message, fixtureKey),
    });
    const invites = await request(
      `/api/social/party/invites?owner=${ownerB}`,
      undefined,
      origin,
      { Authorization: `Bearer ${tokenB}` },
    );
    const inviteId = (
      (await invites.json()) as { incoming: Array<{ id: string }> }
    ).incoming[0].id;
    ch = await request("/api/social/challenge", {
      owner: ownerB,
      kind: "party_accept",
      invite_id: inviteId,
    });
    c = (await ch.json()) as { id: string; message: string };
    await request("/api/social/confirm", {
      id: c.id,
      signature: await signConfirm(c.message, fixtureKeyB),
    });

    const party = await request(
      `/api/social/party?owner=${owner}`,
      undefined,
      origin,
      {
        Authorization: `Bearer ${tokenA}`,
      },
    );
    const partyBody = (await party.json()) as {
      bonusPercent: number;
      party: { members: unknown[] };
    };
    expect(partyBody.bonusPercent).toBe(0.1);
    expect(partyBody.party.members).toHaveLength(2);

    // Fish as A
    const cast = await request("/api/fishing/challenge", { owner });
    expect(cast.status).toBe(200);
    const body = (await cast.json()) as {
      id: string;
      message: string;
      bite_at: number;
    };
    db.prepare("UPDATE fishing_challenges SET bite_at=? WHERE id=?").run(
      Date.now() - 50,
      body.id,
    );
    const caught = await request("/api/fishing/confirm", {
      id: body.id,
      signature: await signConfirm(body.message),
    });
    expect(caught.status).toBe(200);
    const result = (await caught.json()) as {
      ok: boolean;
      fish: { rewardBoinglets: number };
      party_bonus: { amount: number; percent: number } | null;
    };
    expect(result.ok).toBe(true);
    expect(result.party_bonus?.percent).toBe(0.1);
    expect(result.party_bonus?.amount).toBeGreaterThan(0);
    const bonusRow = db
      .prepare(
        "SELECT delta FROM ledger WHERE owner=? AND reason='party_bonus'",
      )
      .get(owner) as { delta: number };
    expect(bonusRow.delta).toBe(result.party_bonus!.amount);
  });
});
