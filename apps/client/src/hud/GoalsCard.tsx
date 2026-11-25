import { useEffect, useMemo, useRef } from "react";
import { EventKind } from "@boing-pets/contract";
import { useFollowStore } from "../state/followStore";
import { noteGoal, useGoalStore } from "../state/goalStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { factsFor, goalProgress } from "./goals";
import { useFollowedIds, useWorldKey } from "./YourCreatures";

/** How long a "goal reached" notice stays up. */
const NOTICE_MS = 6000;

/**
 * Watches the world for the goals that are not a button press (following,
 * a birth to one of yours, a rename taking effect) and shows a brief notice
 * when any goal is reached. Mounted once, whatever the Inspector shows.
 */
export function GoalsWatcher() {
  const key = useWorldKey();
  const followed = useFollowedIds();
  const log = useWorldViewStore((s) => s.eventLog.entries);
  const history = useFollowStore((s) => s.history);
  const creatures = useWorldViewStore((s) => s.view?.creatures);
  const pendingName = useGoalStore((s) => s.pendingName);
  const clearPendingName = useGoalStore((s) => s.clearPendingName);
  const reached = useGoalStore((s) => s.reached);
  const clearReached = useGoalStore((s) => s.clearReached);

  useEffect(() => {
    if (key != null && followed.size > 0) noteGoal("followed", followed.size);
  }, [key, followed]);

  // Each birth to a followed creature counts once per page load; the stored
  // count only needs to reach 1, so a repeat after a reload does no harm.
  const counted = useRef(new Set<number>());
  useEffect(() => {
    if (key == null || followed.size === 0) return;
    for (const event of [...history, ...log]) {
      if (event.kind !== EventKind.BIRTH) continue;
      if (counted.current.has(event.id)) continue;
      // A birth's actor is the child; the goal is about its parents.
      const payload = event.payload as {
        motherId?: number | null;
        fatherId?: number | null;
      } | null;
      const mine =
        (payload?.motherId != null && followed.has(payload.motherId)) ||
        (payload?.fatherId != null && followed.has(payload.fatherId));
      if (!mine) continue;
      counted.current.add(event.id);
      noteGoal("young");
    }
  }, [key, followed, history, log]);

  useEffect(() => {
    if (pendingName == null) return;
    const row = creatures?.find((c) => c.id === pendingName.creatureId);
    if (row?.name !== pendingName.name) return;
    noteGoal("named");
    clearPendingName();
  }, [creatures, pendingName, clearPendingName]);

  useEffect(() => {
    if (reached == null) return;
    const left = Math.max(0, reached.atMs + NOTICE_MS - Date.now());
    const timer = setTimeout(clearReached, left);
    return () => clearTimeout(timer);
  }, [reached, clearReached]);

  if (reached == null) return null;
  return (
    <p className="goal-toast" role="status" aria-live="polite">
      <span aria-hidden="true">✓</span> Goal reached: {reached.goal.title}
    </p>
  );
}

/** The goal list, folded to its next step. Lives in the Inspector's home view. */
export function GoalsCard() {
  const key = useWorldKey();
  const facts = useGoalStore((s) => factsFor(s.book, key));
  const progress = useMemo(() => goalProgress(facts), [facts]);
  if (key == null) return null;
  return (
    <details className="goals">
      <summary>
        <span className="goals-count">
          Goals {progress.done}/{progress.total}
        </span>
        <span className="goals-next">
          {progress.next ? `Next: ${progress.next.title}` : "All reached"}
        </span>
      </summary>
      {progress.next ? (
        <p className="goals-hint">{progress.next.hint}</p>
      ) : null}
      <ol className="goals-list">
        {progress.rows.map(({ goal, done }) => (
          <li key={goal.id} className={done ? "goals-row--done" : undefined}>
            <span aria-hidden="true">{done ? "✓" : "○"}</span>
            {goal.title}
            {done ? <span className="visually-hidden"> (reached)</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
