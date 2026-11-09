/** Server-authoritative party reward boosts for shared activities. */

export const PARTY_BONUS_PER_EXTRA = 0.1;
export const PARTY_BONUS_CAP = 0.3;
export const PARTY_TOGETHER_BONUS = 0.05;
export const PARTY_TOGETHER_WINDOW_MS = 15 * 60_000;
export const PARTY_BONUS_DAILY_CAP_BOINGLETS = 50;
/** Pet must be at least this old, or have this many care events. */
export const PARTY_BONUS_MIN_PET_AGE_MS = 24 * 60 * 60_000;
export const PARTY_BONUS_MIN_CARE_EVENTS = 3;
/** Friendship with a party mate must be at least this old. */
export const PARTY_BONUS_MIN_FRIENDSHIP_MS = 12 * 60 * 60_000;

export type PartyActivity =
  "fishing" | "mining" | "racing" | "treasure" | "garden_harvest" | "cook";

export interface PartyBonusInput {
  partySize: number;
  together: boolean;
  baseReward: number;
  bonusGrantedToday: number;
}

export interface PartyBonusResult {
  eligible: boolean;
  percent: number;
  amount: number;
  together: boolean;
  partySize: number;
  cappedByDaily: boolean;
}

export function partyBonusPercent(
  partySize: number,
  together: boolean,
): number {
  if (partySize < 2) return 0;
  const base = Math.min(
    PARTY_BONUS_CAP,
    (partySize - 1) * PARTY_BONUS_PER_EXTRA,
  );
  const withTogether = together
    ? Math.min(PARTY_BONUS_CAP, base + PARTY_TOGETHER_BONUS)
    : base;
  return Math.round(withTogether * 1000) / 1000;
}

export function computePartyBonus(input: PartyBonusInput): PartyBonusResult {
  const percent = partyBonusPercent(input.partySize, input.together);
  if (percent <= 0 || input.baseReward <= 0) {
    return {
      eligible: false,
      percent: 0,
      amount: 0,
      together: input.together,
      partySize: input.partySize,
      cappedByDaily: false,
    };
  }
  // Small catches still get at least 1 Boinglet when a party % applies.
  const raw = Math.max(1, Math.floor(input.baseReward * percent));
  const remaining = Math.max(
    0,
    PARTY_BONUS_DAILY_CAP_BOINGLETS - input.bonusGrantedToday,
  );
  const amount = Math.min(raw, remaining);
  return {
    eligible: amount > 0,
    percent,
    amount,
    together: input.together,
    partySize: input.partySize,
    cappedByDaily: amount < raw,
  };
}

/** Variety day: 3+ distinct activity kinds in one UTC day. */
export const VARIETY_DAY_MIN_KINDS = 3;
export const VARIETY_DAY_REWARD_BOINGLETS = 10;

/** Care streak milestone Sparkles. */
export const STREAK_MILESTONE_SPARKLES: Record<number, number> = {
  3: 3,
  7: 7,
};
