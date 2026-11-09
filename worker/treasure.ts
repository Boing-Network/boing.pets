import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  clueForSpot,
  pickSpot,
  pickTreasure,
  TREASURE_DAILY_DIG_CAP,
  TREASURE_GRID,
  TREASURES,
  treasureById,
  treasureDayKey,
} from "../src/content/treasure";
import { hex32 } from "../src/core";
import { ledgerCreditPair } from "./ledger";
import { resolvePartyBonus } from "./partyBonus";

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
  if (typeof signature !== "string" || !/^(0x)?[0-9a-f]{128}$/i.test(signature))
    throw new HttpError(400, "Invalid signature format");
  const ok = await ed.verifyAsync(
    hexToBytes(signature.replace(/^0x/i, "")),
    blake3(new TextEncoder().encode(message)),
    hexToBytes(owner.slice(2)),
  );
  if (!ok) throw new HttpError(403, "Signature does not match");
}

async function digsToday(env: Env, owner: string, dayKey: string) {
  const row = await env.DB.prepare(
    "SELECT count FROM treasure_digs WHERE owner=? AND day_key=?",
  )
    .bind(owner, dayKey)
    .first<{ count: number }>();
  return row?.count || 0;
}

export async function treasureGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/treasure/status") return null;
  const ownerParam = url.searchParams.get("owner");
  const dayKey = treasureDayKey(now);
  if (!ownerParam) {
    return Response.json({
      treasures: TREASURES,
      dailyCap: TREASURE_DAILY_DIG_CAP,
      grid: TREASURE_GRID,
      digsToday: 0,
      remaining: TREASURE_DAILY_DIG_CAP,
      dayKey,
      now,
    });
  }
  const owner = hex32(ownerParam);
  const dug = await digsToday(env, owner, dayKey);
  return Response.json({
    treasures: TREASURES,
    dailyCap: TREASURE_DAILY_DIG_CAP,
    grid: TREASURE_GRID,
    digsToday: dug,
    remaining: Math.max(0, TREASURE_DAILY_DIG_CAP - dug),
    dayKey,
    now,
  });
}

export async function treasurePost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/treasure/challenge") {
    const owner = hex32(body.owner);
    const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
      .bind(owner)
      .first();
    if (!pet) throw new HttpError(404, "Hatch a buddy before digging");
    const dayKey = treasureDayKey(now);
    const dug = await digsToday(env, owner, dayKey);
    if (dug >= TREASURE_DAILY_DIG_CAP)
      throw new HttpError(
        409,
        "Daily dig limit reached. Come back tomorrow UTC.",
      );
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM treasure_challenges WHERE owner=? AND created_at>?",
    )
      .bind(owner, now - 60_000)
      .first<{ n: number }>();
    if ((recent?.n || 0) >= 8)
      throw new HttpError(429, "Too many digs. Try again shortly.");
    await env.DB.prepare("DELETE FROM treasure_challenges WHERE expires_at<?")
      .bind(now)
      .run();
    const id = crypto.randomUUID();
    const spot = pickSpot(id);
    const loot = pickTreasure(id);
    const clue = clueForSpot(spot);
    const expires = now + 10 * 60_000;
    // Spot stays out of the signed message so clients cannot read the answer.
    const message = `Boing Pets treasure v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nDay: ${dayKey}\nClue: ${clue}\nNonce: ${id}\nExpires: ${expires}`;
    await env.DB.prepare(
      "INSERT INTO treasure_challenges(id,owner,day_key,spot,loot_id,clue,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
      .bind(id, owner, dayKey, spot, loot.id, clue, message, now, expires)
      .run();
    return Response.json({
      id,
      owner,
      day_key: dayKey,
      clue,
      grid: TREASURE_GRID,
      message,
      expires_at: expires,
    });
  }

  if (url.pathname === "/api/treasure/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid treasure challenge");
    const guess = Number(body.guess);
    if (!Number.isInteger(guess) || guess < 0 || guess >= TREASURE_GRID)
      throw new HttpError(400, "Guess a dig tile from 0–8");
    const c = await env.DB.prepare(
      "SELECT * FROM treasure_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        day_key: string;
        spot: number;
        loot_id: string;
        clue: string;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "Treasure challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Treasure challenge expired. Dig again.");
    await verifySignature(c.owner, c.message, body.signature);
    const loot = treasureById(c.loot_id);
    if (!loot) throw new HttpError(409, "Loot config changed; dig again");

    const dug = await digsToday(env, c.owner, c.day_key);
    if (dug >= TREASURE_DAILY_DIG_CAP)
      throw new HttpError(409, "Daily dig limit reached");

    await env.DB.prepare("DELETE FROM treasure_challenges WHERE id=?")
      .bind(c.id)
      .run();

    const hit = guess === c.spot;
    const party = hit
      ? await resolvePartyBonus(
          env,
          c.owner,
          "treasure",
          loot.rewardBoinglets,
          now,
        )
      : null;
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO treasure_digs(owner,day_key,count,updated_at) VALUES(?,?,1,?)
           ON CONFLICT(owner,day_key) DO UPDATE SET count=count+1, updated_at=excluded.updated_at`,
        ).bind(c.owner, c.day_key, now),
        ...(hit
          ? [
              env.DB.prepare(
                "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
              ).bind(c.owner, loot.id),
              ...ledgerCreditPair(
                env,
                c.id,
                c.owner,
                "boinglets",
                loot.rewardBoinglets,
                "treasure_reward",
                loot.id,
                now,
              ),
              env.DB.prepare(
                "INSERT OR IGNORE INTO collection_unlocks(owner,entry_id,unlocked_at) VALUES(?,?,?)",
              ).bind(c.owner, `discovery:treasure:${loot.id}`, now),
              ...(party?.statements || []),
            ]
          : []),
      ]);
    } catch {
      throw new HttpError(409, "Dig already recorded or ledger busy");
    }

    if (!hit) {
      return Response.json({
        ok: false,
        result: "miss",
        spot: c.spot,
        message: "Empty dirt. Try another dig.",
      });
    }

    return Response.json({
      ok: true,
      result: "found",
      spot: c.spot,
      treasure: {
        id: loot.id,
        name: loot.name,
        rarity: loot.rarity,
        rewardBoinglets: loot.rewardBoinglets,
      },
      party_bonus: party?.bonus.eligible ? party.bonus : null,
      variety_awarded: party?.varietyAwarded || 0,
    });
  }

  return null;
}

export function treasureError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
