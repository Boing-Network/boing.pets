/** Pure formatting for the post-claim reward modal. */

import { activityTitle } from "./itemIcons";

export type ClaimRewardResult = {
  ok?: boolean;
  activity?: string;
  reward: {
    name: string;
    rarity?: string;
    rewardBoinglets: number;
    itemId?: string;
    kind?: string;
  };
  party_bonus?: { percent: number; amount: number } | null;
  variety_awarded?: number;
  remaining?: number;
  xp?: number;
  streak_sparkles?: number;
  sparkles?: number;
};

export type RewardLine = { key: string; label: string; value: string };

/** Prefer the activity the player just finished so a stale or mocked
 * payload cannot retitle another area's reward modal. */
export function claimResultForActivity(
  result: ClaimRewardResult,
  activity?: string,
): ClaimRewardResult {
  if (!activity) return result;
  return { ...result, activity };
}

export function formatRewardBreakdown(result: ClaimRewardResult): {
  activityTitle: string;
  itemName: string;
  itemId: string | null;
  rarity: string | null;
  lines: RewardLine[];
  totalBoinglets: number;
  remaining: number | null;
  extras: RewardLine[];
  summary: string;
} {
  const base = Number(result.reward?.rewardBoinglets) || 0;
  const party = result.party_bonus?.amount
    ? Number(result.party_bonus.amount)
    : 0;
  const partyPercent = result.party_bonus?.percent
    ? Math.round(result.party_bonus.percent * 100)
    : 0;
  const variety = Number(result.variety_awarded) || 0;
  const sparkles =
    Number(result.streak_sparkles) || Number(result.sparkles) || 0;
  const xp = Number(result.xp) || 0;
  const totalBoinglets = base + party + variety;

  const lines: RewardLine[] = [
    { key: "base", label: "Base", value: `+${base}ℬ` },
  ];
  if (party > 0) {
    lines.push({
      key: "party",
      label: partyPercent ? `Party +${partyPercent}%` : "Party",
      value: `+${party}ℬ`,
    });
  }
  if (variety > 0) {
    lines.push({
      key: "variety",
      label: "Variety day",
      value: `+${variety}ℬ`,
    });
  }
  if (sparkles > 0) {
    lines.push({
      key: "sparkles",
      label: "Streak Sparkles",
      value: `+${sparkles} Sparkles`,
    });
  }
  if (totalBoinglets !== base || lines.length > 1) {
    lines.push({
      key: "total",
      label: "Total Boinglets",
      value: `+${totalBoinglets}ℬ`,
    });
  }

  const extras: RewardLine[] = [];
  if (xp > 0) extras.push({ key: "xp", label: "XP", value: `+${xp} XP` });
  const remaining =
    typeof result.remaining === "number" && Number.isFinite(result.remaining)
      ? result.remaining
      : null;
  if (remaining !== null) {
    extras.push({
      key: "remaining",
      label: "Attempts left today",
      value: String(remaining),
    });
  }

  const itemName = result.reward?.name || "Reward";
  const title = activityTitle(result.activity);
  const summaryParts = [`Claimed ${itemName}`];
  if (totalBoinglets) summaryParts.push(`+${totalBoinglets} Boinglets`);
  if (sparkles) summaryParts.push(`+${sparkles} Sparkles`);
  if (xp) summaryParts.push(`+${xp} XP`);
  if (remaining !== null) {
    summaryParts.push(
      `${remaining} attempt${remaining === 1 ? "" : "s"} remaining today`,
    );
  }

  return {
    activityTitle: title,
    itemName,
    itemId: result.reward?.itemId || null,
    rarity: result.reward?.rarity || null,
    lines,
    totalBoinglets,
    remaining,
    extras,
    summary: summaryParts.join(". ") + ".",
  };
}
