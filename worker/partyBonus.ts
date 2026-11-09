import { dayOf } from "../src/core";
import { friendPair } from "../src/social";
import {
  computePartyBonus,
  VARIETY_DAY_MIN_KINDS,
  VARIETY_DAY_REWARD_BOINGLETS,
  PARTY_BONUS_MIN_CARE_EVENTS,
  PARTY_BONUS_MIN_FRIENDSHIP_MS,
  PARTY_BONUS_MIN_PET_AGE_MS,
  PARTY_TOGETHER_WINDOW_MS,
  type PartyActivity,
  type PartyBonusResult,
} from "../src/partyBonus";
import { ledgerCreditPair } from "./ledger";

export type { PartyBonusResult };

async function careEventCount(env: Env, owner: string) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM events WHERE owner=?",
  )
    .bind(owner)
    .first<{ n: number }>();
  return row?.n || 0;
}

async function friendshipAgeMs(
  env: Env,
  a: string,
  b: string,
  now: number,
): Promise<number | null> {
  const [x, y] = friendPair(a, b);
  const row = await env.DB.prepare(
    "SELECT created_at FROM friendships WHERE owner_a=? AND owner_b=?",
  )
    .bind(x, y)
    .first<{ created_at: number }>();
  if (!row) return null;
  return now - row.created_at;
}

async function bonusGrantedToday(env: Env, owner: string, now: number) {
  const dayStart = dayOf(now) * 86_400_000;
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(delta),0) AS n FROM ledger
     WHERE owner=? AND currency='boinglets' AND reason='party_bonus' AND created_at>=?`,
  )
    .bind(owner, dayStart)
    .first<{ n: number }>();
  return Number(row?.n || 0);
}

/**
 * Resolve an eligible party bonus for an activity reward.
 * Requires: party size >= 2, aged friendship with a mate, mature pet/care history.
 */
async function emptyExtras(
  env: Env,
  owner: string,
  activity: PartyActivity,
  now: number,
  baseReward: number,
) {
  const variety = await resolveVarietyDayBonus(env, owner, activity, now);
  return {
    bonus: computePartyBonus({
      partySize: 1,
      together: false,
      baseReward,
      bonusGrantedToday: 0,
    }),
    partyId: null as string | null,
    statements: variety.statements,
    varietyAwarded: variety.awarded,
  };
}

export async function resolvePartyBonus(
  env: Env,
  owner: string,
  activity: PartyActivity,
  baseReward: number,
  now: number,
): Promise<{
  bonus: PartyBonusResult;
  partyId: string | null;
  statements: D1PreparedStatement[];
  varietyAwarded: number;
}> {
  const membership = await env.DB.prepare(
    "SELECT party_id FROM party_members WHERE owner=?",
  )
    .bind(owner)
    .first<{ party_id: string }>();
  if (!membership) return emptyExtras(env, owner, activity, now, baseReward);

  const members = await env.DB.prepare(
    "SELECT owner FROM party_members WHERE party_id=?",
  )
    .bind(membership.party_id)
    .all<{ owner: string }>();
  const mates = members.results.map((m) => m.owner).filter((o) => o !== owner);
  if (mates.length < 1)
    return emptyExtras(env, owner, activity, now, baseReward);

  const pet = await env.DB.prepare("SELECT created_at FROM pets WHERE owner=?")
    .bind(owner)
    .first<{ created_at: number }>();
  if (!pet) return emptyExtras(env, owner, activity, now, baseReward);
  const careCount = await careEventCount(env, owner);
  const mature =
    now - pet.created_at >= PARTY_BONUS_MIN_PET_AGE_MS ||
    careCount >= PARTY_BONUS_MIN_CARE_EVENTS;
  if (!mature) return emptyExtras(env, owner, activity, now, baseReward);

  let trustedMate = false;
  for (const mate of mates) {
    const age = await friendshipAgeMs(env, owner, mate, now);
    if (age !== null && age >= PARTY_BONUS_MIN_FRIENDSHIP_MS) {
      trustedMate = true;
      break;
    }
  }
  if (!trustedMate) return emptyExtras(env, owner, activity, now, baseReward);

  const recent = await env.DB.prepare(
    `SELECT owner FROM party_activity_log
     WHERE party_id=? AND activity=? AND created_at>? AND owner!=?
     LIMIT 1`,
  )
    .bind(membership.party_id, activity, now - PARTY_TOGETHER_WINDOW_MS, owner)
    .first<{ owner: string }>();
  const together = !!recent;
  const granted = await bonusGrantedToday(env, owner, now);
  const bonus = computePartyBonus({
    partySize: mates.length + 1,
    together,
    baseReward,
    bonusGrantedToday: granted,
  });

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "INSERT INTO party_activity_log(id,party_id,owner,activity,created_at) VALUES(?,?,?,?,?)",
    ).bind(crypto.randomUUID(), membership.party_id, owner, activity, now),
  ];
  if (bonus.eligible && bonus.amount > 0) {
    statements.push(
      ...ledgerCreditPair(
        env,
        `party-bonus:${crypto.randomUUID()}`,
        owner,
        "boinglets",
        bonus.amount,
        "party_bonus",
        membership.party_id,
        now,
      ),
    );
  }
  const variety = await resolveVarietyDayBonus(env, owner, activity, now);
  statements.push(...variety.statements);
  return {
    bonus,
    partyId: membership.party_id,
    statements,
    varietyAwarded: variety.awarded,
  };
}

/** Grant a once-per-UTC-day variety bonus after 3+ distinct activity kinds. */
export async function resolveVarietyDayBonus(
  env: Env,
  owner: string,
  activity: PartyActivity,
  now: number,
): Promise<{
  awarded: number;
  statements: D1PreparedStatement[];
}> {
  const day = dayOf(now);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "INSERT OR IGNORE INTO activity_day_log(owner,day,activity) VALUES(?,?,?)",
    ).bind(owner, day, activity),
  ];
  const kinds = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM activity_day_log WHERE owner=? AND day=?",
  )
    .bind(owner, day)
    .first<{ n: number }>();
  // COUNT after insert-or-ignore may not include this row in same batch, so treat pending.
  const already = await env.DB.prepare(
    "SELECT 1 AS ok FROM activity_day_log WHERE owner=? AND day=? AND activity=?",
  )
    .bind(owner, day, activity)
    .first();
  const count = (kinds?.n || 0) + (already ? 0 : 1);
  if (count < VARIETY_DAY_MIN_KINDS) {
    return { awarded: 0, statements };
  }
  const prior = await env.DB.prepare(
    "SELECT 1 AS ok FROM ledger WHERE owner=? AND reason='variety_day' AND created_at>=? LIMIT 1",
  )
    .bind(owner, day * 86_400_000)
    .first();
  if (prior) return { awarded: 0, statements };
  statements.push(
    ...ledgerCreditPair(
      env,
      `variety-day:${crypto.randomUUID()}`,
      owner,
      "boinglets",
      VARIETY_DAY_REWARD_BOINGLETS,
      "variety_day",
      activity,
      now,
    ),
  );
  return { awarded: VARIETY_DAY_REWARD_BOINGLETS, statements };
}
