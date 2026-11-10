import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import {
  ACTIVITY_ATTEMPT_DAILY_CAP,
  ACTIVITY_CLAIM_WINDOW_MS,
  ACTIVITY_PLAY_WINDOW_MS,
  ACTIVITY_TIMING_TOLERANCE_MS,
  activityDayKey,
  isActivityId,
  type ActivityId,
} from "../src/content/attempts";
import { pickFish } from "../src/content/fishing";
import { pickOre } from "../src/content/mining";
import { pickTreasure } from "../src/content/treasure";
import { ribbonByPlace } from "../src/content/racing";
import { hex32 } from "../src/core";
import {
  makeFishingSecret,
  validateFishingClick,
  type FishingInput,
  type FishingSecret,
} from "../src/minigames/fishingGame";
import {
  makeMiningSecret,
  validateMiningCombo,
  type MiningInput,
  type MiningSecret,
} from "../src/minigames/miningGame";
import {
  makeRacingSecret,
  validateRacingTaps,
  type RacingInput,
  type RacingSecret,
} from "../src/minigames/racingGame";
import {
  makeTreasureSecret,
  validateTreasureGuess,
  type TreasureInput,
  type TreasureSecret,
} from "../src/minigames/treasureGame";
import {
  makeGardenSecret,
  validateGardenHold,
  type GardenInput,
  type GardenSecret,
} from "../src/minigames/gardenGame";
import {
  makeCookSecret,
  validateCookOrder,
  type CookInput,
  type CookSecret,
} from "../src/minigames/cookGame";
import { ledgerCreditPair } from "./ledger";
import { resolvePartyBonus } from "./partyBonus";
import { HttpError, requireSocialSession } from "./social";

type AttemptStatus =
  "open" | "failed" | "success_pending" | "claimed" | "expired";

interface AttemptRow {
  id: string;
  owner: string;
  activity: string;
  day_key: string;
  status: AttemptStatus;
  secret_json: string;
  public_json: string;
  created_at: number;
  expires_at: number;
  resolved_at: number | null;
  claim_expires_at: number | null;
  reward_json: string | null;
}

interface RewardPayload {
  itemId: string;
  name: string;
  rarity: string;
  rewardBoinglets: number;
  kind: string;
}

async function verifyWalletSignature(
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

async function requirePet(env: Env, owner: string) {
  const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
    .bind(owner)
    .first();
  if (!pet) throw new HttpError(404, "Hatch a buddy before playing activities");
}

async function attemptsUsedToday(
  env: Env,
  owner: string,
  activity: ActivityId,
  dayKey: string,
) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM activity_attempts
     WHERE owner=? AND activity=? AND day_key=? AND status!= 'expired'`,
  )
    .bind(owner, activity, dayKey)
    .first<{ n: number }>();
  // Count finished attempts (failed + success_pending + claimed); open still in progress counts too
  return row?.n || 0;
}

function publicFromSecret(
  activity: ActivityId,
  secret: Record<string, unknown>,
): Record<string, unknown> {
  if (activity === "fishing") {
    const s = secret as unknown as FishingSecret;
    // Zone + phase are shown for playability; anti-cheat is attempt caps + claim sig.
    return {
      periodMs: s.periodMs,
      zoneStart: s.zoneStart,
      zoneWidth: s.zoneWidth,
      phase: s.phase,
    };
  }
  if (activity === "mining") {
    const s = secret as unknown as MiningSecret;
    return { combo: s.combo, timeLimitMs: s.timeLimitMs };
  }
  if (activity === "racing") {
    const s = secret as unknown as RacingSecret;
    return { beatsMs: s.beatsMs, windowMs: s.windowMs };
  }
  if (activity === "treasure") {
    const s = secret as unknown as TreasureSecret;
    return { gridSize: s.gridSize, flashMs: s.flashMs, spot: s.spot };
  }
  if (activity === "garden") {
    const s = secret as unknown as GardenSecret;
    return { targetHoldMs: s.targetHoldMs, windowMs: s.windowMs };
  }
  const s = secret as unknown as CookSecret;
  return {
    scrambled: s.scrambled,
    timeLimitMs: s.timeLimitMs,
    count: s.ingredients.length,
  };
}

function makeSecret(
  activity: ActivityId,
  seed: string,
): Record<string, unknown> {
  switch (activity) {
    case "fishing":
      return makeFishingSecret(seed) as unknown as Record<string, unknown>;
    case "mining":
      return makeMiningSecret(seed) as unknown as Record<string, unknown>;
    case "racing":
      return makeRacingSecret(seed) as unknown as Record<string, unknown>;
    case "treasure":
      return makeTreasureSecret(seed) as unknown as Record<string, unknown>;
    case "garden":
      return makeGardenSecret(seed) as unknown as Record<string, unknown>;
    case "cook":
      return makeCookSecret(seed) as unknown as Record<string, unknown>;
  }
}

function validateInput(
  activity: ActivityId,
  secret: Record<string, unknown>,
  input: Record<string, unknown>,
): boolean {
  const tol = ACTIVITY_TIMING_TOLERANCE_MS;
  switch (activity) {
    case "fishing":
      return validateFishingClick(
        secret as unknown as FishingSecret,
        input as unknown as FishingInput,
        ACTIVITY_PLAY_WINDOW_MS,
        tol,
      );
    case "mining":
      return validateMiningCombo(
        secret as unknown as MiningSecret,
        input as unknown as MiningInput,
        tol,
      );
    case "racing":
      return validateRacingTaps(
        secret as unknown as RacingSecret,
        input as unknown as RacingInput,
        tol,
      );
    case "treasure":
      return validateTreasureGuess(
        secret as unknown as TreasureSecret,
        input as unknown as TreasureInput,
        ACTIVITY_PLAY_WINDOW_MS,
      );
    case "garden":
      return validateGardenHold(
        secret as unknown as GardenSecret,
        input as unknown as GardenInput,
        tol,
      );
    case "cook":
      return validateCookOrder(
        secret as unknown as CookSecret,
        input as unknown as CookInput,
        tol,
      );
  }
}

function pickReward(activity: ActivityId, seed: string): RewardPayload {
  if (activity === "fishing") {
    const fish = pickFish(seed);
    return {
      itemId: fish.id,
      name: fish.name,
      rarity: fish.rarity,
      rewardBoinglets: fish.rewardBoinglets,
      kind: "fish",
    };
  }
  if (activity === "mining") {
    const ore = pickOre(seed, 1);
    return {
      itemId: ore.id,
      name: ore.name,
      rarity: ore.rarity,
      rewardBoinglets: ore.rewardBoinglets,
      kind: "ore",
    };
  }
  if (activity === "racing") {
    let h = 0;
    for (let i = 0; i < seed.length; i++)
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const place = ((h % 3) + 1) as 1 | 2 | 3;
    const ribbon = ribbonByPlace(place);
    return {
      itemId: ribbon.id,
      name: ribbon.name,
      rarity: `place-${place}`,
      rewardBoinglets: ribbon.rewardBoinglets,
      kind: "ribbon",
    };
  }
  if (activity === "treasure") {
    const loot = pickTreasure(seed);
    return {
      itemId: loot.id,
      name: loot.name,
      rarity: loot.rarity,
      rewardBoinglets: loot.rewardBoinglets,
      kind: "treasure",
    };
  }
  if (activity === "garden") {
    return {
      itemId: "crop-forage",
      name: "Foraged Greens",
      rarity: "common",
      rewardBoinglets: 6,
      kind: "crop",
    };
  }
  return {
    itemId: "food-snack",
    name: "Trail Snack",
    rarity: "common",
    rewardBoinglets: 8,
    kind: "food",
  };
}

function partyActivityName(
  activity: ActivityId,
): "fishing" | "mining" | "racing" | "treasure" | "garden_harvest" | "cook" {
  if (activity === "garden") return "garden_harvest";
  return activity;
}

export async function activityAttemptsGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/activity/attempts/status") return null;
  const activity = String(url.searchParams.get("activity") || "");
  if (!isActivityId(activity)) throw new HttpError(400, "Unknown activity");
  const ownerParam = url.searchParams.get("owner");
  const dayKey = activityDayKey(now);
  if (!ownerParam) {
    return Response.json({
      activity,
      dailyCap: ACTIVITY_ATTEMPT_DAILY_CAP,
      attemptsUsed: 0,
      remaining: ACTIVITY_ATTEMPT_DAILY_CAP,
      hatched: false,
      pendingClaim: null,
      dayKey,
      now,
    });
  }
  const owner = hex32(ownerParam);
  const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
    .bind(owner)
    .first();
  const used = await attemptsUsedToday(env, owner, activity, dayKey);
  let pendingClaim: {
    id: string;
    claim_expires_at: number;
    claim_message: string | null;
  } | null = null;
  const pending = await env.DB.prepare(
    `SELECT id,claim_expires_at,public_json FROM activity_attempts
     WHERE owner=? AND activity=? AND status='success_pending' AND claim_expires_at>?
     ORDER BY resolved_at DESC LIMIT 1`,
  )
    .bind(owner, activity, now)
    .first<{ id: string; claim_expires_at: number; public_json: string }>();
  if (pending) {
    let claimMessage: string | undefined;
    try {
      claimMessage = (
        JSON.parse(pending.public_json) as { claimMessage?: string }
      ).claimMessage;
    } catch {
      claimMessage = undefined;
    }
    pendingClaim = {
      id: pending.id,
      claim_expires_at: pending.claim_expires_at,
      claim_message: claimMessage || null,
    };
  }
  return Response.json({
    activity,
    dailyCap: ACTIVITY_ATTEMPT_DAILY_CAP,
    attemptsUsed: used,
    remaining: Math.max(0, ACTIVITY_ATTEMPT_DAILY_CAP - used),
    hatched: !!pet,
    pendingClaim,
    playWindowMs: ACTIVITY_PLAY_WINDOW_MS,
    claimWindowMs: ACTIVITY_CLAIM_WINDOW_MS,
    dayKey,
    now,
  });
}

export async function activityAttemptsPost(
  req: Request,
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/activity/attempt/start") {
    const activity = String(body.activity || "");
    if (!isActivityId(activity)) throw new HttpError(400, "Unknown activity");
    const owner = hex32(body.owner);
    await requireSocialSession(req, env, owner, now);
    await requirePet(env, owner);
    const dayKey = activityDayKey(now);
    // Expire stale open attempts
    await env.DB.prepare(
      `UPDATE activity_attempts SET status='failed', resolved_at=?
       WHERE owner=? AND status='open' AND expires_at<?`,
    )
      .bind(now, owner, now)
      .run();
    await env.DB.prepare(
      `UPDATE activity_attempts SET status='expired'
       WHERE owner=? AND status='success_pending' AND claim_expires_at<?`,
    )
      .bind(owner, now)
      .run();
    const used = await attemptsUsedToday(env, owner, activity, dayKey);
    if (used >= ACTIVITY_ATTEMPT_DAILY_CAP)
      throw new HttpError(
        409,
        "Daily attempt limit reached. Come back after UTC midnight.",
      );
    const open = await env.DB.prepare(
      `SELECT id FROM activity_attempts WHERE owner=? AND activity=? AND status='open' LIMIT 1`,
    )
      .bind(owner, activity)
      .first();
    if (open) throw new HttpError(409, "Finish your current attempt first");
    const pending = await env.DB.prepare(
      `SELECT id FROM activity_attempts
       WHERE owner=? AND activity=? AND status='success_pending' AND claim_expires_at>? LIMIT 1`,
    )
      .bind(owner, activity, now)
      .first();
    if (pending)
      throw new HttpError(
        409,
        "Claim or let expire your successful catch before trying again",
      );

    const id = crypto.randomUUID();
    const secret = makeSecret(activity, id);
    const pub = publicFromSecret(activity, secret);
    // Treasure: don't leak spot in public — flash handled client-side via one-time reveal endpoint?
    // For memory game, client needs spot briefly. Send spot only in start public for treasure flash.
    const expires = now + ACTIVITY_PLAY_WINDOW_MS;
    await env.DB.prepare(
      `INSERT INTO activity_attempts(
        id,owner,activity,day_key,status,secret_json,public_json,created_at,expires_at,resolved_at,claim_expires_at,reward_json
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        id,
        owner,
        activity,
        dayKey,
        "open",
        JSON.stringify(secret),
        JSON.stringify(pub),
        now,
        expires,
        null,
        null,
        null,
      )
      .run();
    return Response.json({
      id,
      activity,
      public: pub,
      created_at: now,
      expires_at: expires,
      remaining: Math.max(0, ACTIVITY_ATTEMPT_DAILY_CAP - used - 1),
      attemptsUsed: used + 1,
    });
  }

  if (url.pathname === "/api/activity/attempt/finish") {
    const id = String(body.id || "");
    const owner = hex32(body.owner);
    await requireSocialSession(req, env, owner, now);
    const row = await env.DB.prepare(
      "SELECT * FROM activity_attempts WHERE id=? AND owner=?",
    )
      .bind(id, owner)
      .first<AttemptRow>();
    if (!row) throw new HttpError(404, "Attempt not found");
    if (row.status !== "open")
      throw new HttpError(409, "Attempt already resolved");
    if (row.expires_at < now) {
      await env.DB.prepare(
        "UPDATE activity_attempts SET status='expired', resolved_at=? WHERE id=?",
      )
        .bind(now, id)
        .run();
      throw new HttpError(410, "Attempt expired");
    }
    const activity = row.activity as ActivityId;
    const secret = JSON.parse(row.secret_json) as Record<string, unknown>;
    const input =
      body.input && typeof body.input === "object"
        ? (body.input as Record<string, unknown>)
        : {};
    const ok = validateInput(activity, secret, input);
    if (!ok) {
      await env.DB.prepare(
        "UPDATE activity_attempts SET status='failed', resolved_at=? WHERE id=?",
      )
        .bind(now, id)
        .run();
      return Response.json({
        ok: false,
        status: "failed",
        message:
          "Missed it — no signature needed. Try again if you have attempts left.",
      });
    }
    const reward = pickReward(activity, id);
    const claimExpires = now + ACTIVITY_CLAIM_WINDOW_MS;
    const claimMessage = `Boing Pets claim v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nAttempt: ${id}\nActivity: ${activity}\nIssued: ${now}`;
    await env.DB.prepare(
      `UPDATE activity_attempts
       SET status='success_pending', resolved_at=?, claim_expires_at=?, reward_json=?, public_json=?
       WHERE id=?`,
    )
      .bind(
        now,
        claimExpires,
        JSON.stringify(reward),
        JSON.stringify({
          ...JSON.parse(row.public_json),
          claimMessage,
        }),
        id,
      )
      .run();
    // Outcome secrecy: do not return reward identity — only that claim is ready.
    return Response.json({
      ok: true,
      status: "success_pending",
      claim_expires_at: claimExpires,
      claim_message: claimMessage,
      message: "Nice! Sign to keep your reward (or let it expire).",
    });
  }

  if (url.pathname === "/api/activity/attempt/claim") {
    const id = String(body.id || "");
    const owner = hex32(body.owner);
    const signature = body.signature;
    const row = await env.DB.prepare(
      "SELECT * FROM activity_attempts WHERE id=? AND owner=?",
    )
      .bind(id, owner)
      .first<AttemptRow>();
    if (!row) throw new HttpError(404, "Attempt not found");
    if (row.status !== "success_pending")
      throw new HttpError(409, "Nothing to claim for this attempt");
    if (!row.claim_expires_at || row.claim_expires_at < now) {
      await env.DB.prepare(
        "UPDATE activity_attempts SET status='expired' WHERE id=?",
      )
        .bind(id)
        .run();
      throw new HttpError(410, "Claim window expired");
    }
    const pub = JSON.parse(row.public_json) as { claimMessage?: string };
    const message = pub.claimMessage;
    if (!message) throw new HttpError(500, "Claim message missing");
    await verifyWalletSignature(owner, message, signature);
    const reward = JSON.parse(
      row.reward_json || "null",
    ) as RewardPayload | null;
    if (!reward) throw new HttpError(500, "Reward missing");
    const activity = row.activity as ActivityId;
    const party = await resolvePartyBonus(
      env,
      owner,
      partyActivityName(activity),
      reward.rewardBoinglets,
      now,
    );
    try {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE activity_attempts SET status='claimed' WHERE id=? AND status='success_pending'",
        ).bind(id),
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
        ).bind(owner, reward.itemId),
        ...ledgerCreditPair(
          env,
          `attempt-claim:${id}`,
          owner,
          "boinglets",
          reward.rewardBoinglets,
          `activity_${activity}`,
          reward.itemId,
          now,
        ),
        ...party.statements,
      ]);
    } catch {
      throw new HttpError(409, "Claim already processed or ledger busy");
    }
    return Response.json({
      ok: true,
      reward,
      party_bonus: party.bonus.eligible ? party.bonus : null,
      variety_awarded: party.varietyAwarded || 0,
    });
  }

  return null;
}

export function activityAttemptsError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
