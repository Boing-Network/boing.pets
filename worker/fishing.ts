import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  biteDelayMs,
  FISH,
  fishById,
  FISHING_DAILY_CATCH_CAP,
  FISHING_REEL_WINDOW_MS,
  fishingDayKey,
  pickFish,
} from "../src/content/fishing";
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

async function catchesToday(env: Env, owner: string, dayKey: string) {
  const row = await env.DB.prepare(
    "SELECT count FROM fishing_catches WHERE owner=? AND day_key=?",
  )
    .bind(owner, dayKey)
    .first<{ count: number }>();
  return row?.count || 0;
}

export async function fishingGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/fishing/status") return null;
  const ownerParam = url.searchParams.get("owner");
  const dayKey = fishingDayKey(now);
  if (!ownerParam) {
    return Response.json({
      fish: FISH,
      dailyCap: FISHING_DAILY_CATCH_CAP,
      reelWindowMs: FISHING_REEL_WINDOW_MS,
      catchesToday: 0,
      remaining: FISHING_DAILY_CATCH_CAP,
      dayKey,
      now,
    });
  }
  const owner = hex32(ownerParam);
  const caught = await catchesToday(env, owner, dayKey);
  return Response.json({
    fish: FISH,
    dailyCap: FISHING_DAILY_CATCH_CAP,
    reelWindowMs: FISHING_REEL_WINDOW_MS,
    catchesToday: caught,
    remaining: Math.max(0, FISHING_DAILY_CATCH_CAP - caught),
    dayKey,
    now,
  });
}

export async function fishingPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/fishing/challenge") {
    const owner = hex32(body.owner);
    const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
      .bind(owner)
      .first();
    if (!pet) throw new HttpError(404, "Hatch a buddy before fishing");
    const dayKey = fishingDayKey(now);
    const caught = await catchesToday(env, owner, dayKey);
    if (caught >= FISHING_DAILY_CATCH_CAP)
      throw new HttpError(409, "Daily fishing limit reached. Come back tomorrow UTC.");
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM fishing_challenges WHERE owner=? AND created_at>?",
    )
      .bind(owner, now - 60_000)
      .first<{ n: number }>();
    if ((recent?.n || 0) >= 8)
      throw new HttpError(429, "Too many casts. Try again shortly.");
    await env.DB.prepare("DELETE FROM fishing_challenges WHERE expires_at<?")
      .bind(now)
      .run();
    const id = crypto.randomUUID();
    const fish = pickFish(id);
    const delay = biteDelayMs(id);
    const biteAt = now + delay;
    const expires = now + 10 * 60_000;
    const message = `Boing Pets fishing v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nDay: ${dayKey}\nFish: ${fish.id}\nBite: ${biteAt}\nWindow: ${FISHING_REEL_WINDOW_MS}\nNonce: ${id}\nExpires: ${expires}`;
    await env.DB.prepare(
      "INSERT INTO fishing_challenges(id,owner,day_key,fish_id,bite_at,window_ms,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        owner,
        dayKey,
        fish.id,
        biteAt,
        FISHING_REEL_WINDOW_MS,
        message,
        now,
        expires,
      )
      .run();
    return Response.json({
      id,
      owner,
      day_key: dayKey,
      fish_id: fish.id,
      fish_name: fish.name,
      rarity: fish.rarity,
      reward: fish.rewardBoinglets,
      bite_at: biteAt,
      window_ms: FISHING_REEL_WINDOW_MS,
      message,
      expires_at: expires,
    });
  }

  if (url.pathname === "/api/fishing/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid fishing challenge");
    const c = await env.DB.prepare(
      "SELECT * FROM fishing_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        day_key: string;
        fish_id: string;
        bite_at: number;
        window_ms: number;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "Fishing challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Fishing challenge expired. Cast again.");
    await verifySignature(c.owner, c.message, body.signature);
    const fish = fishById(c.fish_id);
    if (!fish) throw new HttpError(409, "Fish config changed; cast again");

    if (now < c.bite_at) {
      throw new HttpError(409, "Too early — wait for the nibble");
    }

    const missed = now > c.bite_at + c.window_ms;
    await env.DB.prepare("DELETE FROM fishing_challenges WHERE id=?")
      .bind(c.id)
      .run();

    if (missed) {
      return Response.json({
        ok: false,
        result: "missed",
        message: "The fish got away. Cast again.",
      });
    }

    const caught = await catchesToday(env, c.owner, c.day_key);
    if (caught >= FISHING_DAILY_CATCH_CAP)
      throw new HttpError(409, "Daily fishing limit reached");

    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO fishing_catches(owner,day_key,count,updated_at) VALUES(?,?,1,?)
           ON CONFLICT(owner,day_key) DO UPDATE SET count=count+1, updated_at=excluded.updated_at`,
        ).bind(c.owner, c.day_key, now),
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
        ).bind(c.owner, fish.id),
        ...ledgerCreditPair(
          env,
          c.id,
          c.owner,
          "boinglets",
          fish.rewardBoinglets,
          "fishing_reward",
          fish.id,
          now,
        ),
        env.DB.prepare(
          "INSERT OR IGNORE INTO collection_unlocks(owner,entry_id,unlocked_at) VALUES(?,?,?)",
        ).bind(c.owner, `discovery:fish:${fish.id}`, now),
      ]);
    } catch {
      throw new HttpError(409, "Catch already recorded or ledger busy");
    }

    return Response.json({
      ok: true,
      result: "caught",
      fish: {
        id: fish.id,
        name: fish.name,
        rarity: fish.rarity,
        rewardBoinglets: fish.rewardBoinglets,
      },
    });
  }

  return null;
}

export function fishingError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
