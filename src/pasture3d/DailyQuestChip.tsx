import { useEffect, useState } from "react";

type DailyView = {
  completeCount: number;
  allComplete: boolean;
  streak: number;
  bonus: { eligible: boolean; claimed: boolean };
};

export function DailyQuestChip({ owner }: { owner: string | null }) {
  const [view, setView] = useState<DailyView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = owner
      ? "/api/content/dailies?owner=" + encodeURIComponent(owner)
      : "/api/content/dailies";
    void fetch(path)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { dailies?: DailyView } | null) => {
        if (!cancelled && body?.dailies) setView(body.dailies);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [owner]);

  if (!view) return null;
  const label = view.bonus.claimed
    ? "Streak claimed"
    : view.bonus.eligible
      ? "Claim streak bonus"
      : view.allComplete
        ? "Streak ready"
        : "Daily goals " + view.completeCount + "/3";
  const streak = view.streak > 0 ? " · " + view.streak + "-day streak" : "";
  return (
    <a className="pasture-dailies-chip" href="/quests.html">
      <strong>{label}</strong>
      <span>{streak.trim() || "UTC daily quests"}</span>
    </a>
  );
}
