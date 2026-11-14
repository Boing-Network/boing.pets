import { describe, expect, it } from "vitest";
import {
  buildSessionRecap,
  dismissSessionRecap,
  readSessionRecapStored,
  recapDayKey,
  shouldShowSessionRecap,
} from "../src/pasture3d/sessionRecap";

const now = Date.UTC(2026, 10, 13, 18, 0, 0);

describe("session recap", () => {
  it("shows once per UTC day until dismissed, then stays hidden", () => {
    const empty = readSessionRecapStored(null);
    expect(shouldShowSessionRecap(empty, now)).toBe(true);
    const dismissed = dismissSessionRecap(now);
    expect(dismissed.lastDismissedDay).toBe(recapDayKey(now));
    expect(shouldShowSessionRecap(dismissed, now)).toBe(false);
    const nextDay = now + 24 * 60 * 60 * 1000;
    expect(shouldShowSessionRecap(dismissed, nextDay)).toBe(true);
  });

  it("summarizes daily quests, streak, and sales since the last visit", () => {
    const view = buildSessionRecap({
      now,
      lastVisitAt: now - 60_000,
      dailies: {
        streak: 3,
        completeCount: 1,
        goals: [
          {
            title: "Pond Catch",
            complete: true,
            activity: "fishing",
            id: "a",
            description: "",
            href: "",
          },
          {
            title: "Quarry Run",
            complete: false,
            activity: "mining",
            id: "b",
            description: "",
            href: "",
          },
        ],
        bonus: {
          id: "daily_streak_bonus",
          title: "3-day streak bonus",
          rewardBoinglets: 20,
          cosmeticId: null,
          eligible: false,
          claimed: false,
        },
      },
      payouts: [
        {
          id: "old",
          kind: "seller",
          amount_boing: "1",
          status: "confirmed",
          created_at: now - 120_000,
        },
        {
          id: "new",
          kind: "seller",
          amount_boing: "2",
          status: "pending",
          created_at: now - 10_000,
        },
        {
          id: "sink",
          kind: "sink",
          amount_boing: "9",
          status: "confirmed",
          created_at: now - 10_000,
        },
      ],
    });
    expect(view.streak).toBe(3);
    expect(view.completeCount).toBe(1);
    expect(view.goalCount).toBe(2);
    expect(view.goals[0]).toEqual({ title: "Pond Catch", complete: true });
    expect(view.bonusTitle).toBe("3-day streak bonus");
    expect(view.sales.map((sale) => sale.id)).toEqual(["new"]);
  });
});
