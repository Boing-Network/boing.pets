import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  ACHIEVEMENTS,
  DAY,
  dayOf,
  hex32,
  isAction,
  isSignatureAction,
  markerAmount,
  state,
  traits,
  unlockedAchievements,
  type AchievementCode,
  type Action,
  type CareEvent,
  type Pet,
} from "../src/core";
import {
  buildPetMind,
  episodePayload,
  type PetMemoryRow,
} from "../src/memory";
import { WORLD_CONFIG } from "../src/world/config/zones";
import {
  economyError,
  economyGet,
  economyPost,
} from "./economy";
import { verifyProof, type Receipt, type RpcBlock } from "./proof";
export { PlazaRoom } from "./plaza";
interface Challenge {
  id: string;
  owner: string;
  action: Action;
  message: string;
  amount: string;
  created_at: number;
  expires_at: number;
  min_height: number;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function readRpcJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty RPC response");
  const decoder = new TextDecoder();
  let text = "",
    size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("RPC response exceeds 4 MiB");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}
async function rpc<T>(
  env: Env,
  method: string,
  params: unknown[] = [],
): Promise<T> {
  try {
    const r = await fetch(env.RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error("HTTP error");
    const body = (await readRpcJson(r)) as { result: T; error?: unknown };
    if (body.error || body.result === undefined)
      throw new Error("RPC rejected request");
    return body.result;
  } catch {
    throw new HttpError(
      503,
      "Testnet RPC is unavailable. No pet state was changed; retry later.",
    );
  }
}
async function checkNetwork(env: Env) {
  const info = await rpc<{ chain_id: number }>(env, "boing_getNetworkInfo");
  if (info.chain_id !== 6913)
    throw new HttpError(503, "Pets only supports Boing testnet 6913");
}
async function persistAchievements(
  env: Env,
  pet: Pet,
  events: CareEvent[],
  now: number,
) {
  const codes = unlockedAchievements(pet, events, now);
  for (const code of codes) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO achievements(owner,code,unlocked_at) VALUES(?,?,?)",
    )
      .bind(pet.owner, code, now)
      .run();
  }
  return codes;
}

async function recordEpisode(
  env: Env,
  owner: string,
  action: Action,
  at: number,
) {
  await env.DB.prepare(
    "INSERT INTO pet_memories(id,owner,kind,payload,created_at) VALUES(?,?,?,?,?)",
  )
    .bind(crypto.randomUUID(), owner, "episode", episodePayload(action, at), at)
    .run();
  // Keep episodic memory bounded for scalable reads.
  await env.DB.prepare(
    `DELETE FROM pet_memories WHERE owner=? AND kind='episode' AND id NOT IN (
      SELECT id FROM pet_memories WHERE owner=? AND kind='episode'
      ORDER BY created_at DESC LIMIT 40
    )`,
  )
    .bind(owner, owner)
    .run();
}

async function enrich(env: Env, pet: Pet, now: number) {
  const events = await env.DB.prepare(
    "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
  )
    .bind(pet.owner)
    .all<CareEvent>();
  const stored = await env.DB.prepare(
    "SELECT code,unlocked_at FROM achievements WHERE owner=? ORDER BY unlocked_at",
  )
    .bind(pet.owner)
    .all<{ code: AchievementCode; unlocked_at: number }>();
  const memories = await env.DB.prepare(
    "SELECT id,owner,kind,payload,created_at FROM pet_memories WHERE owner=? ORDER BY created_at DESC LIMIT 12",
  )
    .bind(pet.owner)
    .all<PetMemoryRow>();
  // Derive on read so legacy pets gain badges without a backfill job.
  const derived = unlockedAchievements(pet, events.results, now);
  const byCode = new Map(
    stored.results.map((row) => [row.code, row.unlocked_at]),
  );
  for (const code of derived) if (!byCode.has(code)) byCode.set(code, now);
  const achievements = [...byCode.entries()].map(([code, unlocked_at]) => ({
    code,
    unlocked_at,
    ...ACHIEVEMENTS[code],
  }));
  const t = traits(pet.owner, pet.hatch_tx);
  return {
    ...pet,
    traits: t,
    state: state(pet, events.results, now),
    achievements,
    mind: buildPetMind(pet, events.results, t.personality, now),
    memories: memories.results,
  };
}
async function api(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url),
    now = Date.now();
  if (req.method === "GET") {
    const economy = await economyGet(req, env, now);
    if (economy) return economy;
  }
  if (req.method === "GET" && url.pathname === "/api/world/config") {
    return json({
      ...WORLD_CONFIG,
      now,
    });
  }
  if (req.method === "GET" && url.pathname === "/api/world/position") {
    const owner = hex32(url.searchParams.get("owner"));
    const position = await env.DB.prepare(
      "SELECT owner,zone,x,y,z,updated_at FROM player_positions WHERE owner=?",
    )
      .bind(owner)
      .first();
    return json({ position, now });
  }
  if (req.method === "GET" && url.pathname === "/api/pasture") {
    const offset = Number(url.searchParams.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
      throw new HttpError(400, "Invalid page");
    const pets = await env.DB.prepare(
      "SELECT * FROM pets ORDER BY created_at DESC,owner LIMIT 25 OFFSET ?",
    )
      .bind(offset)
      .all<Pet>();
    return json({
      pets: await Promise.all(
        pets.results.slice(0, 24).map((p) => enrich(env, p, now)),
      ),
      next: pets.results.length > 24 ? offset + 24 : null,
      now,
    });
  }
  if (req.method === "GET" && url.pathname === "/api/pet") {
    const owner = hex32(url.searchParams.get("owner"));
    const pet = await env.DB.prepare("SELECT * FROM pets WHERE owner=?")
      .bind(owner)
      .first<Pet>();
    return json({ pet: pet ? await enrich(env, pet, now) : null, now });
  }
  if (req.method !== "POST") throw new HttpError(404, "Not found");
  if (req.headers.get("origin") !== env.APP_ORIGIN)
    throw new HttpError(403, "This origin is not allowed");
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "JSON required");
  // Stream-bound the body as well as checking Content-Length (which can be absent).
  const reader = req.body?.getReader();
  let text = "";
  let size = 0;
  if (reader) {
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new HttpError(413, "Request too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
    if (!body || Array.isArray(body) || typeof body !== "object") throw Error();
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  try {
    const economy = await economyPost(url, env, body, now);
    if (economy) return economy;
  } catch (error) {
    const mapped = economyError(error);
    if (mapped) return mapped;
    throw error;
  }
  if (url.pathname === "/api/world/position/challenge") {
    const owner = hex32(body.owner);
    const zone = typeof body.zone === "string" ? body.zone.slice(0, 64) : "";
    const x = Number(body.x),
      y = Number(body.y),
      z = Number(body.z);
    if (
      !zone ||
      ![x, y, z].every((n) => Number.isFinite(n) && Math.abs(n) <= 10_000)
    )
      throw new HttpError(400, "Invalid world position");
    const known = WORLD_CONFIG.zones.some((item) => item.id === zone);
    if (!known) throw new HttpError(400, "Unknown zone");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM world_challenges WHERE owner=? AND created_at>?",
    )
      .bind(owner, now - 60_000)
      .first<{ n: number }>();
    if ((count?.n || 0) >= 8)
      throw new HttpError(429, "Too many sync requests. Try again shortly.");
    await env.DB.prepare(
      "DELETE FROM world_challenges WHERE expires_at<?",
    )
      .bind(now)
      .run();
    const id = crypto.randomUUID(),
      expires = now + 10 * 60_000;
    const message = `Boing Pets world sync v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nZone: ${zone}\nX: ${x}\nY: ${y}\nZ: ${z}\nNonce: ${id}\nExpires: ${expires}`;
    await env.DB.prepare(
      "INSERT INTO world_challenges(id,owner,zone,x,y,z,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
      .bind(id, owner, zone, x, y, z, message, now, expires)
      .run();
    return json({ id, owner, zone, x, y, z, message, expires_at: expires });
  }
  if (url.pathname === "/api/world/position/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid world challenge");
    const c = await env.DB.prepare(
      "SELECT * FROM world_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        zone: string;
        x: number;
        y: number;
        z: number;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "World challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "World challenge expired. Sync again.");
    if (
      typeof body.signature !== "string" ||
      !/^(0x)?[0-9a-f]{128}$/i.test(body.signature)
    )
      throw new HttpError(400, "Invalid signature format");
    const sig = hexToBytes(body.signature.replace(/^0x/i, "")),
      key = hexToBytes(c.owner.slice(2));
    if (
      !(await ed.verifyAsync(
        sig,
        blake3(new TextEncoder().encode(c.message)),
        key,
      ))
    )
      throw new HttpError(
        403,
        "Signature does not match this wallet and world sync",
      );
    await env.DB.prepare(
      "INSERT INTO player_positions(owner,zone,x,y,z,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET zone=excluded.zone,x=excluded.x,y=excluded.y,z=excluded.z,updated_at=excluded.updated_at",
    )
      .bind(c.owner, c.zone, c.x, c.y, c.z, now)
      .run();
    await env.DB.prepare("DELETE FROM world_challenges WHERE id=?")
      .bind(c.id)
      .run();
    return json({
      ok: true,
      position: {
        owner: c.owner,
        zone: c.zone,
        x: c.x,
        y: c.y,
        z: c.z,
        updated_at: now,
      },
    });
  }
  if (url.pathname === "/api/challenge") {
    const owner = hex32(body.owner);
    if (!isAction(body.action))
      throw new HttpError(400, "Unknown care action");
    const action = body.action;
    const pet = await env.DB.prepare("SELECT * FROM pets WHERE owner=?")
      .bind(owner)
      .first<Pet>();
    if (action === "hatch" && pet)
      throw new HttpError(
        409,
        "One pet per wallet: your buddy is already here",
      );
    if (action !== "hatch" && !pet)
      throw new HttpError(409, "Hatch your buddy first");
    if (action !== "hatch") {
      const today = await env.DB.prepare(
        "SELECT id FROM events WHERE owner=? AND action=? AND day=?",
      )
        .bind(owner, action, dayOf(now))
        .first();
      if (today)
        throw new HttpError(
          409,
          "Already done today. Come back after midnight UTC.",
        );
    }
    // Per-wallet issuance cap and lazy cleanup. No cron, no secrets or custody keys.
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM challenges WHERE owner=? AND created_at>?",
    )
      .bind(owner, now - 60_000)
      .first<{ n: number }>();
    if ((count?.n || 0) >= 8)
      throw new HttpError(429, "Too many requests. Try again in a minute.");
    await env.DB.prepare(
      "DELETE FROM challenges WHERE expires_at<? AND id NOT IN (SELECT id FROM events)",
    )
      .bind(now - DAY)
      .run();
    let height = 0;
    if (!isSignatureAction(action)) {
      await checkNetwork(env);
      height = await rpc<number>(env, "boing_chainHeight");
      if (!Number.isSafeInteger(height) || height < 0)
        throw new HttpError(503, "Invalid testnet height");
    }
    const id = crypto.randomUUID(),
      expires = now + 60 * 60_000,
      amount = markerAmount(id, action);
    const message = `Boing Pets v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nAction: ${action}\nOwner: ${owner}\nNonce: ${id}\nExpires: ${expires}`;
    await env.DB.prepare("INSERT INTO challenges VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, owner, action, message, amount, now, expires, height)
      .run();
    return json({
      id,
      owner,
      action,
      message,
      amount,
      expires_at: expires,
      transaction: isSignatureAction(action)
        ? null
        : {
            type: "transfer",
            from: owner,
            to: owner,
            amount,
            priority_tip: "0",
            display: `Boing Pets: ${action} your pet. Tiny self-transfer; only the network fee leaves your wallet.`,
          },
    });
  }
  if (url.pathname === "/api/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid challenge");
    const c = await env.DB.prepare("SELECT * FROM challenges WHERE id=?")
      .bind(body.id)
      .first<Challenge>();
    if (!c) throw new HttpError(404, "Challenge not found");
    const done = await env.DB.prepare("SELECT id FROM events WHERE id=?")
      .bind(c.id)
      .first();
    if (done) return json({ ok: true, alreadyConfirmed: true });
    if (c.expires_at < now)
      throw new HttpError(410, "Challenge expired. Start a new care action.");
    let hash: string | null = null;
    if (isSignatureAction(c.action)) {
      if (
        typeof body.signature !== "string" ||
        !/^(0x)?[0-9a-f]{128}$/i.test(body.signature)
      )
        throw new HttpError(400, "Invalid signature format");
      const sig = hexToBytes(body.signature.replace(/^0x/i, "")),
        key = hexToBytes(c.owner.slice(2));
      if (
        !(await ed.verifyAsync(
          sig,
          blake3(new TextEncoder().encode(c.message)),
          key,
        ))
      )
        throw new HttpError(
          403,
          "Signature does not match this wallet and challenge",
        );
    } else {
      hash = hex32(body.tx_hash);
      await checkNetwork(env);
      const receipt = await rpc<Receipt | null>(
        env,
        "boing_getTransactionReceipt",
        [hash],
      );
      const block = receipt
        ? await rpc<RpcBlock | null>(env, "boing_getBlockByHeight", [
            receipt.block_height,
            true,
            false,
          ])
        : null;
      try {
        verifyProof(hash, c, receipt, block);
      } catch (e) {
        throw new HttpError(
          receipt ? 400 : 425,
          e instanceof Error ? e.message : "Invalid transaction",
        );
      }
    }
    const statements: D1PreparedStatement[] = [];
    if (c.action === "hatch")
      statements.push(
        env.DB.prepare(
          "INSERT INTO pets(owner,hatch_tx,created_at) VALUES(?,?,?)",
        ).bind(c.owner, hash, now),
      );
    statements.push(
      env.DB.prepare(
        "INSERT INTO events(id,owner,action,tx_hash,created_at,day) VALUES(?,?,?,?,?,?)",
      ).bind(c.id, c.owner, c.action, hash, now, dayOf(now)),
    );
    try {
      await env.DB.batch(statements);
    } catch {
      throw new HttpError(
        409,
        "Already confirmed, or this care action was done today. Refresh your pasture.",
      );
    }
    const petRow =
      c.action === "hatch"
        ? ({ owner: c.owner, hatch_tx: hash!, created_at: now } satisfies Pet)
        : await env.DB.prepare("SELECT * FROM pets WHERE owner=?")
            .bind(c.owner)
            .first<Pet>();
    if (petRow) {
      const events = await env.DB.prepare(
        "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
      )
        .bind(c.owner)
        .all<CareEvent>();
      await persistAchievements(env, petRow, events.results, now);
      await recordEpisode(env, c.owner, c.action, now);
    }
    return json({ ok: true });
  }
  throw new HttpError(404, "Not found");
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/world/presence") {
      const origin = req.headers.get("Origin");
      if (origin && origin !== env.APP_ORIGIN) {
        return json({ error: "This origin is not allowed" }, 403);
      }
      if (req.headers.get("Upgrade") !== "websocket") {
        return json({ error: "WebSocket upgrade required" }, 426);
      }
      const zone = url.searchParams.get("zone") || WORLD_CONFIG.defaultZone;
      if (!WORLD_CONFIG.zones.some((item) => item.id === zone)) {
        return json({ error: "Unknown zone" }, 400);
      }
      const stub = env.PLAZA.getByName(zone);
      return stub.fetch(req);
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await api(req, env);
    } catch (e) {
      return json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : e instanceof Error && e.message.startsWith("Expected a 32-byte")
                ? e.message
                : "Request could not be processed",
        },
        e instanceof HttpError
          ? e.status
          : e instanceof Error && e.message.startsWith("Expected a 32-byte")
            ? 400
            : 500,
      );
    }
  },
} satisfies ExportedHandler<Env>;
