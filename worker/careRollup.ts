import {
  applyCareToRollup,
  rollupFromEvents,
  type Action,
  type CareEvent,
  type CareRollup,
  type Pet,
} from "../src/core";

type RollupRow = {
  owner: string;
  last_care: number;
  last_fed: number;
  last_play: number;
  last_groom: number;
  care_days_json: string;
  action_counts_json: string;
  today_day: number;
  today_actions_json: string;
  had_balanced_day: number;
  updated_at: number;
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function rowToRollup(row: RollupRow): CareRollup {
  return {
    lastCare: row.last_care,
    lastFed: row.last_fed,
    lastPlay: row.last_play,
    lastGroom: row.last_groom,
    careDays: parseJson<number[]>(row.care_days_json, []),
    actionCounts: parseJson(row.action_counts_json, {
      hatch: 0,
      feed: 0,
      checkin: 0,
      play: 0,
      groom: 0,
    }),
    todayDay: row.today_day,
    todayActions: parseJson<Action[]>(row.today_actions_json, []),
    hadBalancedDay: !!row.had_balanced_day,
  };
}

export function saveRollupStatement(
  env: Env,
  owner: string,
  rollup: CareRollup,
  now: number,
) {
  return env.DB.prepare(
    `INSERT INTO pet_care_rollup(
      owner,last_care,last_fed,last_play,last_groom,
      care_days_json,action_counts_json,today_day,today_actions_json,
      had_balanced_day,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(owner) DO UPDATE SET
      last_care=excluded.last_care,
      last_fed=excluded.last_fed,
      last_play=excluded.last_play,
      last_groom=excluded.last_groom,
      care_days_json=excluded.care_days_json,
      action_counts_json=excluded.action_counts_json,
      today_day=excluded.today_day,
      today_actions_json=excluded.today_actions_json,
      had_balanced_day=excluded.had_balanced_day,
      updated_at=excluded.updated_at`,
  ).bind(
    owner,
    rollup.lastCare,
    rollup.lastFed,
    rollup.lastPlay,
    rollup.lastGroom,
    JSON.stringify(rollup.careDays),
    JSON.stringify(rollup.actionCounts),
    rollup.todayDay,
    JSON.stringify(rollup.todayActions),
    rollup.hadBalancedDay ? 1 : 0,
    now,
  );
}

/** Load rollup or rebuild once from events (backfill path). */
export async function loadOrBuildRollup(
  env: Env,
  pet: Pet,
  now: number,
): Promise<CareRollup> {
  const row = await env.DB.prepare(
    "SELECT * FROM pet_care_rollup WHERE owner=?",
  )
    .bind(pet.owner)
    .first<RollupRow>();
  if (row) return rowToRollup(row);

  const events = await env.DB.prepare(
    "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
  )
    .bind(pet.owner)
    .all<CareEvent>();
  const rollup = rollupFromEvents(pet, events.results, now);
  await saveRollupStatement(env, pet.owner, rollup, now).run();
  return rollup;
}

export async function bumpRollupAfterCare(
  env: Env,
  pet: Pet,
  action: Action,
  at: number,
): Promise<CareRollup> {
  const existing = await env.DB.prepare(
    "SELECT * FROM pet_care_rollup WHERE owner=?",
  )
    .bind(pet.owner)
    .first<RollupRow>();
  let rollup: CareRollup;
  if (existing) {
    rollup = applyCareToRollup(
      rowToRollup(existing),
      action,
      at,
      pet.created_at,
    );
  } else {
    const events = await env.DB.prepare(
      "SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at",
    )
      .bind(pet.owner)
      .all<CareEvent>();
    rollup = rollupFromEvents(pet, events.results, at);
  }
  await saveRollupStatement(env, pet.owner, rollup, at).run();
  return rollup;
}
