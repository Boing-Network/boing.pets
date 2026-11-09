import type { Action, CareEvent, Pet } from "../core";
import { dayOf, state } from "../core";

export type QuestKind = "story" | "daily" | "weekly" | "seasonal" | "pet";

export interface QuestDef {
  id: string;
  kind: QuestKind;
  title: string;
  description: string;
  rewardBoinglets: number;
  /** Optional seasonal event id that must be active. */
  eventId?: string;
}

export const QUESTS: QuestDef[] = [
  {
    id: "story_first_bounce",
    kind: "story",
    title: "First Bounce",
    description: "Hatch your permanent buddy.",
    rewardBoinglets: 25,
  },
  {
    id: "daily_hello",
    kind: "daily",
    title: "Say Hello",
    description: "Send today's signed hello.",
    rewardBoinglets: 8,
  },
  {
    id: "daily_full_care",
    kind: "daily",
    title: "Full Care Day",
    description: "Feed, hello, play, and groom today.",
    rewardBoinglets: 20,
  },
  {
    id: "weekly_streak_3",
    kind: "weekly",
    title: "Three-Day Glow",
    description: "Hold a care streak of at least 3.",
    rewardBoinglets: 35,
  },
  {
    id: "pet_playtime",
    kind: "pet",
    title: "Playful Bond",
    description: "Play with your buddy at least 3 times.",
    rewardBoinglets: 30,
  },
  {
    id: "seasonal_event_care",
    kind: "seasonal",
    title: "Seasonal Care",
    description: "Feed your buddy while a seasonal event is active.",
    rewardBoinglets: 40,
    eventId: "active",
  },
];

export function questById(id: string): QuestDef | null {
  return QUESTS.find((q) => q.id === id) ?? null;
}

function countAction(events: CareEvent[], action: Action): number {
  return events.filter((e) => e.action === action).length;
}

function todayActions(events: CareEvent[], now: number): Set<Action> {
  const today = dayOf(now);
  return new Set(
    events.filter((e) => dayOf(e.created_at) === today).map((e) => e.action),
  );
}

export function isQuestComplete(
  quest: QuestDef,
  pet: Pet | null,
  events: CareEvent[],
  now: number,
  activeEventIds: string[],
): boolean {
  if (!pet) return false;
  const s = state(pet, events, now);
  const today = todayActions(events, now);
  switch (quest.id) {
    case "story_first_bounce":
      return true;
    case "daily_hello":
      return today.has("checkin");
    case "daily_full_care":
      return (
        today.has("feed") &&
        today.has("checkin") &&
        today.has("play") &&
        today.has("groom")
      );
    case "weekly_streak_3":
      return s.streak >= 3;
    case "pet_playtime":
      return countAction(events, "play") >= 3;
    case "seasonal_event_care":
      return (
        activeEventIds.length > 0 &&
        events.some(
          (e) => e.action === "feed" && dayOf(e.created_at) === dayOf(now),
        )
      );
    default:
      return false;
  }
}

export function questPeriodKey(quest: QuestDef, now: number): string {
  const day = dayOf(now);
  if (quest.kind === "daily") return `d:${day}`;
  if (quest.kind === "weekly") return `w:${Math.floor(day / 7)}`;
  if (quest.kind === "seasonal") return `s:${day}`;
  return "once";
}
