/** First-visit-each-day recap: daily quests, streak, and recent market sales. */

import { dayOf } from "../core";
import type { DailyQuestView } from "../content/dailyQuests";

export const SESSION_RECAP_STORAGE_KEY = "boing-pets-session-recap-v1";

export type RecapPayout = {
  id: string;
  kind?: string;
  amount_boing: string;
  status: string;
  created_at?: number;
  updated_at?: number;
};

export type SessionRecapStored = {
  lastVisitAt: number;
  lastDismissedDay: string | null;
};

export type SessionRecapSale = {
  id: string;
  amount_boing: string;
  status: string;
};

export type SessionRecapView = {
  dayKey: string;
  streak: number;
  goals: Array<{ title: string; complete: boolean }>;
  completeCount: number;
  goalCount: number;
  bonusTitle: string | null;
  bonusEligible: boolean;
  sales: SessionRecapSale[];
};

export function recapDayKey(now: number): string {
  return "d:" + String(dayOf(now));
}

export function defaultSessionRecapStored(): SessionRecapStored {
  return { lastVisitAt: 0, lastDismissedDay: null };
}

export function readSessionRecapStored(raw: string | null): SessionRecapStored {
  if (!raw) return defaultSessionRecapStored();
  try {
    const parsed = JSON.parse(raw) as SessionRecapStored;
    return {
      lastVisitAt:
        typeof parsed.lastVisitAt === "number" && parsed.lastVisitAt >= 0
          ? parsed.lastVisitAt
          : 0,
      lastDismissedDay:
        typeof parsed.lastDismissedDay === "string"
          ? parsed.lastDismissedDay
          : null,
    };
  } catch {
    return defaultSessionRecapStored();
  }
}

export function shouldShowSessionRecap(
  stored: SessionRecapStored,
  now: number,
): boolean {
  return stored.lastDismissedDay !== recapDayKey(now);
}

export function dismissSessionRecap(now: number): SessionRecapStored {
  return { lastVisitAt: now, lastDismissedDay: recapDayKey(now) };
}

export function payoutTimestamp(payout: RecapPayout): number {
  return typeof payout.created_at === "number"
    ? payout.created_at
    : typeof payout.updated_at === "number"
      ? payout.updated_at
      : 0;
}

export function buildSessionRecap(input: {
  now: number;
  lastVisitAt: number;
  dailies?: Pick<
    DailyQuestView,
    "goals" | "completeCount" | "streak" | "bonus"
  > | null;
  payouts?: RecapPayout[] | null;
}): SessionRecapView {
  const goals = (input.dailies?.goals ?? []).map((goal) => ({
    title: goal.title,
    complete: !!goal.complete,
  }));
  const sales = (input.payouts ?? [])
    .filter(
      (payout) =>
        (payout.kind ?? "seller") !== "sink" &&
        payoutTimestamp(payout) > input.lastVisitAt,
    )
    .slice(0, 5)
    .map((payout) => ({
      id: payout.id,
      amount_boing: payout.amount_boing,
      status: payout.status,
    }));
  return {
    dayKey: recapDayKey(input.now),
    streak: input.dailies?.streak ?? 0,
    goals,
    completeCount: input.dailies?.completeCount ?? 0,
    goalCount: goals.length,
    bonusTitle: input.dailies?.bonus?.title ?? null,
    bonusEligible: !!input.dailies?.bonus?.eligible,
    sales,
  };
}
