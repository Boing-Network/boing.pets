import { dayOf } from "../core";

export const ACTIVITY_ATTEMPT_DAILY_CAP = 3;
/** How long the player has to finish the mini-game after start. */
export const ACTIVITY_PLAY_WINDOW_MS = 45_000;
/** How long a successful unclaimed reward can be claimed. */
export const ACTIVITY_CLAIM_WINDOW_MS = 10 * 60_000;
/** Timing tolerance for click/key validation. */
export const ACTIVITY_TIMING_TOLERANCE_MS = 120;

export type ActivityId =
  "fishing" | "mining" | "racing" | "treasure" | "garden" | "cook";

export const ACTIVITY_IDS: ActivityId[] = [
  "fishing",
  "mining",
  "racing",
  "treasure",
  "garden",
  "cook",
];

export function isActivityId(value: string): value is ActivityId {
  return (ACTIVITY_IDS as string[]).includes(value);
}

export function activityDayKey(now: number): string {
  return `d:${dayOf(now)}`;
}
