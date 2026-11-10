import { hex32 } from "../src/core";
import {
  COSMETIC_SLOTS,
  EquipError,
  equippableCatalogItems,
  slotForCosmetic,
  type CosmeticSlot,
  type EquippedCosmetics,
  validateEquip,
} from "../src/content/cosmetics";
import { catalogItem } from "../src/economy";
import { HttpError, requireSocialSession } from "./social";

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

function emptyMap() {
  return new Map<string, EquippedCosmetics>();
}

/** Load equipped cosmetics for many owners. Tolerates a missing table (pre-0023). */
export async function loadEquippedForOwners(
  env: Env,
  owners: string[],
): Promise<Map<string, EquippedCosmetics>> {
  const unique = [...new Set(owners.filter(Boolean))];
  if (!unique.length) return emptyMap();
  try {
    const placeholders = unique.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT owner,slot,item_id FROM pet_cosmetics WHERE owner IN (${placeholders})`,
    )
      .bind(...unique)
      .all<{ owner: string; slot: CosmeticSlot; item_id: string }>();
    const map = emptyMap();
    for (const row of rows.results) {
      if (slotForCosmetic(row.item_id) !== row.slot) continue;
      const current = map.get(row.owner) || {};
      current[row.slot] = row.item_id;
      map.set(row.owner, current);
    }
    return map;
  } catch {
    return emptyMap();
  }
}

export async function loadEquipped(
  env: Env,
  owner: string,
): Promise<EquippedCosmetics> {
  const map = await loadEquippedForOwners(env, [owner]);
  return map.get(owner) || {};
}

export async function attachCosmetics<T extends { owner: string }>(
  env: Env,
  pets: T[],
): Promise<Array<T & { cosmetics: EquippedCosmetics }>> {
  const map = await loadEquippedForOwners(
    env,
    pets.map((pet) => pet.owner),
  );
  return pets.map((pet) => ({
    ...pet,
    cosmetics: map.get(pet.owner) || {},
  }));
}

async function ownedCosmeticIds(env: Env, owner: string): Promise<string[]> {
  const inv = await env.DB.prepare(
    "SELECT item_id FROM inventory WHERE owner=? AND qty>0",
  )
    .bind(owner)
    .all<{ item_id: string }>();
  return inv.results
    .map((row) => row.item_id)
    .filter((id) => slotForCosmetic(id) !== null);
}

export async function cosmeticsGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/pet/cosmetics") return null;
  const ownerParam = url.searchParams.get("owner");
  if (!ownerParam) throw new HttpError(400, "Owner required");
  const owner = hex32(ownerParam);
  const equipped = await loadEquipped(env, owner);
  const ownedIds = await ownedCosmeticIds(env, owner);
  const owned = ownedIds.map((id) => {
    const item = catalogItem(id);
    return {
      id,
      slot: slotForCosmetic(id),
      name: item?.name || id,
    };
  });
  return json({
    owner,
    slots: COSMETIC_SLOTS,
    equipped,
    owned,
    catalog: equippableCatalogItems().map((item) => ({
      id: item.id,
      slot: slotForCosmetic(item.id),
      name: item.name,
      kind: item.kind,
    })),
    now,
  });
}

export async function cosmeticsPost(
  req: Request,
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname !== "/api/pet/cosmetics/equip") return null;
  const owner = hex32(body.owner);
  await requireSocialSession(req, env, owner, now);

  const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
    .bind(owner)
    .first();
  if (!pet) throw new HttpError(409, "Hatch your buddy first");

  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM pet_cosmetics WHERE owner=? AND updated_at>?",
  )
    .bind(owner, now - 60_000)
    .first<{ n: number }>();
  if ((recent?.n || 0) >= 20)
    throw new HttpError(429, "Too many equip changes. Try again shortly.");

  const ownedIds = await ownedCosmeticIds(env, owner);
  let decision: { slot: CosmeticSlot; itemId: string | null };
  try {
    decision = validateEquip({
      slot: body.slot,
      itemId: body.item_id,
      ownedIds,
    });
  } catch (error) {
    if (error instanceof EquipError)
      throw new HttpError(error.status, error.message);
    throw error;
  }

  if (decision.itemId === null) {
    await env.DB.prepare("DELETE FROM pet_cosmetics WHERE owner=? AND slot=?")
      .bind(owner, decision.slot)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO pet_cosmetics(owner,slot,item_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner,slot) DO UPDATE SET item_id=excluded.item_id, updated_at=excluded.updated_at",
    )
      .bind(owner, decision.slot, decision.itemId, now)
      .run();
  }

  const equipped = await loadEquipped(env, owner);
  return json({ ok: true, owner, equipped, now });
}

export function cosmeticsError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
