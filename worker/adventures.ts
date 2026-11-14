/**
 * Idle Adventures phase 1 engine.
 * Server clocks only: any client-provided `now` is ignored.
 * Rewards are written to D1 first, then queued for an operator mint.
 */
import { hex32 } from "../src/core";
import {
  ADVENTURE_EXCLUSIVE_ITEMS,
  ADVENTURE_LOCATION_DAILY_CAP,
  adventureDurationById,
  diminishingFactor,
  isAdventureDurationId,
  isAdventureLocationId,
  mulberry32,
  publicAdventureRates,
  resolveAdventureRewards,
  rollOutcome,
  seedFromParts,
  slotsForCompletions,
  snapshotStyleLuck,
  styleLuck,
  type AdventureOutcome,
} from "../src/content/adventures";
import { onchainItemByGameId } from "../src/content/onchainItems";
import { pushLedgerCredit } from "./ledger";
import { onchainConfig } from "./onchainItems";
import { resolveIncludedReceipt } from "./proof";
import { rpc as rpcCall, RpcRejected } from "./rpc";
import { HttpError, requireSocialSession } from "./social";

function writeChanges(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const row = result as { meta?: { changes?: number }; changes?: number };
  return Number(row.meta?.changes ?? row.changes ?? 0);
}

const UTC_DAY_MS = 86_400_000;
const RESUBMIT_AFTER_MS = 60_000;

type RunRow = {
  id: string;
  owner: string;
  location_id: string;
  duration_id: string;
  slot: number;
  style_snapshot: string;
  started_at: number;
  ends_at: number;
  completed_at: number | null;
  outcome: AdventureOutcome | null;
  status: "running" | "ready" | "claimed";
  claim_id: string | null;
  claimed_at: number | null;
  seed: number;
  diminishing: number;
  created_at: number;
};

type RewardRow = {
  id: string;
  run_id: string;
  owner: string;
  kind: string;
  game_item_id: string | null;
  currency: string | null;
  qty: number;
  rarity: string | null;
  duplicate: number;
  mint_status: string;
  mint_tx: string | null;
  mint_nonce: number | null;
  mint_error: string | null;
};

function utcDayStart(now: number): number {
  return Math.floor(now / UTC_DAY_MS) * UTC_DAY_MS;
}

function parseStyle(raw: string) {
  try {
    return JSON.parse(raw) as { cosmeticIds?: string[]; luck?: number };
  } catch {
    return { cosmeticIds: [], luck: 0 };
  }
}

async function ownerFromBody(
  req: Request,
  env: Env,
  body: Record<string, unknown> | undefined,
  now: number,
  required: boolean,
): Promise<string | null> {
  const raw =
    (typeof body?.owner === "string" && body.owner) ||
    new URL(req.url).searchParams.get("owner") ||
    "";
  if (!raw) {
    if (required) throw new HttpError(400, "Owner is required");
    return null;
  }
  const owner = hex32(raw);
  if (required) await requireSocialSession(req, env, owner, now);
  return owner;
}

async function loadMilestones(env: Env, owner: string, now: number) {
  const row = await env.DB.prepare(
    "SELECT completed_count, slots FROM adventure_milestones WHERE owner=?",
  )
    .bind(owner)
    .first<{ completed_count: number; slots: number }>();
  if (!row) {
    return { completed: 0, slots: slotsForCompletions(0) };
  }
  const slots = slotsForCompletions(row.completed_count);
  if (slots !== row.slots) {
    await env.DB.prepare(
      "UPDATE adventure_milestones SET slots=?, updated_at=? WHERE owner=?",
    )
      .bind(slots, now, owner)
      .run();
  }
  return { completed: row.completed_count, slots };
}

async function loadPity(env: Env, owner: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT misses FROM adventure_pity WHERE owner=?",
  )
    .bind(owner)
    .first<{ misses: number }>();
  return row?.misses ?? 0;
}

async function equippedCosmetics(env: Env, owner: string): Promise<string[]> {
  try {
    const res = await env.DB.prepare(
      "SELECT item_id FROM pet_cosmetics WHERE owner=?",
    )
      .bind(owner)
      .all<{ item_id: string }>();
    return (res.results ?? []).map((row) => row.item_id);
  } catch {
    return [];
  }
}

async function inventorySet(env: Env, owner: string): Promise<Set<string>> {
  const res = await env.DB.prepare(
    "SELECT item_id FROM inventory WHERE owner=? AND qty>0",
  )
    .bind(owner)
    .all<{ item_id: string }>();
  return new Set((res.results ?? []).map((row) => row.item_id));
}

async function completesToday(
  env: Env,
  owner: string,
  locationId: string,
  now: number,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM adventure_runs
     WHERE owner=? AND location_id=? AND started_at>=? AND status!='running'`,
  )
    .bind(owner, locationId, utcDayStart(now))
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function viewRun(run: RunRow, rewards: RewardRow[] = []) {
  return {
    id: run.id,
    locationId: run.location_id,
    durationId: run.duration_id,
    slot: run.slot,
    startedAt: run.started_at,
    endsAt: run.ends_at,
    completedAt: run.completed_at,
    outcome: run.outcome,
    status: run.status,
    claimId: run.claim_id,
    claimedAt: run.claimed_at,
    diminishing: run.diminishing,
    rewards: rewards.map((row) => ({
      id: row.id,
      kind: row.kind,
      gameItemId: row.game_item_id,
      currency: row.currency,
      qty: row.qty,
      rarity: row.rarity,
      duplicate: row.duplicate === 1,
      mintStatus: row.mint_status,
      mintTx: row.mint_tx,
    })),
  };
}

async function rewardsFor(env: Env, runId: string): Promise<RewardRow[]> {
  const res = await env.DB.prepare(
    "SELECT * FROM adventure_rewards WHERE run_id=? ORDER BY created_at",
  )
    .bind(runId)
    .all<RewardRow>();
  return res.results ?? [];
}

async function lazyComplete(
  env: Env,
  run: RunRow,
  now: number,
): Promise<RunRow> {
  if (run.status !== "running" || now < run.ends_at) return run;
  const style = parseStyle(run.style_snapshot);
  const rng = mulberry32(run.seed);
  const outcome = rollOutcome(
    rng,
    style.luck ?? styleLuck({ cosmeticIds: style.cosmeticIds ?? [], luck: 0 }),
  );
  const pity = await loadPity(env, run.owner);
  const owned = await inventorySet(env, run.owner);
  const duration = adventureDurationById(run.duration_id);
  const resolved = resolveAdventureRewards({
    rng,
    durationScale: duration?.yieldScale ?? 1,
    outcome,
    pityMisses: pity,
    ownedItemIds: owned,
    diminishing: run.diminishing,
  });
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE adventure_runs
       SET status='ready', outcome=?, completed_at=?
       WHERE id=? AND status='running'`,
    ).bind(outcome, now, run.id),
    env.DB.prepare(
      `INSERT INTO adventure_pity(owner,misses,updated_at) VALUES(?,?,?)
       ON CONFLICT(owner) DO UPDATE SET misses=excluded.misses, updated_at=excluded.updated_at`,
    ).bind(run.owner, resolved.pityAfter, now),
  ];
  for (const reward of resolved.rewards) {
    const id = crypto.randomUUID();
    const mintable =
      reward.kind === "item" &&
      !!reward.gameItemId &&
      !reward.duplicate &&
      (!!onchainItemByGameId(reward.gameItemId) ||
        !!ADVENTURE_EXCLUSIVE_ITEMS[reward.gameItemId]);
    statements.push(
      env.DB.prepare(
        `INSERT INTO adventure_rewards(
           id,run_id,owner,kind,game_item_id,currency,qty,rarity,duplicate,
           mint_status,mint_tx,mint_nonce,mint_error,created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?)`,
      ).bind(
        id,
        run.id,
        run.owner,
        reward.kind,
        reward.gameItemId ?? null,
        reward.currency ?? null,
        reward.qty,
        reward.rarity ?? null,
        reward.duplicate ? 1 : 0,
        mintable ? "pending" : "skipped",
        now,
        now,
      ),
    );
  }
  await env.DB.batch(statements);
  const next = await env.DB.prepare("SELECT * FROM adventure_runs WHERE id=?")
    .bind(run.id)
    .first<RunRow>();
  return next ?? { ...run, status: "ready", outcome, completed_at: now };
}

async function listOwnerRuns(env: Env, owner: string, now: number) {
  const res = await env.DB.prepare(
    "SELECT * FROM adventure_runs WHERE owner=? ORDER BY started_at DESC LIMIT 50",
  )
    .bind(owner)
    .all<RunRow>();
  const runs: RunRow[] = [];
  for (const row of res.results ?? []) {
    runs.push(await lazyComplete(env, row, now));
  }
  return runs;
}

async function enqueueMints(
  env: Env,
  rewards: RewardRow[],
  now: number,
): Promise<void> {
  const cfg = await onchainConfig(env);
  for (const reward of rewards) {
    if (reward.mint_status !== "pending" || !reward.game_item_id) continue;
    if (!cfg) {
      await env.DB.prepare(
        `UPDATE adventure_rewards
         SET mint_status='pending', mint_error=?, updated_at=?
         WHERE id=? AND mint_status='pending'`,
      )
        .bind("not_configured", now, reward.id)
        .run();
      continue;
    }
    // Queue row first so a crash cannot drop the reward. Nonce is attached later.
    await env.DB.prepare(
      `INSERT INTO operator_mint_queue(
         id,reward_id,owner,game_item_id,item_id,qty,admin_nonce,signed_tx,tx_hash,
         status,attempts,last_error,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,NULL,NULL,NULL,'queued',0,NULL,?,?)
       ON CONFLICT(reward_id) DO NOTHING`,
    )
      .bind(
        crypto.randomUUID(),
        reward.id,
        reward.owner,
        reward.game_item_id,
        onchainItemByGameId(reward.game_item_id)?.itemId ?? 0,
        reward.qty,
        now,
        now,
      )
      .run();
  }
}

async function settleMints(env: Env, now: number): Promise<void> {
  const cfg = await onchainConfig(env);
  if (!cfg) return;
  const queued = await env.DB.prepare(
    `SELECT * FROM operator_mint_queue
     WHERE status IN ('queued','submitted','failed')
     ORDER BY created_at LIMIT 8`,
  ).all<{
    id: string;
    reward_id: string;
    owner: string;
    tx_hash: string | null;
    status: string;
    updated_at: number;
    attempts: number;
  }>();
  for (const row of queued.results ?? []) {
    if (row.status === "submitted" && row.tx_hash) {
      try {
        const resolved = await resolveIncludedReceipt(
          (method, params) => rpcCall(env, method, params),
          row.tx_hash,
        );
        const receipt: { success?: boolean } | null = resolved.receipt;
        if (receipt?.success === true) {
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE operator_mint_queue SET status='minted', last_error=NULL, updated_at=? WHERE id=?",
            ).bind(now, row.id),
            env.DB.prepare(
              "UPDATE adventure_rewards SET mint_status='minted', mint_error=NULL, updated_at=? WHERE id=?",
            ).bind(now, row.reward_id),
          ]);
          continue;
        }
        if (receipt) {
          await env.DB.prepare(
            `UPDATE operator_mint_queue
             SET status='failed', last_error=?, attempts=attempts+1, updated_at=?
             WHERE id=?`,
          )
            .bind("mint_receipt_failed", now, row.id)
            .run();
          await env.DB.prepare(
            `UPDATE adventure_rewards
             SET mint_status='failed', mint_error=?, updated_at=?
             WHERE id=?`,
          )
            .bind("mint_receipt_failed", now, row.reward_id)
            .run();
        }
      } catch (error) {
        if (error instanceof RpcRejected) {
          /* leave submitted; retry later */
        }
      }
      continue;
    }
    if (now - row.updated_at < RESUBMIT_AFTER_MS && row.status !== "queued") {
      continue;
    }
    // Signing/submit happens only when the operator key is configured.
    // The D1 reward row stays pending until a receipt is included.
  }
}

async function creditRewards(
  env: Env,
  run: RunRow,
  rewards: RewardRow[],
  claimId: string,
  now: number,
) {
  const lock = await env.DB.prepare(
    `UPDATE adventure_runs
     SET status='claimed', claim_id=?, claimed_at=?
     WHERE id=? AND status='ready' AND claim_id IS NULL`,
  )
    .bind(claimId, now, run.id)
    .run();
  if (writeChanges(lock) === 0) {
    return env.DB.prepare("SELECT * FROM adventure_runs WHERE id=?")
      .bind(run.id)
      .first<RunRow>();
  }
  const milestone = await loadMilestones(env, run.owner, now);
  const completed = milestone.completed + 1;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO adventure_milestones(owner,completed_count,slots,updated_at)
       VALUES(?,?,?,?)
       ON CONFLICT(owner) DO UPDATE SET
         completed_count=excluded.completed_count,
         slots=excluded.slots,
         updated_at=excluded.updated_at`,
    ).bind(run.owner, completed, slotsForCompletions(completed), now),
  ];
  for (const reward of rewards) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO adventure_reward_grants(reward_id,run_id,created_at)
         VALUES(?,?,?)`,
      ).bind(reward.id, run.id, now),
    );
    if (reward.kind === "currency" || reward.kind === "consolation") {
      const currency =
        reward.currency === "sparkles" ? "sparkles" : "boinglets";
      pushLedgerCredit(
        statements,
        env,
        `adv:${reward.id}`,
        run.owner,
        currency,
        reward.qty,
        "adventure-claim",
        run.id,
        now,
      );
      continue;
    }
    if (reward.game_item_id) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?)
           ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+excluded.qty`,
        ).bind(run.owner, reward.game_item_id, reward.qty),
      );
    }
  }
  await env.DB.batch(statements);
  await enqueueMints(env, rewards, now);
  await settleMints(env, now);
  return env.DB.prepare("SELECT * FROM adventure_runs WHERE id=?")
    .bind(run.id)
    .first<RunRow>();
}

async function startAdventure(
  env: Env,
  owner: string,
  body: Record<string, unknown>,
  now: number,
) {
  const locationId = body.location_id;
  const durationId = body.duration_id;
  if (!isAdventureLocationId(locationId)) {
    throw new HttpError(400, "Unknown adventure location");
  }
  if (!isAdventureDurationId(durationId)) {
    throw new HttpError(400, "Unknown adventure duration");
  }
  const duration = adventureDurationById(durationId)!;
  const milestones = await loadMilestones(env, owner, now);
  const open = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM adventure_runs WHERE owner=? AND status IN ('running','ready')",
  )
    .bind(owner)
    .first<{ n: number }>();
  if ((open?.n ?? 0) >= milestones.slots) {
    throw new HttpError(
      409,
      "No open adventure slots. Come back when a run ends.",
    );
  }
  const prior = await completesToday(env, owner, locationId, now);
  if (prior >= ADVENTURE_LOCATION_DAILY_CAP) {
    throw new HttpError(429, "Daily cap for this location is already burned.");
  }
  const diminishing = diminishingFactor(prior);
  const cosmetics = await equippedCosmetics(env, owner);
  const style = snapshotStyleLuck(cosmetics);
  const id = crypto.randomUUID();
  const seed = seedFromParts(id, owner, locationId, durationId, now);
  await env.DB.prepare(
    `INSERT INTO adventure_runs(
       id,owner,location_id,duration_id,slot,style_snapshot,started_at,ends_at,
       completed_at,outcome,status,claim_id,claimed_at,seed,diminishing,created_at
     ) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,'running',NULL,NULL,?,?,?)`,
  )
    .bind(
      id,
      owner,
      locationId,
      durationId,
      (open?.n ?? 0) + 1,
      JSON.stringify(style),
      now,
      now + duration.minutes * 60_000,
      seed,
      diminishing,
      now,
    )
    .run();
  const run = await env.DB.prepare("SELECT * FROM adventure_runs WHERE id=?")
    .bind(id)
    .first<RunRow>();
  if (!run) throw new HttpError(500, "Adventure failed to start");
  return run;
}

async function claimRun(
  env: Env,
  owner: string,
  runId: string,
  now: number,
  claimId: string,
) {
  const raw = await env.DB.prepare(
    "SELECT * FROM adventure_runs WHERE id=? AND owner=?",
  )
    .bind(runId, owner)
    .first<RunRow>();
  if (!raw) throw new HttpError(404, "Adventure not found");
  const run = await lazyComplete(env, raw, now);
  if (run.status === "running") {
    throw new HttpError(
      425,
      "This run is still out. Come back when the timer ends.",
    );
  }
  if (run.status === "claimed") {
    return { run, rewards: await rewardsFor(env, run.id), idempotent: true };
  }
  const rewards = await rewardsFor(env, run.id);
  const claimed = await creditRewards(env, run, rewards, claimId, now);
  return {
    run: claimed ?? run,
    rewards: await rewardsFor(env, run.id),
    idempotent: false,
  };
}

export async function adventuresGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname === "/api/adventures/rates") {
    return Response.json({ rates: publicAdventureRates() });
  }
  if (url.pathname === "/api/adventures/history") {
    const owner = await ownerFromBody(req, env, undefined, now, true);
    const runs = await listOwnerRuns(env, owner!, now);
    const claimed = runs.filter((run) => run.status === "claimed");
    const views = [];
    for (const run of claimed) {
      views.push(viewRun(run, await rewardsFor(env, run.id)));
    }
    return Response.json({ history: views });
  }
  if (url.pathname !== "/api/adventures") return null;
  const owner = await ownerFromBody(req, env, undefined, now, false);
  if (owner) {
    try {
      await requireSocialSession(req, env, owner, now);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        /* public catalog still returns */
      } else if (error instanceof HttpError) throw error;
    }
  }
  await settleMints(env, now);
  const rates = publicAdventureRates();
  if (!owner) {
    return Response.json({
      locations: rates.locations,
      durations: rates.durations,
      rates,
      runs: [],
      slots: slotsForCompletions(0),
    });
  }
  const milestones = await loadMilestones(env, owner, now);
  const runs = await listOwnerRuns(env, owner, now);
  const views = [];
  for (const run of runs.filter((row) => row.status !== "claimed")) {
    views.push(viewRun(run, await rewardsFor(env, run.id)));
  }
  return Response.json({
    locations: rates.locations,
    durations: rates.durations,
    rates,
    runs: views,
    slots: milestones.slots,
    completed: milestones.completed,
    pity: await loadPity(env, owner),
  });
}

export async function adventuresPost(
  req: Request,
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  // Ignore any client-supplied clock.
  void body.now;
  void body.clientNow;
  void body.timestamp;
  if (url.pathname === "/api/adventures/start") {
    const owner = await ownerFromBody(req, env, body, now, true);
    const run = await startAdventure(env, owner!, body, now);
    return Response.json({ run: viewRun(run) });
  }
  if (url.pathname === "/api/adventures/claim") {
    const owner = await ownerFromBody(req, env, body, now, true);
    const runId = typeof body.run_id === "string" ? body.run_id : "";
    if (!runId) throw new HttpError(400, "run_id is required");
    const claimId =
      typeof body.claim_id === "string" && body.claim_id
        ? body.claim_id
        : crypto.randomUUID();
    const result = await claimRun(env, owner!, runId, now, claimId);
    return Response.json({
      run: viewRun(result.run as RunRow, result.rewards),
      idempotent: result.idempotent,
    });
  }
  if (url.pathname === "/api/adventures/claim-all") {
    const owner = await ownerFromBody(req, env, body, now, true);
    const runs = await listOwnerRuns(env, owner!, now);
    const ready = runs.filter((run) => run.status === "ready");
    const claimed = [];
    for (const run of ready) {
      const result = await claimRun(
        env,
        owner!,
        run.id,
        now,
        crypto.randomUUID(),
      );
      claimed.push(viewRun(result.run as RunRow, result.rewards));
    }
    return Response.json({ claimed, count: claimed.length });
  }
  return null;
}

export function adventuresError(error: unknown): Response | null {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}
