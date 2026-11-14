/** Shared daily try/cap + quest progress for the pasture HUD and station prompts. */

import {
  ACTIVITY_ATTEMPT_DAILY_CAP,
  ACTIVITY_IDS,
  type ActivityId,
} from "../content/attempts";
import type { DailyQuestView } from "../content/dailyQuests";
import { ACTIVITY_AREA_META } from "./activityAreas";
import {
  ACTIVITY_STATION_KINDS,
  type ActivityStationKind,
} from "./stationInteract";

export const AREA_PROGRESS_LABELS: Record<ActivityId, string> = {
  fishing: "Fish",
  mining: "Mine",
  racing: "Race",
  treasure: "Dig",
  garden: "Garden",
  cook: "Cook",
};

export type AreaAttemptSnapshot = {
  activity: ActivityId;
  attemptsUsed: number;
  dailyCap: number;
  remaining: number;
};

export type AreaProgress = {
  activity: ActivityId;
  kind: ActivityStationKind;
  label: string;
  used: number;
  cap: number;
  remaining: number;
  quest: boolean;
  questComplete: boolean;
};

export type DailyProgress = {
  areas: AreaProgress[];
  completeCount: number;
  goalCount: number;
  allComplete: boolean;
  streak: number;
};

export function activityIdForStation(kind: string): ActivityId | null {
  if (!(ACTIVITY_STATION_KINDS as readonly string[]).includes(kind))
    return null;
  return ACTIVITY_AREA_META[kind as ActivityStationKind].activity;
}

export function stationKindForActivity(
  activity: ActivityId,
): ActivityStationKind {
  const hit = Object.values(ACTIVITY_AREA_META).find(
    (meta) => meta.activity === activity,
  );
  return hit?.kind ?? "cook";
}

export function formatAreaTries(area: {
  label: string;
  used: number;
  cap: number;
}): string {
  return `${area.label} ${area.used}/${area.cap}`;
}

export function formatAreaLine(area: AreaProgress): string {
  const tries = formatAreaTries(area);
  if (!area.quest) return tries;
  return area.questComplete ? `${tries} · quest done` : `${tries} · quest`;
}

export function formatDailyChipTitle(progress: DailyProgress): string {
  return `Daily ${progress.completeCount}/${progress.goalCount}`;
}

export function buildDailyProgress(input: {
  dailies?: Pick<
    DailyQuestView,
    "goals" | "completeCount" | "allComplete" | "streak"
  > | null;
  attempts?: Partial<Record<ActivityId, AreaAttemptSnapshot>> | null;
}): DailyProgress {
  const goals = input.dailies?.goals ?? [];
  const questByActivity = new Map(
    goals.map((goal) => [goal.activity, goal.complete] as const),
  );
  const areas: AreaProgress[] = ACTIVITY_IDS.map((activity) => {
    const snap = input.attempts?.[activity];
    const cap = snap?.dailyCap ?? ACTIVITY_ATTEMPT_DAILY_CAP;
    const used = snap?.attemptsUsed ?? 0;
    const questComplete = questByActivity.get(activity);
    return {
      activity,
      kind: stationKindForActivity(activity),
      label: AREA_PROGRESS_LABELS[activity],
      used,
      cap,
      remaining: snap?.remaining ?? Math.max(0, cap - used),
      quest: questComplete !== undefined,
      questComplete: !!questComplete,
    };
  });
  const goalCount = goals.length || 3;
  return {
    areas,
    completeCount: input.dailies?.completeCount ?? 0,
    goalCount,
    allComplete: input.dailies?.allComplete ?? false,
    streak: input.dailies?.streak ?? 0,
  };
}

export function areaProgressForStation(
  progress: DailyProgress | null,
  kind: string,
): AreaProgress | null {
  const activity = activityIdForStation(kind);
  if (!progress || !activity) return null;
  return progress.areas.find((area) => area.activity === activity) ?? null;
}
