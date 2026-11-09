import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  MINING_STAMINA_MAX,
  MINING_STRIKE_WINDOW_MS,
  miningDayKey,
  ORES,
  oreById,
  pickaxeTier,
  pickOre,
  PICKAXES,
  strikeDelayMs,
} from "../src/content/mining";
import { hex32 } from "../src/core";
import { ledgerCreditPair } from "./ledger";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function verifySignature(
  owner: string,
  message: string,
  signature: unknown,
) {
  if (
    typeof signature !== "string" ||
    !/^(0x)?[0-9a-f]{128}$/i.test(signature)
  )
    throw new HttpError(400, "Invalid signature format");
  const ok = await ed.verifyAsync(
    hexToBytes(signature.replace(/^0x/i, "")),
    blake3(new TextEncoder().encode(message)),
    hexToBytes(owner.slice(2)),
  );
  if (!ok) throw new HttpError(403, "Signature does not match");
}

async function staminaSpent(env: Env, owner: string, dayKey: string) {
  const row = await env.DB.prepare(
    "SELECT spent FROM mining_stamina WHERE owner=? AND day_key=?",
  )
    .bind(owner, dayKey)
    .first<{ spent: number }>();
  return row?.spent || 0;
}

async function inventoryIds(env: Env, owner: string): Promise<string[]> {
  const inv = await env.DB.prepare(
    "SELECT item_id FROM inventory WHERE owner=? AND qty>0",
  )
    .bind(owner)
    .all<{ item_id: string }>();
  return inv.results.map((r) => r.item_id);
}

export async function miningGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/mining/status") return null;
  const ownerParam = url.searchParams.get("owner");
  const dayKey = miningDayKey(now);
  if (!ownerParam) {
    return Response.json({
      ores: ORES,
      pickaxes: PICKAXES,
      staminaMax: MINING_STAMINA_MAX,
      staminaSpent: 0,
      staminaLeft: MINING_STAMINA_MAX,
      pickaxeTier: 1,
      strikeWindowMs: MINING_STRIKE_WINDOW_MS,
      dayKey,
      now,
    });
  }
  const owner = hex32(ownerParam);
  const spent = await staminaSpent(env, owner, dayKey);
  const tier = pickaxeTier(await inventoryIds(env, owner));
  return Response.json({
    ores: ORES,
    pickaxes: PICKAXES,
    staminaMax: MINING_STAMINA_MAX,
    staminaSpent: spent,
    staminaLeft: Math.max(0, MINING_STAMINA_MAX - spent),
    pickaxeTier: tier,
    strikeWindowMs: MINING_STRIKE_WINDOW_MS,
    dayKey,
    now,
  });
}

export async function miningPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/mining/challenge") {
    const owner = hex32(body.owner);
    const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
      .bind(owner)
      .first();
    if (!pet) throw new HttpError(404, "Hatch a buddy before mining");
    const dayKey = miningDayKey(now);
    const spent = await staminaSpent(env, owner, dayKey);
    if (spent >= MINING_STAMINA_MAX)
      throw new HttpError(409, "Out of mining stamina for today (UTC)");
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM mining_challenges WHERE owner=? AND created_at>?",
    )
      .bind(owner, now - 60_000)
      .first<{ n: number }>();
    if ((recent?.n || 0) >= 8)
      throw new HttpError(429, "Too many swings. Try again shortly.");
    await env.DB.prepare("DELETE FROM mining_challenges WHERE expires_at<?")
      .bind(now)
      .run();
    const tier = pickaxeTier(await inventoryIds(env, owner));
    const id = crypto.randomUUID();
    const ore = pickOre(id, tier);
    if (spent + ore.staminaCost > MINING_STAMINA_MAX)
      throw new HttpError(
        409,
        `Need ${ore.staminaCost} stamina (have ${MINING_STAMINA_MAX - spent})`,
      );
    const delay = strikeDelayMs(id);
    const strikeAt = now + delay;
    const expires = now + 10 * 60_000;
    const message = `Boing Pets mining v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nDay: ${dayKey}\nStrike: ${strikeAt}\nWindow: ${MINING_STRIKE_WINDOW_MS}\nTier: ${tier}\nNonce: ${id}\nExpires: ${expires}`;
    await env.DB.prepare(
      "INSERT INTO mining_challenges(id,owner,day_key,ore_id,strike_at,window_ms,stamina_cost,pickaxe_tier,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        owner,
        dayKey,
        ore.id,
        strikeAt,
        MINING_STRIKE_WINDOW_MS,
        ore.staminaCost,
        tier,
        message,
        now,
        expires,
      )
      .run();
    return Response.json({
      id,
      owner,
      day_key: dayKey,
      pickaxe_tier: tier,
      strike_at: strikeAt,
      window_ms: MINING_STRIKE_WINDOW_MS,
      message,
      expires_at: expires,
    });
  }

  if (url.pathname === "/api/mining/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid mining challenge");
    const c = await env.DB.prepare(
      "SELECT * FROM mining_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        day_key: string;
        ore_id: string;
        strike_at: number;
        window_ms: number;
        stamina_cost: number;
        pickaxe_tier: number;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "Mining challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Mining challenge expired. Swing again.");
    await verifySignature(c.owner, c.message, body.signature);
    const ore = oreById(c.ore_id);
    if (!ore || ore.staminaCost !== c.stamina_cost)
      throw new HttpError(409, "Ore config changed; swing again");

    if (now < c.strike_at) {
      throw new HttpError(409, "Too early — wait for the weak spot");
    }

    const missed = now > c.strike_at + c.window_ms;
    await env.DB.prepare("DELETE FROM mining_challenges WHERE id=?")
      .bind(c.id)
      .run();

    const spent = await staminaSpent(env, c.owner, c.day_key);
    const cost = missed ? 1 : ore.staminaCost;
    if (spent + cost > MINING_STAMINA_MAX)
      throw new HttpError(409, "Out of mining stamina");

    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO mining_stamina(owner,day_key,spent,updated_at) VALUES(?,?,?,?)
           ON CONFLICT(owner,day_key) DO UPDATE SET spent=spent+?, updated_at=excluded.updated_at`,
        ).bind(c.owner, c.day_key, cost, now, cost),
      ]);
    } catch {
      throw new HttpError(409, "Could not spend stamina");
    }

    if (missed) {
      return Response.json({
        ok: false,
        result: "missed",
        stamina_spent: cost,
        message: "The vein sealed shut. Swing again.",
      });
    }

    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
        ).bind(c.owner, ore.id),
        ...ledgerCreditPair(
          env,
          c.id,
          c.owner,
          "boinglets",
          ore.rewardBoinglets,
          "mining_reward",
          ore.id,
          now,
        ),
        env.DB.prepare(
          "INSERT OR IGNORE INTO collection_unlocks(owner,entry_id,unlocked_at) VALUES(?,?,?)",
        ).bind(c.owner, `discovery:ore:${ore.id}`, now),
      ]);
    } catch {
      throw new HttpError(409, "Strike already recorded or ledger busy");
    }

    return Response.json({
      ok: true,
      result: "hit",
      stamina_spent: cost,
      ore: {
        id: ore.id,
        name: ore.name,
        rarity: ore.rarity,
        rewardBoinglets: ore.rewardBoinglets,
      },
    });
  }

  return null;
}

export function miningError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
