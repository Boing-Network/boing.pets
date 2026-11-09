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
const fixtureKeyB = new Uint8Array(32).fill(9);
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
  it("claims daily Sparkles and buys a premium cosmetic", async () => {
    await hatch();
    const challenge = await request("/api/economy/challenge", {
      owner,
      kind: "sparkles_claim",
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
    expect(
      await (await request("/api/economy/balance?owner=" + owner)).json(),
    ).toMatchObject({
      balances: { sparkles: 10 },
      sparklesFaucet: { claimable: 0 },
    });
    expect(
      (
        await request("/api/economy/challenge", {
          owner,
          kind: "sparkles_claim",
        })
      ).status,
    ).toBe(409);
    const buy = await request("/api/economy/challenge", {
      owner,
      kind: "buy_catalog",
      item_id: "hat-stardust",
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
      balances: { sparkles: 2 },
      inventory: expect.arrayContaining([{ item_id: "hat-stardust", qty: 1 }]),
    });
  });
  it("syncs a signed world position and returns it publicly", async () => {
    expect((await request("/api/world/position?owner=" + owner)).status).toBe(
      200,
    );
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
    expect(db.prepare("SELECT COUNT(*) AS n FROM pet_memories").get()?.n).toBe(
      1,
    );
  });
  async function signConfirm(message: string, key: Uint8Array = fixtureKey) {
    return (
      "0x" +
      bytesToHex(
        await ed.signAsync(blake3(new TextEncoder().encode(message)), key),
      )
    );
  }
  async function socialSession(
    who: string = owner,
    key: Uint8Array = fixtureKey,
  ) {
    const challenge = await request("/api/social/session/challenge", {
      owner: who,
    });
    expect(challenge.status).toBe(200);
    const c = (await challenge.json()) as { id: string; message: string };
    const conf = await request("/api/social/session/confirm", {
      id: c.id,
      signature: await signConfirm(c.message, key),
    });
    expect(conf.status).toBe(200);
    return ((await conf.json()) as { token: string }).token;
  }
  async function authedSocialGet(path: string, token: string) {
    return request(path, undefined, origin, {
      Authorization: `Bearer ${token}`,
    });
  }
  it("creates a party, invites a friend, and accepts", async () => {
    await hatch();
    const ownerB = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKeyB));
    const hatchB = await request("/api/challenge", {
      owner: ownerB,
      action: "hatch",
    });
    const hb = (await hatchB.json()) as { id: string; amount: string };
    const ownerA = owner;
    owner = ownerB;
    amount = hb.amount;
    rpcHash = "0x" + "cd".repeat(32);
    expect(
      (await request("/api/confirm", { id: hb.id, tx_hash: rpcHash })).status,
    ).toBe(200);
    owner = ownerA;

    // Become friends first.
    const req = await request("/api/social/challenge", {
      owner,
      kind: "friend_request",
      target: ownerB,
    });
    const reqBody = (await req.json()) as { id: string; message: string };
    await request("/api/social/confirm", {
      id: reqBody.id,
      signature: await signConfirm(reqBody.message),
    });
    const tokenB = await socialSession(ownerB, fixtureKeyB);
    const inbox = (await (
      await authedSocialGet("/api/social/requests?owner=" + ownerB, tokenB)
    ).json()) as { incoming: Array<{ id: string }> };
    const acceptFriend = await request("/api/social/challenge", {
      owner: ownerB,
      kind: "friend_accept",
      request_id: inbox.incoming[0]!.id,
    });
    const af = (await acceptFriend.json()) as { id: string; message: string };
    await request("/api/social/confirm", {
      id: af.id,
      signature: await signConfirm(af.message, fixtureKeyB),
    });

    const create = await request("/api/social/challenge", {
      owner,
      kind: "party_create",
    });
    expect(create.status).toBe(200);
    const cb = (await create.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/social/confirm", {
          id: cb.id,
          signature: await signConfirm(cb.message),
        })
      ).status,
    ).toBe(200);

    const invite = await request("/api/social/challenge", {
      owner,
      kind: "party_invite",
      target: ownerB,
    });
    expect(invite.status).toBe(200);
    const ib = (await invite.json()) as { id: string; message: string };
    await request("/api/social/confirm", {
      id: ib.id,
      signature: await signConfirm(ib.message),
    });
    const invites = (await (
      await authedSocialGet("/api/social/party/invites?owner=" + ownerB, tokenB)
    ).json()) as { incoming: Array<{ id: string }> };
    expect(invites.incoming[0]).toBeTruthy();
    const acceptParty = await request("/api/social/challenge", {
      owner: ownerB,
      kind: "party_accept",
      invite_id: invites.incoming[0]!.id,
    });
    const ap = (await acceptParty.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/social/confirm", {
          id: ap.id,
          signature: await signConfirm(ap.message, fixtureKeyB),
        })
      ).status,
    ).toBe(200);
    const tokenA = await socialSession(owner);
    const party = (await (
      await authedSocialGet("/api/social/party?owner=" + owner, tokenA)
    ).json()) as { party: { members: Array<{ owner: string }> } };
    expect(party.party.members.map((m) => m.owner).sort()).toEqual(
      [owner, ownerB].sort(),
    );
  });
  it("sets profiles, accepts friends, and exchanges DMs", async () => {
    await hatch();
    const ownerB = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKeyB));
    // Hatch buddy B with a distinct tx hash.
    const hatchB = await request("/api/challenge", {
      owner: ownerB,
      action: "hatch",
    });
    expect(hatchB.status).toBe(200);
    const hb = (await hatchB.json()) as { id: string; amount: string };
    const ownerA = owner;
    owner = ownerB;
    amount = hb.amount;
    rpcHash = "0x" + "ef".repeat(32);
    expect(
      (await request("/api/confirm", { id: hb.id, tx_hash: rpcHash })).status,
    ).toBe(200);
    owner = ownerA;

    for (const [who, key, name] of [
      [owner, fixtureKey, "AlphaBounce"],
      [ownerB, fixtureKeyB, "BetaBuddy"],
    ] as const) {
      const c = await request("/api/social/challenge", {
        owner: who,
        kind: "set_profile",
        display_name: name,
      });
      expect(c.status).toBe(200);
      const body = (await c.json()) as { id: string; message: string };
      expect(
        (
          await request("/api/social/confirm", {
            id: body.id,
            signature: await signConfirm(body.message, key),
          })
        ).status,
      ).toBe(200);
    }

    const req = await request("/api/social/challenge", {
      owner,
      kind: "friend_request",
      target: ownerB,
    });
    expect(req.status).toBe(200);
    const reqBody = (await req.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/social/confirm", {
          id: reqBody.id,
          signature: await signConfirm(reqBody.message),
        })
      ).status,
    ).toBe(200);

    const tokenB = await socialSession(ownerB, fixtureKeyB);
    const inbox = await (
      await authedSocialGet("/api/social/requests?owner=" + ownerB, tokenB)
    ).json();
    const incoming = (inbox as { incoming: Array<{ id: string }> }).incoming[0];
    expect(incoming).toBeTruthy();
    const accept = await request("/api/social/challenge", {
      owner: ownerB,
      kind: "friend_accept",
      request_id: incoming.id,
    });
    expect(accept.status).toBe(200);
    const ab = (await accept.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/social/confirm", {
          id: ab.id,
          signature: await signConfirm(ab.message, fixtureKeyB),
        })
      ).status,
    ).toBe(200);

    const tokenA = await socialSession(owner);
    const friends = await (
      await authedSocialGet("/api/social/friends?owner=" + owner, tokenA)
    ).json();
    expect(friends).toMatchObject({
      friends: [{ owner: ownerB, display_name: "BetaBuddy" }],
    });

    const msg = await request("/api/social/challenge", {
      owner,
      kind: "send_message",
      target: ownerB,
      body: "Welcome to the pasture!",
    });
    expect(msg.status).toBe(200);
    const mb = (await msg.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/social/confirm", {
          id: mb.id,
          signature: await signConfirm(mb.message),
        })
      ).status,
    ).toBe(200);
    const thread = await (
      await authedSocialGet(
        `/api/social/messages?owner=${ownerB}&with=${owner}`,
        tokenB,
      )
    ).json();
    expect(thread).toMatchObject({
      messages: [{ from_owner: owner, body: "Welcome to the pasture!" }],
    });
  });
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
      expect((await request("/api/challenge", { owner, action })).status).toBe(
        409,
      );
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
  it("plants, waters, and harvests a garden crop", async () => {
    await hatch();
    const plant = await request("/api/garden/challenge", {
      owner,
      kind: "plant",
      slot: 0,
      crop_id: "crop-sprout",
    });
    expect(plant.status).toBe(200);
    const pb = (await plant.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/garden/confirm", {
          id: pb.id,
          signature: await signConfirm(pb.message),
        })
      ).status,
    ).toBe(200);
    const water = await request("/api/garden/challenge", {
      owner,
      kind: "water",
      slot: 0,
    });
    expect(water.status).toBe(200);
    const wb = (await water.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/garden/confirm", {
          id: wb.id,
          signature: await signConfirm(wb.message),
        })
      ).status,
    ).toBe(200);
    db.prepare(
      "UPDATE garden_plots SET ready_at=0 WHERE owner=? AND slot=0",
    ).run(owner);
    const harvest = await request("/api/garden/challenge", {
      owner,
      kind: "harvest",
      slot: 0,
    });
    expect(harvest.status).toBe(200);
    const hb = (await harvest.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/garden/confirm", {
          id: hb.id,
          signature: await signConfirm(hb.message),
        })
      ).status,
    ).toBe(200);
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, "crop-sprout")?.qty,
    ).toBe(1);
    expect(
      db
        .prepare(
          "SELECT delta FROM ledger WHERE owner=? AND reason='garden_reward'",
        )
        .get(owner)?.delta,
    ).toBe(6);
  });
  it("finishes a pet race heat for a ribbon", async () => {
    await hatch();
    const start = await request("/api/racing/challenge", { owner });
    expect(start.status).toBe(200);
    const body = (await start.json()) as {
      id: string;
      message: string;
      track_id?: string;
      track_name?: string;
    };
    expect(body.track_id).toBeUndefined();
    expect(body.track_name).toBeUndefined();
    expect(body.message).not.toMatch(/Track:/i);
    db.prepare("UPDATE race_challenges SET go_at=? WHERE id=?").run(
      Date.now() - 100,
      body.id,
    );
    const finish = await request("/api/racing/confirm", {
      id: body.id,
      signature: await signConfirm(body.message),
    });
    expect(finish.status).toBe(200);
    const result = (await finish.json()) as {
      ok: boolean;
      place?: number;
      ribbon?: { id: string };
    };
    expect(result.ok).toBe(true);
    expect(result.place).toBeGreaterThanOrEqual(1);
    expect(result.ribbon?.id).toMatch(/^ribbon-/);
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, result.ribbon!.id)?.qty,
    ).toBe(1);
  });
  it("mines an ore vein within the strike window", async () => {
    await hatch();
    const swing = await request("/api/mining/challenge", { owner });
    expect(swing.status).toBe(200);
    const body = (await swing.json()) as {
      id: string;
      message: string;
      strike_at: number;
      window_ms: number;
      ore_id?: string;
      ore_name?: string;
    };
    expect(body.ore_id).toBeUndefined();
    expect(body.ore_name).toBeUndefined();
    expect(body.message).not.toMatch(/Ore:/i);
    const committedOre = db
      .prepare("SELECT ore_id FROM mining_challenges WHERE id=?")
      .get(body.id) as { ore_id: string };
    db.prepare("UPDATE mining_challenges SET strike_at=? WHERE id=?").run(
      Date.now() - 50,
      body.id,
    );
    const hit = await request("/api/mining/confirm", {
      id: body.id,
      signature: await signConfirm(body.message),
    });
    expect(hit.status).toBe(200);
    const result = (await hit.json()) as {
      ok: boolean;
      ore?: { id: string };
    };
    expect(result.ok).toBe(true);
    expect(result.ore?.id).toBe(committedOre.ore_id);
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, committedOre.ore_id)?.qty,
    ).toBe(1);
    expect(
      db.prepare("SELECT spent FROM mining_stamina WHERE owner=?").get(owner)
        ?.spent,
    ).toBeGreaterThanOrEqual(1);
  });
  it("cooks a recipe and serves a snack for care boosts", async () => {
    await hatch();
    db.prepare("INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1)").run(
      owner,
      "crop-sprout",
    );
    const cook = await request("/api/cook/challenge", {
      owner,
      kind: "cook",
      recipe_id: "recipe-sprout-salad",
    });
    expect(cook.status).toBe(200);
    const cb = (await cook.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/cook/confirm", {
          id: cb.id,
          signature: await signConfirm(cb.message),
        })
      ).status,
    ).toBe(200);
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, "crop-sprout")?.qty,
    ).toBe(0);
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, "food-sprout-salad")?.qty,
    ).toBe(1);
    expect(
      db
        .prepare(
          "SELECT delta FROM ledger WHERE owner=? AND reason='cook_reward'",
        )
        .get(owner)?.delta,
    ).toBe(4);
    expect(
      db
        .prepare(
          "SELECT entry_id FROM collection_unlocks WHERE owner=? AND entry_id=?",
        )
        .get(owner, "discovery:recipe:recipe-sprout-salad")?.entry_id,
    ).toBe("discovery:recipe:recipe-sprout-salad");
    const serve = await request("/api/cook/challenge", {
      owner,
      kind: "serve",
      food_id: "food-sprout-salad",
    });
    expect(serve.status).toBe(200);
    const sb = (await serve.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/cook/confirm", {
          id: sb.id,
          signature: await signConfirm(sb.message),
        })
      ).status,
    ).toBe(200);
    const pet = await request("/api/pet?owner=" + owner);
    const body = (await pet.json()) as {
      pet: { state: { hunger: number; snacksToday: number } };
    };
    expect(body.pet.state.snacksToday).toBe(1);
    expect(body.pet.state.hunger).toBeGreaterThanOrEqual(15);
  });
  it("digs treasure from a clue and awards loot on a hit", async () => {
    await hatch();
    const start = await request("/api/treasure/challenge", { owner });
    expect(start.status).toBe(200);
    const body = (await start.json()) as {
      id: string;
      message: string;
      clue: string;
    };
    expect(body.clue.length).toBeGreaterThan(5);
    expect(body.message).not.toMatch(/Spot:/);
    const spot = db
      .prepare("SELECT spot,loot_id FROM treasure_challenges WHERE id=?")
      .get(body.id) as { spot: number; loot_id: string };
    const miss = await request("/api/treasure/confirm", {
      id: body.id,
      signature: await signConfirm(body.message),
      guess: (spot.spot + 1) % 9,
    });
    // First challenge consumed on miss — start a fresh dig for a hit.
    expect(miss.status).toBe(200);
    expect(await miss.json()).toMatchObject({ ok: false, result: "miss" });

    const start2 = await request("/api/treasure/challenge", { owner });
    const body2 = (await start2.json()) as { id: string; message: string };
    const spot2 = db
      .prepare("SELECT spot,loot_id FROM treasure_challenges WHERE id=?")
      .get(body2.id) as { spot: number; loot_id: string };
    const hit = await request("/api/treasure/confirm", {
      id: body2.id,
      signature: await signConfirm(body2.message),
      guess: spot2.spot,
    });
    expect(hit.status).toBe(200);
    expect(await hit.json()).toMatchObject({
      ok: true,
      result: "found",
      treasure: { id: spot2.loot_id },
    });
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, spot2.loot_id)?.qty,
    ).toBe(1);
  });
  it("places and picks up furniture on a home plot", async () => {
    await hatch();
    db.prepare("INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?)").run(
      owner,
      "furn-cushion",
      1,
    );
    const place = await request("/api/housing/challenge", {
      owner,
      kind: "place",
      item_id: "furn-cushion",
      x: 1,
      y: 2,
    });
    expect(place.status).toBe(200);
    const pb = (await place.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/housing/confirm", {
          id: pb.id,
          signature: await signConfirm(pb.message),
        })
      ).status,
    ).toBe(200);
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, "furn-cushion"),
    ).toBeUndefined();
    const plot = (await (
      await request(`/api/housing/plot?owner=${owner}&viewer=${owner}`)
    ).json()) as {
      placements: Array<{ id: string; item_id: string; x: number; y: number }>;
      plot: { visibility: string };
    };
    expect(plot.placements).toEqual([
      expect.objectContaining({ item_id: "furn-cushion", x: 1, y: 2 }),
    ]);
    const pickup = await request("/api/housing/challenge", {
      owner,
      kind: "pickup",
      placement_id: plot.placements[0]!.id,
    });
    expect(pickup.status).toBe(200);
    const ub = (await pickup.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/housing/confirm", {
          id: ub.id,
          signature: await signConfirm(ub.message),
        })
      ).status,
    ).toBe(200);
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, "furn-cushion")?.qty,
    ).toBe(1);
    const vis = await request("/api/housing/challenge", {
      owner,
      kind: "set_visibility",
      visibility: "private",
    });
    const vb = (await vis.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/housing/confirm", {
          id: vb.id,
          signature: await signConfirm(vb.message),
        })
      ).status,
    ).toBe(200);
    const stranger = (await (
      await request(`/api/housing/plot?owner=${owner}`)
    ).json()) as { private?: boolean; placements: unknown[] };
    expect(stranger.private).toBe(true);
    expect(stranger.placements).toEqual([]);
  });
  it("casts, reels in the bite window, and awards fish", async () => {
    await hatch();
    const status = await (
      await request("/api/fishing/status?owner=" + owner)
    ).json();
    expect(status).toMatchObject({ remaining: 3, catchesToday: 0 });
    const cast = await request("/api/fishing/challenge", { owner });
    expect(cast.status).toBe(200);
    const body = (await cast.json()) as {
      id: string;
      message: string;
      bite_at: number;
      window_ms: number;
      fish_id?: string;
      fish_name?: string;
    };
    expect(body.fish_id).toBeUndefined();
    expect(body.fish_name).toBeUndefined();
    expect(body.message).not.toMatch(/Fish:/i);
    const committedFish = db
      .prepare("SELECT fish_id FROM fishing_challenges WHERE id=?")
      .get(body.id) as { fish_id: string };
    // Too early should fail.
    expect(
      (
        await request("/api/fishing/confirm", {
          id: body.id,
          signature: await signConfirm(body.message),
        })
      ).status,
    ).toBe(409);
    // Advance "now" by rewriting bite_at into the past inside the window.
    db.prepare("UPDATE fishing_challenges SET bite_at=? WHERE id=?").run(
      Date.now() - 100,
      body.id,
    );
    const caught = await request("/api/fishing/confirm", {
      id: body.id,
      signature: await signConfirm(body.message),
    });
    expect(caught.status).toBe(200);
    expect(await caught.json()).toMatchObject({
      ok: true,
      result: "caught",
      fish: { id: committedFish.fish_id },
    });
    expect(
      db
        .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
        .get(owner, committedFish.fish_id)?.qty,
    ).toBe(1);
    expect(
      db
        .prepare(
          "SELECT delta FROM ledger WHERE owner=? AND reason='fishing_reward'",
        )
        .get(owner)?.delta,
    ).toBeGreaterThan(0);
  });
  it("issues wallet-bound plaza presence tokens", async () => {
    await hatch();
    const c = await request("/api/world/presence/challenge", {
      owner,
      zone: "starter-town",
    });
    expect(c.status).toBe(200);
    const body = (await c.json()) as { id: string; message: string };
    expect(body.message).toContain("Boing Pets presence v1");
    const confirmed = await request("/api/world/presence/confirm", {
      id: body.id,
      signature: await signConfirm(body.message),
    });
    expect(confirmed.status).toBe(200);
    const tokenBody = (await confirmed.json()) as {
      token: string;
      owner: string;
      expires_at: number;
    };
    expect(tokenBody.owner).toBe(owner);
    expect(tokenBody.token.length).toBeGreaterThan(8);
    expect(
      db
        .prepare("SELECT owner FROM presence_tokens WHERE token=?")
        .get(tokenBody.token)?.owner,
    ).toBe(owner);
    expect(
      (
        await request("/api/world/presence/challenge", {
          owner,
          zone: "not-a-zone",
        })
      ).status,
    ).toBe(400);
  });

  it("rejects social private GETs without a signed session", async () => {
    await hatch();
    expect((await request("/api/social/friends?owner=" + owner)).status).toBe(
      401,
    );
    expect((await request("/api/social/requests?owner=" + owner)).status).toBe(
      401,
    );
    expect(
      (await request("/api/social/party/invites?owner=" + owner)).status,
    ).toBe(401);
    expect(
      (
        await request(
          `/api/social/messages?owner=${owner}&with=${"0x" + "22".repeat(32)}`,
        )
      ).status,
    ).toBe(401);
    // Public profile remains readable.
    expect((await request("/api/social/profile?owner=" + owner)).status).toBe(
      200,
    );
  });

  it("does not allow a session for wallet A to read wallet B social data", async () => {
    await hatch();
    const ownerB = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKeyB));
    const tokenA = await socialSession(owner);
    expect(
      (await authedSocialGet("/api/social/friends?owner=" + ownerB, tokenA))
        .status,
    ).toBe(403);
  });

  it("rate-limits expensive pasture GETs per IP", async () => {
    for (let i = 0; i < 30; i++) {
      expect(
        (
          await request("/api/pasture", undefined, origin, {
            "CF-Connecting-IP": "203.0.113.9",
          })
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await request("/api/pasture", undefined, origin, {
          "CF-Connecting-IP": "203.0.113.9",
        })
      ).status,
    ).toBe(429);
    // A different IP still works.
    expect(
      (
        await request("/api/pasture", undefined, origin, {
          "CF-Connecting-IP": "203.0.113.10",
        })
      ).status,
    ).toBe(200);
  });

  it("rejects concurrent catalog spends that would overdraw balances", async () => {
    await hatch();
    const claim = await request("/api/economy/challenge", {
      owner,
      kind: "claim",
    });
    const c = (await claim.json()) as { id: string; message: string };
    expect(
      (
        await request("/api/economy/confirm", {
          id: c.id,
          signature: await signConfirm(c.message),
        })
      ).status,
    ).toBe(200);
    // Balance is 50 after hatch claim; hat-ribbon costs 40. Two concurrent buys must not both succeed.
    const buy1 = await request("/api/economy/challenge", {
      owner,
      kind: "buy_catalog",
      item_id: "hat-ribbon",
    });
    const buy2 = await request("/api/economy/challenge", {
      owner,
      kind: "buy_catalog",
      item_id: "hat-ribbon",
    });
    expect(buy1.status).toBe(200);
    expect(buy2.status).toBe(200);
    const b1 = (await buy1.json()) as { id: string; message: string };
    const b2 = (await buy2.json()) as { id: string; message: string };
    const r1 = await request("/api/economy/confirm", {
      id: b1.id,
      signature: await signConfirm(b1.message),
    });
    const r2 = await request("/api/economy/confirm", {
      id: b2.id,
      signature: await signConfirm(b2.message),
    });
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const bal = (await (
      await request("/api/economy/balance?owner=" + owner)
    ).json()) as { balances: { boinglets: number } };
    expect(bal.balances.boinglets).toBeGreaterThanOrEqual(0);
    expect(bal.balances.boinglets).toBeLessThanOrEqual(10);
    const inv = await env.DB.prepare(
      "SELECT qty FROM inventory WHERE owner=? AND item_id=?",
    )
      .bind(owner, "hat-ribbon")
      .first<{ qty: number }>();
    expect(inv?.qty || 0).toBe(1);
  });
});
