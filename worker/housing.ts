import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import { catalogItem } from "../src/economy";
import {
  HOME_GRID,
  isFurnitureItem,
  isHousingKind,
  isValidCell,
  parseVisibility,
  type HousingKind,
} from "../src/housing";
import { hex32 } from "../src/core";

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

async function ensurePlot(env: Env, owner: string, now: number) {
  const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
    .bind(owner)
    .first();
  if (!pet) throw new HttpError(404, "Hatch a buddy before claiming a home");
  const existing = await env.DB.prepare(
    "SELECT owner,width,height,visibility,created_at,updated_at FROM housing_plots WHERE owner=?",
  )
    .bind(owner)
    .first<{
      owner: string;
      width: number;
      height: number;
      visibility: string;
      created_at: number;
      updated_at: number;
    }>();
  if (existing) return existing;
  await env.DB.prepare(
    "INSERT INTO housing_plots(owner,width,height,visibility,created_at,updated_at) VALUES(?,?,?,'public',?,?)",
  )
    .bind(owner, HOME_GRID, HOME_GRID, now, now)
    .run();
  return {
    owner,
    width: HOME_GRID,
    height: HOME_GRID,
    visibility: "public",
    created_at: now,
    updated_at: now,
  };
}

async function rateLimit(env: Env, owner: string, now: number) {
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM housing_challenges WHERE owner=? AND created_at>?",
  )
    .bind(owner, now - 60_000)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 10)
    throw new HttpError(429, "Too many housing requests. Try again shortly.");
}

async function issue(
  env: Env,
  owner: string,
  kind: HousingKind,
  payload: Record<string, unknown>,
  now: number,
) {
  await rateLimit(env, owner, now);
  await env.DB.prepare("DELETE FROM housing_challenges WHERE expires_at<?")
    .bind(now)
    .run();
  const id = crypto.randomUUID();
  const expires = now + 10 * 60_000;
  const body = JSON.stringify(payload);
  const message = `Boing Pets housing v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nKind: ${kind}\nPayload: ${body}\nNonce: ${id}\nExpires: ${expires}`;
  await env.DB.prepare(
    "INSERT INTO housing_challenges(id,owner,kind,payload,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(id, owner, kind, body, message, now, expires)
    .run();
  return { id, owner, kind, payload, message, expires_at: expires };
}

export async function housingGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/housing/plot") return null;
  const ownerParam = url.searchParams.get("owner");
  if (!ownerParam) {
    return Response.json({
      grid: HOME_GRID,
      plot: null,
      placements: [],
      furniture: [],
      now,
    });
  }
  const owner = hex32(ownerParam);
  const viewerParam = url.searchParams.get("viewer");
  const viewer = viewerParam ? hex32(viewerParam) : null;
  let plot;
  try {
    plot = await ensurePlot(env, owner, now);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return Response.json({
        grid: HOME_GRID,
        plot: null,
        placements: [],
        furniture: [],
        now,
      });
    }
    throw error;
  }
  const isOwner = viewer === owner;
  const canView = isOwner || plot.visibility === "public";
  const placements = canView
    ? (
        await env.DB.prepare(
          "SELECT id,item_id,x,y,created_at FROM housing_placements WHERE owner=? ORDER BY y,x",
        )
          .bind(owner)
          .all<{
            id: string;
            item_id: string;
            x: number;
            y: number;
            created_at: number;
          }>()
      ).results
    : [];
  let furniture: Array<{ item_id: string; qty: number; name: string }> = [];
  if (isOwner) {
    const inv = await env.DB.prepare(
      "SELECT item_id,qty FROM inventory WHERE owner=? AND qty>0",
    )
      .bind(owner)
      .all<{ item_id: string; qty: number }>();
    furniture = inv.results
      .filter((row) => isFurnitureItem(row.item_id))
      .map((row) => ({
        item_id: row.item_id,
        qty: row.qty,
        name: catalogItem(row.item_id)?.name || row.item_id,
      }));
  }
  return Response.json({
    grid: HOME_GRID,
    plot,
    placements: canView ? placements : [],
    private: !canView,
    furniture,
    now,
  });
}

export async function housingPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/housing/challenge") {
    const owner = hex32(body.owner);
    if (!isHousingKind(body.kind))
      throw new HttpError(400, "Unknown housing action");
    await ensurePlot(env, owner, now);
    const kind = body.kind;

    if (kind === "place") {
      const itemId = String(body.item_id || "");
      const x = Number(body.x);
      const y = Number(body.y);
      if (!isFurnitureItem(itemId))
        throw new HttpError(400, "Only furniture can be placed");
      if (!isValidCell(x, y)) throw new HttpError(400, "Invalid home cell");
      const qty = await env.DB.prepare(
        "SELECT qty FROM inventory WHERE owner=? AND item_id=?",
      )
        .bind(owner, itemId)
        .first<{ qty: number }>();
      if (!qty || qty.qty < 1)
        throw new HttpError(409, "No furniture stack available");
      const occupied = await env.DB.prepare(
        "SELECT id FROM housing_placements WHERE owner=? AND x=? AND y=?",
      )
        .bind(owner, x, y)
        .first();
      if (occupied) throw new HttpError(409, "That cell is occupied");
      return Response.json(
        await issue(env, owner, kind, { item_id: itemId, x, y }, now),
      );
    }

    if (kind === "pickup") {
      const placementId = String(body.placement_id || "");
      if (!placementId || placementId.length > 64)
        throw new HttpError(400, "Invalid placement id");
      const row = await env.DB.prepare(
        "SELECT id,item_id,x,y FROM housing_placements WHERE id=? AND owner=?",
      )
        .bind(placementId, owner)
        .first<{ id: string; item_id: string; x: number; y: number }>();
      if (!row) throw new HttpError(404, "Placement not found");
      return Response.json(
        await issue(
          env,
          owner,
          kind,
          {
            placement_id: row.id,
            item_id: row.item_id,
            x: row.x,
            y: row.y,
          },
          now,
        ),
      );
    }

    if (kind === "set_visibility") {
      let visibility: string;
      try {
        visibility = parseVisibility(body.visibility);
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "Invalid visibility",
        );
      }
      return Response.json(
        await issue(env, owner, kind, { visibility }, now),
      );
    }
  }

  if (url.pathname === "/api/housing/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid housing challenge");
    const c = await env.DB.prepare(
      "SELECT * FROM housing_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        kind: HousingKind;
        payload: string;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "Housing challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Housing challenge expired");
    await verifySignature(c.owner, c.message, body.signature);
    const payload = JSON.parse(c.payload) as Record<string, unknown>;
    await ensurePlot(env, c.owner, now);

    if (c.kind === "place") {
      const itemId = String(payload.item_id);
      const x = Number(payload.x);
      const y = Number(payload.y);
      if (!isFurnitureItem(itemId) || !isValidCell(x, y))
        throw new HttpError(409, "Invalid placement");
      const inv = await env.DB.prepare(
        "SELECT qty FROM inventory WHERE owner=? AND item_id=?",
      )
        .bind(c.owner, itemId)
        .first<{ qty: number }>();
      if (!inv || inv.qty < 1)
        throw new HttpError(409, "No furniture stack available");
      const occupied = await env.DB.prepare(
        "SELECT id FROM housing_placements WHERE owner=? AND x=? AND y=?",
      )
        .bind(c.owner, x, y)
        .first();
      if (occupied) throw new HttpError(409, "That cell is occupied");
      const stockOp =
        inv.qty === 1
          ? env.DB.prepare(
              "DELETE FROM inventory WHERE owner=? AND item_id=? AND qty=1",
            ).bind(c.owner, itemId)
          : env.DB.prepare(
              "UPDATE inventory SET qty=qty-1 WHERE owner=? AND item_id=? AND qty=?",
            ).bind(c.owner, itemId, inv.qty);
      try {
        await env.DB.batch([
          stockOp,
          env.DB.prepare(
            "INSERT INTO housing_placements(id,owner,item_id,x,y,created_at) VALUES(?,?,?,?,?,?)",
          ).bind(c.id, c.owner, itemId, x, y, now),
          env.DB.prepare(
            "UPDATE housing_plots SET updated_at=? WHERE owner=?",
          ).bind(now, c.owner),
        ]);
      } catch {
        throw new HttpError(409, "Could not place furniture");
      }
    }

    if (c.kind === "pickup") {
      const placementId = String(payload.placement_id);
      const itemId = String(payload.item_id);
      const row = await env.DB.prepare(
        "SELECT id FROM housing_placements WHERE id=? AND owner=?",
      )
        .bind(placementId, c.owner)
        .first();
      if (!row) throw new HttpError(404, "Placement already gone");
      try {
        await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM housing_placements WHERE id=? AND owner=?",
          ).bind(placementId, c.owner),
          env.DB.prepare(
            "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
          ).bind(c.owner, itemId),
          env.DB.prepare(
            "UPDATE housing_plots SET updated_at=? WHERE owner=?",
          ).bind(now, c.owner),
        ]);
      } catch {
        throw new HttpError(409, "Could not pick up furniture");
      }
    }

    if (c.kind === "set_visibility") {
      const visibility = parseVisibility(payload.visibility);
      await env.DB.prepare(
        "UPDATE housing_plots SET visibility=?, updated_at=? WHERE owner=?",
      )
        .bind(visibility, now, c.owner)
        .run();
    }

    await env.DB.prepare("DELETE FROM housing_challenges WHERE id=?")
      .bind(c.id)
      .run();
    return Response.json({ ok: true });
  }

  return null;
}

export function housingError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
