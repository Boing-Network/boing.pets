import { useEffect, useState } from "react";
import { api } from "../ui/appRuntime";
import type { DailyQuestView } from "../content/dailyQuests";
import {
  buildSessionRecap,
  dismissSessionRecap,
  readSessionRecapStored,
  SESSION_RECAP_STORAGE_KEY,
  shouldShowSessionRecap,
  type RecapPayout,
  type SessionRecapStored,
  type SessionRecapView,
} from "./sessionRecap";

function loadStored(): SessionRecapStored {
  try {
    return readSessionRecapStored(
      localStorage.getItem(SESSION_RECAP_STORAGE_KEY),
    );
  } catch {
    return readSessionRecapStored(null);
  }
}

function saveStored(stored: SessionRecapStored) {
  try {
    localStorage.setItem(SESSION_RECAP_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* ignore quota / private mode */
  }
}

export function PastureSessionRecap({
  owner,
  onOpenChange,
}: {
  owner: string | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const [view, setView] = useState<SessionRecapView | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const stored = loadStored();
    if (!shouldShowSessionRecap(stored, now)) {
      setOpen(false);
      setView(null);
      onOpenChange?.(false);
      return;
    }
    let cancelled = false;
    const ownerQuery = owner ? `?owner=${encodeURIComponent(owner)}` : "";
    void (async () => {
      const dailies = await api<{ dailies?: DailyQuestView }>(
        "/api/content/dailies" + ownerQuery,
      ).catch(() => ({ dailies: undefined }));
      const payouts = owner
        ? (
            await api<{ payouts?: RecapPayout[] }>(
              "/api/marketplace?owner=" + encodeURIComponent(owner),
            ).catch(() => ({ payouts: [] }))
          ).payouts
        : [];
      if (cancelled) return;
      setView(
        buildSessionRecap({
          now,
          lastVisitAt: stored.lastVisitAt,
          dailies: dailies.dailies,
          payouts,
        }),
      );
      setOpen(true);
      onOpenChange?.(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, onOpenChange]);

  const dismiss = () => {
    saveStored(dismissSessionRecap(Date.now()));
    setOpen(false);
    setView(null);
    onOpenChange?.(false);
  };

  if (!open || !view) return null;

  const streakLabel =
    view.streak > 0 ? `${view.streak}-day streak` : "No streak yet";
  const questLabel =
    view.goalCount > 0
      ? `Daily quests ${view.completeCount}/${view.goalCount}`
      : "Daily quests";

  return (
    <section
      className="pasture-session-recap"
      role="dialog"
      aria-label="What's new today"
      data-hud="session-recap"
    >
      <div className="pasture-session-recap-head">
        <div>
          <p className="eyebrow">WHAT'S NEW TODAY</p>
          <h2>{questLabel}</h2>
          <p className="pasture-session-recap-streak">{streakLabel}</p>
        </div>
        <button type="button" className="quiet" onClick={dismiss}>
          Dismiss
        </button>
      </div>
      {view.goals.length ? (
        <ul className="pasture-session-recap-goals">
          {view.goals.map((goal) => (
            <li
              key={goal.title}
              className={goal.complete ? "is-complete" : undefined}
            >
              {goal.complete ? "Done · " : ""}
              {goal.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">Today's activity quests will show up here.</p>
      )}
      {view.bonusTitle ? (
        <p className="pasture-session-recap-bonus">
          {view.bonusTitle}
          {view.bonusEligible ? " is ready to claim." : "."}
        </p>
      ) : null}
      <div className="pasture-session-recap-sales">
        <p className="eyebrow">MARKET</p>
        {view.sales.length ? (
          <ul>
            {view.sales.map((sale) => (
              <li key={sale.id}>
                Sale {sale.amount_boing} testnet BOING · {sale.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">
            No market sales or payouts since your last visit.
          </p>
        )}
      </div>
    </section>
  );
}
