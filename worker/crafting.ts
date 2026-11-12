import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  CRAFT_DAILY_CAP,
  CRAFT_RECIPES,
  CRAFT_TABLE_VERSION,
  craftRecipeById,
  publicCraftRules,
  type CraftRecipe,
} from "../src/content/crafting";
import { dayOf, hex32 } from "../src/core";

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
    "SELECT COUNT(*) AS n FROM craft_challenges WHERE owner=? AND created_at>?",
  )
    .bind(owner, now - 60_000)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 10)
    throw new HttpError(429, "Too many crafting requests. Try again shortly.");
}

async function inventoryQty(
  env: Env,
  owner: string,
  itemId: string,
): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT qty FROM inventory WHERE owner=? AND item_id=?",
  )
    .bind(owner, itemId)
    .first<{ qty: number }>();
  return row?.qty || 0;
}

async function craftedToday(
  env: Env,
  owner: string,
  day: number,
): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM craft_log WHERE owner=? AND utc_day=?",
  )
    .bind(owner, day)
    .first<{ n: number }>();
  return row?.n || 0;
}

async function loadInventory(
  env: Env,
  owner: string,
): Promise<Record<string, number>> {
  const inv = await env.DB.prepare(
    "SELECT item_id,qty FROM inventory WHERE owner=? AND qty>0",
  )
    .bind(owner)
    .all<{ item_id: string; qty: number }>();
  const inventory: Record<string, number> = {};
  for (const row of inv.results) inventory[row.item_id] = row.qty;
  return inventory;
}

async function issue(
  env: Env,
  owner: string,
  recipe: CraftRecipe,
  now: number,
) {
  await rateLimit(env, owner, now);
  await env.DB.prepare("DELETE FROM craft_challenges WHERE expires_at<?")
    .bind(now)
    .run();
  const id = crypto.randomUUID();
  const expires = now + 10 * 60_000;
  const payload = {
    recipe_id: recipe.id,
    output_item: recipe.outputItemId,
    output_qty: recipe.outputQty,
    inputs: recipe.inputs,
  };
  const body = JSON.stringify(payload);
  const message = `Boing Pets ${CRAFT_TABLE_VERSION}\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nRecipe: ${recipe.id}\nPayload: ${body}\nNonce: ${id}\nExpires: ${expires}`;
  await env.DB.prepare(
    "INSERT INTO craft_challenges(id,owner,recipe_id,payload,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(id, owner, recipe.id, body, message, now, expires)
    .run();
  return {
    id,
    owner,
    recipe_id: recipe.id,
    payload,
    message,
    expires_at: expires,
  };
}

function inputGuardSql(recipe: CraftRecipe): string {
  const clauses = recipe.inputs.map(
    () =>
      "(SELECT COALESCE(qty,0) FROM inventory WHERE owner=? AND item_id=?) >= ?",
  );
  return `INSERT INTO craft_guard(id, ok) SELECT ?, CASE WHEN (${clauses.join(" AND ")}) THEN 1 ELSE 0 END`;
}

export async function craftingGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/craft/status") return null;
  const ownerParam = url.searchParams.get("owner");
  const rules = publicCraftRules();
  if (!ownerParam) {
    return Response.json({
      recipes: CRAFT_RECIPES,
      inventory: {},
      craftedToday: 0,
      dailyCap: CRAFT_DAILY_CAP,
      rules,
      now,
    });
  }
  const owner = hex32(ownerParam);
  const day = dayOf(now);
  return Response.json({
    recipes: CRAFT_RECIPES,
    inventory: await loadInventory(env, owner),
    craftedToday: await craftedToday(env, owner, day),
    dailyCap: CRAFT_DAILY_CAP,
    rules,
    now,
  });
}

export async function craftingPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/craft/challenge") {
    if (body.owner == null || body.owner === "")
      throw new HttpError(401, "Sign in to craft");
    const owner = hex32(body.owner);
    const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
      .bind(owner)
      .first();
    if (!pet) throw new HttpError(404, "Hatch a buddy before crafting");
    const recipe = craftRecipeById(String(body.recipe_id || ""));
    if (!recipe) throw new HttpError(404, "Unknown recipe");
    const day = dayOf(now);
    if ((await craftedToday(env, owner, day)) >= CRAFT_DAILY_CAP)
      throw new HttpError(409, "Daily craft limit reached");
    for (const ing of recipe.inputs) {
      const have = await inventoryQty(env, owner, ing.itemId);
      if (have < ing.qty)
        throw new HttpError(
          409,
          `Need ${ing.qty} ${ing.itemId} (have ${have})`,
        );
    }
    return Response.json(await issue(env, owner, recipe, now));
  }

  if (url.pathname === "/api/craft/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid craft challenge");
    const c = await env.DB.prepare("SELECT * FROM craft_challenges WHERE id=?")
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        recipe_id: string;
        payload: string;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "Craft challenge not found");
    if (c.expires_at < now) throw new HttpError(410, "Craft challenge expired");
    await verifySignature(c.owner, c.message, body.signature);
    const payload = JSON.parse(c.payload) as {
      recipe_id: string;
      output_item: string;
      output_qty: number;
      inputs: CraftRecipe["inputs"];
    };
    const recipe = craftRecipeById(payload.recipe_id);
    if (
      !recipe ||
      recipe.outputItemId !== payload.output_item ||
      recipe.outputQty !== payload.output_qty
    )
      throw new HttpError(409, "Recipe config changed; retry");
    const day = dayOf(now);
    if ((await craftedToday(env, c.owner, day)) >= CRAFT_DAILY_CAP)
      throw new HttpError(409, "Daily craft limit reached");
    for (const ing of recipe.inputs) {
      const have = await inventoryQty(env, c.owner, ing.itemId);
      if (have < ing.qty)
        throw new HttpError(409, `Missing ingredient ${ing.itemId}`);
    }
    const ownerBinds: Array<string | number> = [c.id];
    for (const ing of recipe.inputs) {
      ownerBinds.push(c.owner, ing.itemId, ing.qty);
    }
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(inputGuardSql(recipe)).bind(...ownerBinds),
    ];
    for (const ing of recipe.inputs) {
      statements.push(
        env.DB.prepare(
          "UPDATE inventory SET qty=qty-? WHERE owner=? AND item_id=? AND qty>=?",
        ).bind(ing.qty, c.owner, ing.itemId, ing.qty),
      );
    }
    statements.push(
      env.DB.prepare(
        "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty",
      ).bind(c.owner, recipe.outputItemId, recipe.outputQty),
      env.DB.prepare(
        "INSERT INTO craft_log(id,owner,recipe_id,output_item,output_qty,created_at,utc_day) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        c.id,
        c.owner,
        recipe.id,
        recipe.outputItemId,
        recipe.outputQty,
        now,
        day,
      ),
      env.DB.prepare(
        "INSERT INTO inventory_acquisitions(id,owner,item_id,qty,source,from_owner,created_at) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        c.id,
        c.owner,
        recipe.outputItemId,
        recipe.outputQty,
        "craft",
        null,
        now,
      ),
    );
    try {
      await env.DB.batch(statements);
    } catch {
      throw new HttpError(409, "Could not finish crafting");
    }
    await env.DB.prepare("DELETE FROM craft_challenges WHERE id=?")
      .bind(c.id)
      .run();
    return Response.json({
      ok: true,
      recipe_id: recipe.id,
      output_item: recipe.outputItemId,
      output_qty: recipe.outputQty,
    });
  }

  return null;
}

export function craftingError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
