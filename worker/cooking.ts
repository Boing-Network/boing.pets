import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  COOK_DAILY_CAP,
  isCookKind,
  recipeByFoodId,
  recipeById,
  RECIPES,
  SERVE_DAILY_CAP,
  type CookKind,
} from "../src/content/cooking";
import { DAY, dayOf, hex32 } from "../src/core";
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

async function rateLimit(env: Env, owner: string, now: number) {
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM cook_challenges WHERE owner=? AND created_at>?",
  )
    .bind(owner, now - 60_000)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 10)
    throw new HttpError(429, "Too many kitchen requests. Try again shortly.");
}

async function issue(
  env: Env,
  owner: string,
  kind: CookKind,
  payload: Record<string, unknown>,
  now: number,
) {
  await rateLimit(env, owner, now);
  await env.DB.prepare("DELETE FROM cook_challenges WHERE expires_at<?")
    .bind(now)
    .run();
  const id = crypto.randomUUID();
  const expires = now + 10 * 60_000;
  const body = JSON.stringify(payload);
  const message = `Boing Pets cook v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nKind: ${kind}\nPayload: ${body}\nNonce: ${id}\nExpires: ${expires}`;
  await env.DB.prepare(
    "INSERT INTO cook_challenges(id,owner,kind,payload,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(id, owner, kind, body, message, now, expires)
    .run();
  return { id, owner, kind, payload, message, expires_at: expires };
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

export async function cookingGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/cook/status") return null;
  const ownerParam = url.searchParams.get("owner");
  if (!ownerParam) {
    return Response.json({
      recipes: RECIPES,
      cookedToday: 0,
      servedToday: 0,
      cookCap: COOK_DAILY_CAP,
      serveCap: SERVE_DAILY_CAP,
      pantry: {},
      dishes: {},
      now,
    });
  }
  const owner = hex32(ownerParam);
  const day = dayOf(now);
  const cooked = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM ledger WHERE owner=? AND reason='cook_reward' AND created_at>=?",
  )
    .bind(owner, day * DAY)
    .first<{ n: number }>();
  const served = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM snack_log WHERE owner=? AND day=?",
  )
    .bind(owner, day)
    .first<{ n: number }>();
  const inv = await env.DB.prepare(
    "SELECT item_id,qty FROM inventory WHERE owner=? AND qty>0",
  )
    .bind(owner)
    .all<{ item_id: string; qty: number }>();
  const pantry: Record<string, number> = {};
  const dishes: Record<string, number> = {};
  for (const row of inv.results) {
    if (row.item_id.startsWith("food-")) dishes[row.item_id] = row.qty;
    else pantry[row.item_id] = row.qty;
  }
  return Response.json({
    recipes: RECIPES,
    cookedToday: cooked?.n || 0,
    servedToday: served?.n || 0,
    cookCap: COOK_DAILY_CAP,
    serveCap: SERVE_DAILY_CAP,
    pantry,
    dishes,
    now,
  });
}

export async function cookingPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/cook/challenge") {
    const owner = hex32(body.owner);
    if (!isCookKind(body.kind))
      throw new HttpError(400, "Unknown kitchen action");
    const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
      .bind(owner)
      .first();
    if (!pet) throw new HttpError(404, "Hatch a buddy before cooking");
    const kind = body.kind;
    const day = dayOf(now);

    if (kind === "cook") {
      const recipe = recipeById(String(body.recipe_id || ""));
      if (!recipe) throw new HttpError(404, "Unknown recipe");
      const cooked = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM ledger WHERE owner=? AND reason='cook_reward' AND created_at>=?",
      )
        .bind(owner, day * DAY)
        .first<{ n: number }>();
      if ((cooked?.n || 0) >= COOK_DAILY_CAP)
        throw new HttpError(409, "Daily cook limit reached");
      for (const ing of recipe.ingredients) {
        const have = await inventoryQty(env, owner, ing.itemId);
        if (have < ing.qty)
          throw new HttpError(
            409,
            `Need ${ing.qty}× ${ing.itemId} (have ${have})`,
          );
      }
      return Response.json(
        await issue(
          env,
          owner,
          kind,
          {
            recipe_id: recipe.id,
            food_id: recipe.foodId,
            reward: recipe.rewardBoinglets,
            ingredients: recipe.ingredients,
          },
          now,
        ),
      );
    }

    if (kind === "serve") {
      const foodId = String(body.food_id || "");
      const recipe = recipeByFoodId(foodId);
      if (!recipe) throw new HttpError(404, "Unknown dish");
      const served = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM snack_log WHERE owner=? AND day=?",
      )
        .bind(owner, day)
        .first<{ n: number }>();
      if ((served?.n || 0) >= SERVE_DAILY_CAP)
        throw new HttpError(409, "Daily serve limit reached");
      const have = await inventoryQty(env, owner, foodId);
      if (have < 1) throw new HttpError(409, "No dish to serve");
      return Response.json(
        await issue(
          env,
          owner,
          kind,
          {
            food_id: recipe.foodId,
            hunger_boost: recipe.hungerBoost,
            energy_boost: recipe.energyBoost,
          },
          now,
        ),
      );
    }
  }

  if (url.pathname === "/api/cook/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid kitchen challenge");
    const c = await env.DB.prepare("SELECT * FROM cook_challenges WHERE id=?")
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        kind: CookKind;
        payload: string;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "Kitchen challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Kitchen challenge expired");
    await verifySignature(c.owner, c.message, body.signature);
    const payload = JSON.parse(c.payload) as Record<string, unknown>;
    const day = dayOf(now);

    if (c.kind === "cook") {
      const recipe = recipeById(String(payload.recipe_id));
      const reward = Number(payload.reward);
      if (!recipe || recipe.rewardBoinglets !== reward)
        throw new HttpError(409, "Recipe config changed; retry");
      const cooked = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM ledger WHERE owner=? AND reason='cook_reward' AND created_at>=?",
      )
        .bind(c.owner, day * DAY)
        .first<{ n: number }>();
      if ((cooked?.n || 0) >= COOK_DAILY_CAP)
        throw new HttpError(409, "Daily cook limit reached");
      for (const ing of recipe.ingredients) {
        const have = await inventoryQty(env, c.owner, ing.itemId);
        if (have < ing.qty)
          throw new HttpError(409, `Missing ingredient ${ing.itemId}`);
      }
      const statements: D1PreparedStatement[] = [];
      for (const ing of recipe.ingredients) {
        statements.push(
          env.DB.prepare(
            "UPDATE inventory SET qty=qty-? WHERE owner=? AND item_id=? AND qty>=?",
          ).bind(ing.qty, c.owner, ing.itemId, ing.qty),
        );
      }
      statements.push(
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
        ).bind(c.owner, recipe.foodId),
        ...ledgerCreditPair(
          env,
          c.id,
          c.owner,
          "boinglets",
          reward,
          "cook_reward",
          recipe.id,
          now,
        ),
        env.DB.prepare(
          "INSERT OR IGNORE INTO collection_unlocks(owner,entry_id,unlocked_at) VALUES(?,?,?)",
        ).bind(c.owner, `discovery:recipe:${recipe.id}`, now),
      );
      try {
        await env.DB.batch(statements);
      } catch {
        throw new HttpError(409, "Could not finish cooking");
      }
    }

    if (c.kind === "serve") {
      const foodId = String(payload.food_id);
      const recipe = recipeByFoodId(foodId);
      if (
        !recipe ||
        recipe.hungerBoost !== Number(payload.hunger_boost) ||
        recipe.energyBoost !== Number(payload.energy_boost)
      )
        throw new HttpError(409, "Dish config changed; retry");
      const served = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM snack_log WHERE owner=? AND day=?",
      )
        .bind(c.owner, day)
        .first<{ n: number }>();
      if ((served?.n || 0) >= SERVE_DAILY_CAP)
        throw new HttpError(409, "Daily serve limit reached");
      const have = await inventoryQty(env, c.owner, foodId);
      if (have < 1) throw new HttpError(409, "No dish to serve");
      try {
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE inventory SET qty=qty-1 WHERE owner=? AND item_id=? AND qty>=1",
          ).bind(c.owner, foodId),
          env.DB.prepare(
            "INSERT INTO snack_log(id,owner,food_id,created_at,day) VALUES(?,?,?,?,?)",
          ).bind(c.id, c.owner, foodId, now, day),
        ]);
      } catch {
        throw new HttpError(409, "Could not serve dish");
      }
    }

    await env.DB.prepare("DELETE FROM cook_challenges WHERE id=?")
      .bind(c.id)
      .run();
    return Response.json({ ok: true });
  }

  return null;
}

export function cookingError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
