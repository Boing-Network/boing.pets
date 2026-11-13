import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  unlockedCollections,
  COLLECTION_DEFS,
} from "../src/content/collections";
import {
  isQuestComplete,
  questById,
  questPeriodKey,
  QUESTS,
} from "../src/content/quests";
import {
  buildDailyQuestView,
  collectClaimedActivitiesByDay,
  DAILY_QUEST_LOOKBACK_DAYS,
  DAILY_STREAK_BONUS_ID,
  DAILY_STREAK_RIBBON_ID,
  dayKeyForDay,
  STREAK_COSMETIC_ID,
  type DailyQuestView,
} from "../src/content/dailyQuests";
import { activeEvents } from "../src/content/seasons";
import { dayOf, hex32, traits, type CareEvent, type Pet } from "../src/core";
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
  if (typeof signature !== "string" || !/^(0x)?[0-9a-f]{128}$/i.test(signature))
    throw new HttpError(400, "Invalid signature format");
  const ok = await ed.verifyAsync(
    hexToBytes(signature.replace(/^0x/i, "")),
    blake3(new TextEncoder().encode(message)),
    hexToBytes(owner.slice(2)),
  );
  if (!ok) throw new HttpError(403, "Signature does not match");
}

async function loadDailyQuestView(
  env: Env,
  owner: string | null,
  now: number,
): Promise<DailyQuestView> {
  if (!owner) {
    return buildDailyQuestView({
      now,
      claimedByDay: new Map(),
      bonusClaimedForDay: false,
      ribbonAlreadyOwned: false,
    });
  }
  const minKey = dayKeyForDay(dayOf(now) - DAILY_QUEST_LOOKBACK_DAYS);
  const rows = await env.DB.prepare(
    "SELECT activity, day_key FROM activity_attempts WHERE owner=? AND status='claimed' AND day_key>=?",
  )
    .bind(owner, minKey)
    .all<{ activity: string; day_key: string }>();
  const claims = await env.DB.prepare(
    "SELECT quest_id, period_key FROM quest_claims WHERE owner=? AND quest_id IN (?, ?)",
  )
    .bind(owner, DAILY_STREAK_BONUS_ID, DAILY_STREAK_RIBBON_ID)
    .all<{ quest_id: string; period_key: string }>();
  const ribbonRow = await env.DB.prepare(
    "SELECT qty FROM inventory WHERE owner=? AND item_id=?",
  )
    .bind(owner, STREAK_COSMETIC_ID)
    .first<{ qty: number }>();
  const dayKey = dayKeyForDay(dayOf(now));
  const bonusClaimedForDay = claims.results.some(
    (c) => c.quest_id === DAILY_STREAK_BONUS_ID && c.period_key === dayKey,
  );
  const ribbonClaimed = claims.results.some(
    (c) => c.quest_id === DAILY_STREAK_RIBBON_ID,
  );
  return buildDailyQuestView({
    now,
    claimedByDay: collectClaimedActivitiesByDay(rows.results),
    bonusClaimedForDay,
    ribbonAlreadyOwned: ribbonClaimed || (ribbonRow?.qty || 0) > 0,
  });
}

export async function contentGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname === "/api/content/seasons") {
    return Response.json({
      active: activeEvents(now),
      now,
    });
  }
  if (url.pathname === "/api/content/quests") {
    const ownerParam = url.searchParams.get("owner");
    const active = activeEvents(now);
    const activeIds = active.map((e) => e.id);
    if (!ownerParam) {
      return Response.json({
        quests: QUESTS.map((q) => ({ ...q, complete: false, claimed: false })),
        dailies: await loadDailyQuestView(env, null, now),
        activeEvents: active,
        now,
      });
    }
    const owner = hex32(ownerParam);
    const pet = await env.DB.prepare("SELECT * FROM pets WHERE owner=?")
      .bind(owner)
      .first<Pet>();
    const events = pet
      ? (
          await env.DB.prepare(
            "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
          )
            .bind(owner)
            .all<CareEvent>()
        ).results
      : [];
    const claims = await env.DB.prepare(
      "SELECT quest_id,period_key FROM quest_claims WHERE owner=?",
    )
      .bind(owner)
      .all<{ quest_id: string; period_key: string }>();
    const claimed = new Set(
      claims.results.map((c) => `${c.quest_id}:${c.period_key}`),
    );
    return Response.json({
      quests: QUESTS.map((q) => {
        const period = questPeriodKey(q, now);
        return {
          ...q,
          period,
          complete: isQuestComplete(q, pet, events, now, activeIds),
          claimed: claimed.has(`${q.id}:${period}`),
        };
      }),
      activeEvents: active,
      dailies: await loadDailyQuestView(env, owner, now),
      now,
    });
  }
  if (url.pathname === "/api/content/dailies") {
    const ownerParam = url.searchParams.get("owner");
    const owner = ownerParam ? hex32(ownerParam) : null;
    return Response.json({
      dailies: await loadDailyQuestView(env, owner, now),
      now,
    });
  }
  if (url.pathname === "/api/content/collections") {
    const ownerParam = url.searchParams.get("owner");
    if (!ownerParam) {
      return Response.json({ defs: COLLECTION_DEFS, unlocked: [], now });
    }
    const owner = hex32(ownerParam);
    const pet = await env.DB.prepare("SELECT * FROM pets WHERE owner=?")
      .bind(owner)
      .first<Pet>();
    const events = pet
      ? (
          await env.DB.prepare(
            "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
          )
            .bind(owner)
            .all<CareEvent>()
        ).results
      : [];
    const inv = await env.DB.prepare(
      "SELECT item_id FROM inventory WHERE owner=? AND qty>0",
    )
      .bind(owner)
      .all<{ item_id: string }>();
    const species = pet ? traits(pet.owner, pet.hatch_tx).species : null;
    const unlocked = unlockedCollections({
      pet,
      species,
      events,
      inventoryIds: inv.results.map((i) => i.item_id),
      now,
    });
    for (const entryId of unlocked) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO collection_unlocks(owner,entry_id,unlocked_at) VALUES(?,?,?)",
      )
        .bind(owner, entryId, now)
        .run();
    }
    const stored = await env.DB.prepare(
      "SELECT entry_id,unlocked_at FROM collection_unlocks WHERE owner=? ORDER BY unlocked_at",
    )
      .bind(owner)
      .all<{ entry_id: string; unlocked_at: number }>();
    return Response.json({
      defs: COLLECTION_DEFS,
      unlocked: stored.results,
      now,
    });
  }
  return null;
}

export async function contentPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/content/quest/challenge") {
    const owner = hex32(body.owner);
    const quest = questById(String(body.quest_id || ""));
    if (!quest) throw new HttpError(404, "Unknown quest");
    const pet = await env.DB.prepare("SELECT * FROM pets WHERE owner=?")
      .bind(owner)
      .first<Pet>();
    const events = pet
      ? (
          await env.DB.prepare(
            "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
          )
            .bind(owner)
            .all<CareEvent>()
        ).results
      : [];
    const activeIds = activeEvents(now).map((e) => e.id);
    if (!isQuestComplete(quest, pet, events, now, activeIds))
      throw new HttpError(409, "Quest is not complete yet");
    const period = questPeriodKey(quest, now);
    const already = await env.DB.prepare(
      "SELECT quest_id FROM quest_claims WHERE owner=? AND quest_id=? AND period_key=?",
    )
      .bind(owner, quest.id, period)
      .first();
    if (already) throw new HttpError(409, "Quest reward already claimed");
    const id = crypto.randomUUID();
    const expires = now + 10 * 60_000;
    const payload = {
      quest_id: quest.id,
      period,
      reward: quest.rewardBoinglets,
    };
    const message = `Boing Pets quest v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nQuest: ${quest.id}\nPeriod: ${period}\nReward: ${quest.rewardBoinglets}\nNonce: ${id}\nExpires: ${expires}`;
    await env.DB.prepare(
      "INSERT INTO content_challenges(id,owner,kind,payload,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        owner,
        "quest_claim",
        JSON.stringify(payload),
        message,
        now,
        expires,
      )
      .run();
    return Response.json({
      id,
      message,
      expires_at: expires,
      ...payload,
    });
  }

  if (url.pathname === "/api/content/quest/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid quest challenge");
    const c = await env.DB.prepare(
      "SELECT * FROM content_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        kind: string;
        payload: string;
        message: string;
        expires_at: number;
      }>();
    if (!c || c.kind !== "quest_claim")
      throw new HttpError(404, "Quest challenge not found");
    if (c.expires_at < now) throw new HttpError(410, "Quest challenge expired");
    await verifySignature(c.owner, c.message, body.signature);
    const payload = JSON.parse(c.payload) as {
      quest_id: string;
      period: string;
      reward: number;
    };
    const quest = questById(payload.quest_id);
    if (!quest || quest.rewardBoinglets !== payload.reward)
      throw new HttpError(409, "Quest config changed; retry");
    const pet = await env.DB.prepare("SELECT * FROM pets WHERE owner=?")
      .bind(c.owner)
      .first<Pet>();
    const events = pet
      ? (
          await env.DB.prepare(
            "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
          )
            .bind(c.owner)
            .all<CareEvent>()
        ).results
      : [];
    if (
      !isQuestComplete(
        quest,
        pet,
        events,
        now,
        activeEvents(now).map((e) => e.id),
      )
    )
      throw new HttpError(409, "Quest no longer complete");
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO quest_claims(owner,quest_id,period_key,claimed_at) VALUES(?,?,?,?)",
        ).bind(c.owner, payload.quest_id, payload.period, now),
        ...ledgerCreditPair(
          env,
          c.id,
          c.owner,
          "boinglets",
          payload.reward,
          "quest_reward",
          payload.quest_id,
          now,
        ),
        env.DB.prepare(
          "INSERT OR IGNORE INTO titles(owner,code,unlocked_at) VALUES(?,?,?)",
        ).bind(c.owner, `quest:${payload.quest_id}`, now),
      ]);
    } catch {
      throw new HttpError(409, "Quest already claimed or ledger busy");
    }
    await env.DB.prepare("DELETE FROM content_challenges WHERE id=?")
      .bind(c.id)
      .run();
    return Response.json({ ok: true, reward: payload.reward });
  }

  if (url.pathname === "/api/content/dailies/challenge") {
    const owner = hex32(body.owner);
    const view = await loadDailyQuestView(env, owner, now);
    if (!view.bonus.eligible)
      throw new HttpError(409, "Daily streak bonus is not ready to claim");
    const id = crypto.randomUUID();
    const expires = now + 10 * 60_000;
    const payload = {
      quest_id: DAILY_STREAK_BONUS_ID,
      period: view.dayKey,
      reward: view.bonus.rewardBoinglets,
      cosmeticId: view.bonus.cosmeticId,
      streak: view.streak,
    };
    const message = [
      "Boing Pets daily streak v1",
      "Origin: " + env.APP_ORIGIN,
      "Chain: 6913",
      "Owner: " + owner,
      "Quest: " + payload.quest_id,
      "Period: " + payload.period,
      "Reward: " + String(payload.reward),
      "Cosmetic: " + (payload.cosmeticId || "none"),
      "Streak: " + String(payload.streak),
      "Nonce: " + id,
      "Expires: " + String(expires),
    ].join("\n");
    await env.DB.prepare(
      "INSERT INTO content_challenges(id,owner,kind,payload,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        owner,
        "quest_claim",
        JSON.stringify(payload),
        message,
        now,
        expires,
      )
      .run();
    return Response.json({
      id,
      message,
      expires_at: expires,
      ...payload,
    });
  }

  if (url.pathname === "/api/content/dailies/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid daily streak challenge");
    const c = await env.DB.prepare(
      "SELECT * FROM content_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        kind: string;
        payload: string;
        message: string;
        expires_at: number;
      }>();
    if (!c || c.kind !== "quest_claim")
      throw new HttpError(404, "Daily streak challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Daily streak challenge expired");
    await verifySignature(c.owner, c.message, body.signature);
    const payload = JSON.parse(c.payload) as {
      quest_id: string;
      period: string;
      reward: number;
      cosmeticId: string | null;
      streak: number;
    };
    const view = await loadDailyQuestView(env, c.owner, now);
    if (!view.allComplete || view.bonus.claimed)
      throw new HttpError(409, "Daily streak bonus is not claimable");
    if (
      payload.quest_id !== DAILY_STREAK_BONUS_ID ||
      payload.period !== view.dayKey ||
      payload.reward !== view.bonus.rewardBoinglets ||
      (payload.cosmeticId || null) !== (view.bonus.cosmeticId || null)
    )
      throw new HttpError(409, "Daily streak bonus changed; retry");
    const statements = [
      env.DB.prepare(
        "INSERT INTO quest_claims(owner,quest_id,period_key,claimed_at) VALUES(?,?,?,?)",
      ).bind(c.owner, DAILY_STREAK_BONUS_ID, payload.period, now),
      ...ledgerCreditPair(
        env,
        c.id,
        c.owner,
        "boinglets",
        payload.reward,
        "daily_streak_bonus",
        payload.period,
        now,
      ),
    ];
    if (payload.cosmeticId === STREAK_COSMETIC_ID) {
      statements.push(
        env.DB.prepare(
          "INSERT OR IGNORE INTO quest_claims(owner,quest_id,period_key,claimed_at) VALUES(?,?,?,?)",
        ).bind(c.owner, DAILY_STREAK_RIBBON_ID, "once", now),
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
        ).bind(c.owner, STREAK_COSMETIC_ID),
        env.DB.prepare(
          "INSERT INTO inventory_acquisitions(id,owner,item_id,qty,source,from_owner,created_at) VALUES(?,?,?,?,?,?,?)",
        ).bind(
          c.id + ":ribbon",
          c.owner,
          STREAK_COSMETIC_ID,
          1,
          "daily_streak",
          null,
          now,
        ),
      );
    }
    try {
      await env.DB.batch(statements);
    } catch {
      throw new HttpError(
        409,
        "Daily streak bonus already claimed or ledger busy",
      );
    }
    await env.DB.prepare("DELETE FROM content_challenges WHERE id=?")
      .bind(c.id)
      .run();
    return Response.json({
      ok: true,
      reward: payload.reward,
      cosmeticId: payload.cosmeticId,
      streak: payload.streak,
    });
  }

  return null;
}

export function contentError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  return null;
}
