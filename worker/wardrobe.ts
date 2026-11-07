import { accessory } from "../src/wardrobe";
import { YardError } from "./errors";

/** Future minigames call this with a server-chosen catalog id. The browser never picks one. */
export function pieceInsert(env: Env, owner: string, itemId: string, source: string, now: number, id: string) {
  const item = accessory(itemId);
  if (!item) throw new YardError(400, "Unknown accessory");
  if (!/^[a-z0-9-]{3,32}$/.test(source)) throw new YardError(400, "Unknown minigame");
  if (source === "forage" && item.rarity !== "common") throw new YardError(400, "Forage only finds common clothes");
  if (!/^[0-9a-f-]{8,64}$/i.test(id)) throw new YardError(400, "Bad piece id");
  return env.DB.prepare(
    "INSERT INTO wardrobe(id,owner,item,source,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
  ).bind(id, owner, item.id, source, now);
}

export async function grantPiece(env: Env, owner: string, itemId: string, source: string, now: number, id = crypto.randomUUID()) {
  await pieceInsert(env, owner, itemId, source, now, id).run();
  const item = accessory(itemId);
  if (!item) throw new YardError(400, "Unknown accessory");
  return { id, item };
}
