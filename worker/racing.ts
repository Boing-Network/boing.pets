import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  goDelayMs,
  pickTrack,
  placeFromReaction,
  RACE_DAILY_HEAT_CAP,
  RACE_FINISH_WINDOW_MS,
  racingDayKey,
  ribbonByPlace,
  trackById,
  TRACKS,
} from "../src/content/racing";
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

async function heatsToday(env: Env, owner: string, dayKey: string) {
  const row = await env.DB.prepare(
    "SELECT count FROM race_heats WHERE owner=? AND day_key=?",
  )
    .bind(owner, dayKey)
    .first<{ count: number }>();
  return row?.count || 0;
}

export async function racingGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/racing/status") return null;
  const ownerParam = url.searchParams.get("owner");
  const dayKey = racingDayKey(now);
  if (!ownerParam) {
    return Response.json({
      tracks: TRACKS,
      dailyCap: RACE_DAILY_HEAT_CAP,
      finishWindowMs: RACE_FINISH_WINDOW_MS,
      heatsToday: 0,
      remaining: RACE_DAILY_HEAT_CAP,
      dayKey,
      now,
    });
  }
  const owner = hex32(ownerParam);
  const heats = await heatsToday(env, owner, dayKey);
  return Response.json({
    tracks: TRACKS,
    dailyCap: RACE_DAILY_HEAT_CAP,
    finishWindowMs: RACE_FINISH_WINDOW_MS,
    heatsToday: heats,
    remaining: Math.max(0, RACE_DAILY_HEAT_CAP - heats),
    dayKey,
    now,
  });
}

export async function racingPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/racing/challenge") {
    const owner = hex32(body.owner);
    const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
      .bind(owner)
      .first();
    if (!pet) throw new HttpError(404, "Hatch a buddy before racing");
    const dayKey = racingDayKey(now);
    const heats = await heatsToday(env, owner, dayKey);
    if (heats >= RACE_DAILY_HEAT_CAP)
      throw new HttpError(409, "Daily race limit reached. Come back tomorrow UTC.");
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM race_challenges WHERE owner=? AND created_at>?",
    )
      .bind(owner, now - 60_000)
      .first<{ n: number }>();
    if ((recent?.n || 0) >= 8)
      throw new HttpError(429, "Too many race starts. Try again shortly.");
    await env.DB.prepare("DELETE FROM race_challenges WHERE expires_at<?")
      .bind(now)
      .run();
    const id = crypto.randomUUID();
    const track = pickTrack(id);
    const delay = goDelayMs(id);
    const goAt = now + delay;
    const expires = now + 10 * 60_000;
    const message = `Boing Pets racing v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nDay: ${dayKey}\nTrack: ${track.id}\nGo: ${goAt}\nWindow: ${RACE_FINISH_WINDOW_MS}\nNonce: ${id}\nExpires: ${expires}`;
    await env.DB.prepare(
      "INSERT INTO race_challenges(id,owner,day_key,track_id,go_at,window_ms,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        owner,
        dayKey,
        track.id,
        goAt,
        RACE_FINISH_WINDOW_MS,
        message,
        now,
        expires,
      )
      .run();
    return Response.json({
      id,
      owner,
      day_key: dayKey,
      track_id: track.id,
      track_name: track.name,
      go_at: goAt,
      window_ms: RACE_FINISH_WINDOW_MS,
      message,
      expires_at: expires,
    });
  }

  if (url.pathname === "/api/racing/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid race challenge");
    const c = await env.DB.prepare("SELECT * FROM race_challenges WHERE id=?")
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        day_key: string;
        track_id: string;
        go_at: number;
        window_ms: number;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "Race challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Race challenge expired. Start again.");
    await verifySignature(c.owner, c.message, body.signature);
    const track = trackById(c.track_id);
    if (!track) throw new HttpError(409, "Track config changed; retry");

    if (now < c.go_at)
      throw new HttpError(409, "Too early — wait for the starting flash");

    const delta = now - c.go_at;
    const place = placeFromReaction(delta);
    await env.DB.prepare("DELETE FROM race_challenges WHERE id=?")
      .bind(c.id)
      .run();

    if (!place) {
      return Response.json({
        ok: false,
        result: "missed",
        message: "Missed the finish window. Line up again.",
      });
    }

    const heats = await heatsToday(env, c.owner, c.day_key);
    if (heats >= RACE_DAILY_HEAT_CAP)
      throw new HttpError(409, "Daily race limit reached");

    const ribbon = ribbonByPlace(place);
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO race_heats(owner,day_key,count,updated_at) VALUES(?,?,1,?)
           ON CONFLICT(owner,day_key) DO UPDATE SET count=count+1, updated_at=excluded.updated_at`,
        ).bind(c.owner, c.day_key, now),
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
        ).bind(c.owner, ribbon.id),
        ...ledgerCreditPair(
          env,
          c.id,
          c.owner,
          "boinglets",
          ribbon.rewardBoinglets,
          "racing_reward",
          ribbon.id,
          now,
        ),
        env.DB.prepare(
          "INSERT OR IGNORE INTO collection_unlocks(owner,entry_id,unlocked_at) VALUES(?,?,?)",
        ).bind(c.owner, `discovery:ribbon:${ribbon.id}`, now),
      ]);
    } catch {
      throw new HttpError(409, "Heat already recorded or ledger busy");
    }

    return Response.json({
      ok: true,
      result: "placed",
      place,
      track: { id: track.id, name: track.name },
      ribbon: {
        id: ribbon.id,
        name: ribbon.name,
        rewardBoinglets: ribbon.rewardBoinglets,
      },
      reaction_ms: delta,
    });
  }

  return null;
}

export function racingError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
