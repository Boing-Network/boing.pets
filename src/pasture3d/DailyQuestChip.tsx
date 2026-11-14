import { useEffect, useState } from "react";
import { ACTIVITY_IDS, type ActivityId } from "../content/attempts";
import type { DailyQuestView } from "../content/dailyQuests";
import {
  buildDailyProgress,
  formatAreaLine,
  type AreaAttemptSnapshot,
  type AreaProgress,
  type DailyProgress,
} from "./dailyProgress";

type DailyResponse = { dailies?: DailyQuestView };
type AttemptResponse = AreaAttemptSnapshot & { activity: ActivityId };

async function fetchDailyProgress(
  owner: string | null,
): Promise<DailyProgress> {
  const ownerQ = owner ? "&owner=" + encodeURIComponent(owner) : "";
  const ownerOnly = owner ? "?owner=" + encodeURIComponent(owner) : "";
  const dailiesPath = "/api/content/dailies" + ownerOnly;
  const attemptPaths = ACTIVITY_IDS.map(
    (activity) => "/api/activity/attempts/status?activity=" + activity + ownerQ,
  );
  const [dailiesRes, ...attemptRes] = await Promise.all([
    fetch(dailiesPath),
    ...attemptPaths.map((path) => fetch(path)),
  ]);
  const dailiesBody = dailiesRes.ok
    ? ((await dailiesRes.json()) as DailyResponse)
    : null;
  const attempts: Partial<Record<ActivityId, AreaAttemptSnapshot>> = {};
  await Promise.all(
    attemptRes.map(async (res, index) => {
      if (!res.ok) return;
      const body = (await res.json()) as AttemptResponse;
      const activity = body.activity || ACTIVITY_IDS[index]!;
      attempts[activity] = {
        activity,
        attemptsUsed: Number(body.attemptsUsed) || 0,
        dailyCap: Number(body.dailyCap) || 0,
        remaining: Number(body.remaining) || 0,
      };
    }),
  );
  return buildDailyProgress({
    dailies: dailiesBody?.dailies,
    attempts,
  });
}

export function useDailyProgress(owner: string | null) {
  const [progress, setProgress] = useState<DailyProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchDailyProgress(owner)
        .then((next) => {
          if (!cancelled) setProgress(next);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [owner]);

  return progress;
}

export function DailyQuestChip({
  progress,
  nearby,
}: {
  progress: DailyProgress | null;
  nearby?: AreaProgress | null;
}) {
  const [open, setOpen] = useState(false);

  if (!progress) return null;
  const subtitle = nearby
    ? formatAreaLine(nearby)
    : progress.streak > 0
      ? `${progress.streak}-day streak`
      : "Today's area goals";

  return (
    <div className={"pasture-dailies-chip" + (open ? " is-open" : "")}>
      <button
        type="button"
        className="pasture-dailies-toggle"
        aria-expanded={open}
        aria-controls="pasture-dailies-list"
        onClick={() => setOpen((value) => !value)}
      >
        <strong>
          <span className="pasture-dailies-kicker">Daily</span>
          <span className="pasture-dailies-frac">
            {progress.completeCount} / {progress.goalCount}
          </span>
        </strong>
        <span>{subtitle}</span>
      </button>
      <div className="pasture-dailies-meter" aria-hidden="true">
        {Array.from({ length: progress.goalCount }, (_, index) => (
          <i
            key={index}
            className={
              "pasture-dailies-seg" +
              (index < progress.completeCount ? " is-on" : "")
            }
          />
        ))}
      </div>
      {open ? (
        <ul id="pasture-dailies-list" className="pasture-dailies-list">
          {progress.areas.map((area) => (
            <li
              key={area.activity}
              className={
                "pasture-dailies-item" +
                (area.quest ? " is-quest" : "") +
                (area.questComplete ? " is-complete" : "")
              }
            >
              {formatAreaLine(area)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
