import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  CROPS,
  cropById,
  GARDEN_SLOTS,
  isGardenKind,
  isValidSlot,
  type GardenKind,
} from "../src/content/gardening";
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

async function rateLimit(env: Env, owner: string, now: number) {
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM garden_challenges WHERE owner=? AND created_at>?",
  )
    .bind(owner, now - 60_000)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 10)
    throw new HttpError(429, "Too many garden requests. Try again shortly.");
}

async function issue(
  env: Env,
  owner: string,
  kind: GardenKind,
  payload: Record<string, unknown>,
  now: number,
) {
  await rateLimit(env, owner, now);
  await env.DB.prepare("DELETE FROM garden_challenges WHERE expires_at<?")
    .bind(now)
    .run();
  const id = crypto.randomUUID();
  const expires = now + 10 * 60_000;
  const body = JSON.stringify(payload);
  const message = `Boing Pets garden v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nKind: ${kind}\nPayload: ${body}\nNonce: ${id}\nExpires: ${expires}`;
  await env.DB.prepare(
    "INSERT INTO garden_challenges(id,owner,kind,payload,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(id, owner, kind, body, message, now, expires)
    .run();
  return { id, owner, kind, payload, message, expires_at: expires };
}

export async function gardeningGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/garden/status") return null;
  const ownerParam = url.searchParams.get("owner");
  if (!ownerParam) {
    return Response.json({
      crops: CROPS,
      slots: GARDEN_SLOTS,
      plots: [],
      now,
    });
  }
  const owner = hex32(ownerParam);
  const plots = await env.DB.prepare(
    "SELECT slot,crop_id,planted_at,ready_at,watered FROM garden_plots WHERE owner=? ORDER BY slot",
  )
    .bind(owner)
    .all<{
      slot: number;
      crop_id: string;
      planted_at: number;
      ready_at: number;
      watered: number;
    }>();
  return Response.json({
    crops: CROPS,
    slots: GARDEN_SLOTS,
    plots: plots.results.map((p) => ({
      ...p,
      watered: !!p.watered,
      ready: now >= p.ready_at,
      crop: cropById(p.crop_id) || null,
    })),
    now,
  });
}

export async function gardeningPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/garden/challenge") {
    const owner = hex32(body.owner);
    if (!isGardenKind(body.kind))
      throw new HttpError(400, "Unknown garden action");
    const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
      .bind(owner)
      .first();
    if (!pet) throw new HttpError(404, "Hatch a buddy before gardening");
    const kind = body.kind;
    const slot = Number(body.slot);
    if (!isValidSlot(slot)) throw new HttpError(400, "Invalid garden slot");

    if (kind === "plant") {
      const cropId = String(body.crop_id || "");
      const crop = cropById(cropId);
      if (!crop) throw new HttpError(404, "Unknown crop");
      const occupied = await env.DB.prepare(
        "SELECT slot FROM garden_plots WHERE owner=? AND slot=?",
      )
        .bind(owner, slot)
        .first();
      if (occupied) throw new HttpError(409, "That plot is already planted");
      return Response.json(
        await issue(
          env,
          owner,
          kind,
          { slot, crop_id: crop.id, grow_ms: crop.growMs },
          now,
        ),
      );
    }

    if (kind === "water") {
      const plot = await env.DB.prepare(
        "SELECT crop_id,ready_at,watered FROM garden_plots WHERE owner=? AND slot=?",
      )
        .bind(owner, slot)
        .first<{ crop_id: string; ready_at: number; watered: number }>();
      if (!plot) throw new HttpError(404, "Nothing planted there");
      if (plot.watered) throw new HttpError(409, "Already watered");
      if (now >= plot.ready_at)
        throw new HttpError(409, "Crop is ready — harvest instead");
      const crop = cropById(plot.crop_id);
      if (!crop) throw new HttpError(409, "Crop config changed");
      return Response.json(
        await issue(
          env,
          owner,
          kind,
          {
            slot,
            crop_id: crop.id,
            ready_at: Math.min(plot.ready_at, now + crop.wateredGrowMs),
          },
          now,
        ),
      );
    }

    if (kind === "harvest") {
      const plot = await env.DB.prepare(
        "SELECT crop_id,ready_at FROM garden_plots WHERE owner=? AND slot=?",
      )
        .bind(owner, slot)
        .first<{ crop_id: string; ready_at: number }>();
      if (!plot) throw new HttpError(404, "Nothing planted there");
      if (now < plot.ready_at)
        throw new HttpError(409, "Crop is still growing");
      const crop = cropById(plot.crop_id);
      if (!crop) throw new HttpError(409, "Crop config changed");
      return Response.json(
        await issue(
          env,
          owner,
          kind,
          {
            slot,
            crop_id: crop.id,
            reward: crop.rewardBoinglets,
          },
          now,
        ),
      );
    }
  }

  if (url.pathname === "/api/garden/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid garden challenge");
    const c = await env.DB.prepare("SELECT * FROM garden_challenges WHERE id=?")
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        kind: GardenKind;
        payload: string;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "Garden challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Garden challenge expired");
    await verifySignature(c.owner, c.message, body.signature);
    const payload = JSON.parse(c.payload) as Record<string, unknown>;
    const slot = Number(payload.slot);

    if (c.kind === "plant") {
      const cropId = String(payload.crop_id);
      const growMs = Number(payload.grow_ms);
      const crop = cropById(cropId);
      if (!crop || crop.growMs !== growMs)
        throw new HttpError(409, "Crop config changed; retry");
      const occupied = await env.DB.prepare(
        "SELECT slot FROM garden_plots WHERE owner=? AND slot=?",
      )
        .bind(c.owner, slot)
        .first();
      if (occupied) throw new HttpError(409, "That plot is already planted");
      await env.DB.prepare(
        "INSERT INTO garden_plots(owner,slot,crop_id,planted_at,ready_at,watered) VALUES(?,?,?,?,?,0)",
      )
        .bind(c.owner, slot, crop.id, now, now + growMs)
        .run();
    }

    if (c.kind === "water") {
      const readyAt = Number(payload.ready_at);
      const plot = await env.DB.prepare(
        "SELECT watered FROM garden_plots WHERE owner=? AND slot=?",
      )
        .bind(c.owner, slot)
        .first<{ watered: number }>();
      if (!plot || plot.watered)
        throw new HttpError(409, "Cannot water that plot");
      await env.DB.prepare(
        "UPDATE garden_plots SET watered=1, ready_at=? WHERE owner=? AND slot=?",
      )
        .bind(readyAt, c.owner, slot)
        .run();
    }

    if (c.kind === "harvest") {
      const cropId = String(payload.crop_id);
      const reward = Number(payload.reward);
      const crop = cropById(cropId);
      if (!crop || crop.rewardBoinglets !== reward)
        throw new HttpError(409, "Crop config changed; retry");
      const plot = await env.DB.prepare(
        "SELECT ready_at FROM garden_plots WHERE owner=? AND slot=? AND crop_id=?",
      )
        .bind(c.owner, slot, cropId)
        .first<{ ready_at: number }>();
      if (!plot || now < plot.ready_at)
        throw new HttpError(409, "Crop is not ready");
      const party = await resolvePartyBonus(
        env,
        c.owner,
        "garden_harvest",
        reward,
        now,
      );
      try {
        await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM garden_plots WHERE owner=? AND slot=?",
          ).bind(c.owner, slot),
          env.DB.prepare(
            "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
          ).bind(c.owner, crop.id),
          ...ledgerCreditPair(
            env,
            c.id,
            c.owner,
            "boinglets",
            reward,
            "garden_reward",
            crop.id,
            now,
          ),
          env.DB.prepare(
            "INSERT OR IGNORE INTO collection_unlocks(owner,entry_id,unlocked_at) VALUES(?,?,?)",
          ).bind(c.owner, `discovery:crop:${crop.id}`, now),
          ...party.statements,
        ]);
      } catch {
        throw new HttpError(409, "Could not harvest crop");
      }
      await env.DB.prepare("DELETE FROM garden_challenges WHERE id=?")
        .bind(c.id)
        .run();
      return Response.json({
        ok: true,
        party_bonus: party.bonus.eligible ? party.bonus : null,
        variety_awarded: party.varietyAwarded || 0,
      });
    }

    await env.DB.prepare("DELETE FROM garden_challenges WHERE id=?")
      .bind(c.id)
      .run();
    return Response.json({ ok: true });
  }

  return null;
}

export function gardeningError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
