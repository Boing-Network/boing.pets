import { useEffect, useMemo, useState } from "react";
import type { IpcClient } from "../api/ipc";
import { useFollowStore } from "../state/followStore";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { speciesLabel } from "../view/species-skins";
import { tickClock } from "./activity";
import {
  FOLLOW_LIMIT,
  entryFor,
  sinceLastVisit,
  suggestFollows,
  worldKey,
} from "./follow";

/** Durable events fetched for the journal: the last three world days. */
const HISTORY_TICKS = 3 * 144;
/** A visit shorter than this (half a world day) is not worth a recap. */
const MIN_AWAY_TICKS = 72;
/** How often the "seen up to here" mark is saved. */
const SEEN_EVERY_TICKS = 36;

/** Storage key for the world on screen, or null before the first snapshot. */
export function useWorldKey(): string | null {
  const id = useWorldViewStore((s) => s.view?.world.id);
  const seed = useWorldViewStore((s) => s.view?.world.seed);
  return id == null || seed == null ? null : worldKey(id, seed);
}

/** The followed ids for the world on screen. */
export function useFollowedIds(): ReadonlySet<number> {
  const key = useWorldKey();
  const ids = useFollowStore((s) => entryFor(s.book, key).ids);
  return useMemo(() => new Set(ids), [ids]);
}

/** Star toggle beside a creature's name. */
export function FollowButton({ creatureId }: { creatureId: number }) {
  const key = useWorldKey();
  const followed = useFollowedIds();
  const toggle = useFollowStore((s) => s.toggle);
  const [full, setFull] = useState(false);
  useEffect(() => setFull(false), [creatureId]);
  if (key == null) return null;
  const on = followed.has(creatureId);
  return (
    <>
      <button
        type="button"
        className={on ? "follow-btn follow-btn--on" : "follow-btn"}
        aria-pressed={on}
        title={
          on
            ? "Stop following this creature"
            : "Follow: it joins your creatures and your journal"
        }
        onClick={() => setFull(!toggle(key, creatureId))}
      >
        <span aria-hidden="true">{on ? "★" : "☆"}</span>
        {on ? "Following" : "Follow"}
      </button>
      {full ? (
        <span className="follow-full" role="status">
          You can follow {FOLLOW_LIMIT}. Unfollow one first.
        </span>
      ) : null}
    </>
  );
}

/**
 * Loads the journal's recent past once per visit, keeps the "seen up to
 * here" mark current, and greets a returning player with what happened to
 * their creatures while they were gone.
 */
export function VisitPanel({ ipc }: { ipc: IpcClient }) {
  const key = useWorldKey();
  const worldId = useWorldViewStore((s) => s.view?.world.id ?? null);
  const tick = useWorldViewStore((s) => s.view?.world.lastTick ?? null);
  const followed = useFollowedIds();
  const history = useFollowStore((s) => s.history);
  const setHistory = useFollowStore((s) => s.setHistory);
  const markSeen = useFollowStore((s) => s.markSeen);
  const visitStart = useFollowStore((s) =>
    key == null ? undefined : s.visitStartedAt[key],
  );
  const selectCreature = useUiStore((s) => s.selectCreature);
  const [closed, setClosed] = useState(false);
  // The tick this visit opened on: the recap covers up to here, no further.
  const [openedAt, setOpenedAt] = useState<number | null>(null);

  const ready = key != null && worldId != null && tick != null;
  useEffect(() => {
    if (!ready || openedAt != null) return;
    setOpenedAt(tick);
  }, [ready, openedAt, tick]);

  useEffect(() => {
    if (key == null || worldId == null || openedAt == null) return;
    let cancelled = false;
    void ipc
      .query({
        message: "query.events",
        body: {
          worldId,
          fromTick: Math.max(0, openedAt - HISTORY_TICKS),
          toTick: openedAt,
          limit: 5000,
        },
      })
      .then((result) => {
        if (cancelled || result.message !== "query.events") return;
        setHistory(result.body.events);
      })
      .catch(() => {
        // Older hosts or a busy writer: the journal starts from now.
      });
    return () => {
      cancelled = true;
    };
  }, [ipc, key, worldId, openedAt, setHistory]);

  const seenBucket = tick == null ? null : Math.floor(tick / SEEN_EVERY_TICKS);
  useEffect(() => {
    if (key == null || tick == null) return;
    markSeen(key, tick);
    // Saved once per bucket, not every tick.
  }, [key, seenBucket, markSeen]);

  const lines = useMemo(
    () =>
      visitStart == null || visitStart <= 0
        ? []
        : sinceLastVisit(history, followed, visitStart),
    [history, followed, visitStart],
  );

  if (closed || openedAt == null || visitStart == null) return null;
  if (visitStart <= 0 || openedAt - visitStart < MIN_AWAY_TICKS) return null;
  if (lines.length === 0) return null;

  return (
    <section
      className="catchup-panel visit-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="visit-title"
    >
      <h2 id="visit-title" className="catchup-title">
        Since your last visit
      </h2>
      <p className="catchup-span">What happened to the creatures you follow.</p>
      <ol className="catchup-notable visit-lines">
        {lines.map((event) => (
          <li key={event.id}>
            <time>{tickClock(event.tick)}</time> {event.summary}
          </li>
        ))}
      </ol>
      <div className="visit-actions">
        {(() => {
          const last = lines[lines.length - 1];
          const id = last?.actorId;
          return id != null && followed.has(id) ? (
            <button
              type="button"
              className="clock-btn"
              onClick={() => {
                selectCreature(id);
                setClosed(true);
              }}
            >
              Go to them
            </button>
          ) : null;
        })()}
        <button
          type="button"
          className="clock-btn catchup-close"
          onClick={() => setClosed(true)}
        >
          Continue
        </button>
      </div>
    </section>
  );
}

/**
 * First-session nudge: a world of two hundred strangers is hard to care
 * about, so offer three to follow. Shown until the player follows one or
 * says no.
 */
export function FollowPrompt() {
  const key = useWorldKey();
  const creatures = useWorldViewStore((s) => s.view?.creatures);
  const entry = useFollowStore((s) => entryFor(s.book, key));
  const toggle = useFollowStore((s) => s.toggle);
  const dismiss = useFollowStore((s) => s.dismissPrompt);
  const selectCreature = useUiStore((s) => s.selectCreature);
  const suggestions = useMemo(
    () => suggestFollows(creatures ?? []),
    // Suggestions are fixed while the card is open: names must not shuffle
    // under the pointer as the world ticks.
    [key, creatures == null],
  );

  if (key == null || entry.ids.length > 0 || entry.promptDismissed) return null;
  if (suggestions.length === 0) return null;

  return (
    <section
      className="catchup-panel intro-panel follow-prompt"
      role="dialog"
      aria-modal="false"
      aria-labelledby="follow-title"
    >
      <h2 id="follow-title" className="catchup-title">
        Choose a creature to follow
      </h2>
      <p className="catchup-span">
        It joins your creatures: you will see when it is hurt, finds a mate or
        has young, and what happened while you were away. You can follow more,
        or change your mind, at any time.
      </p>
      <ul className="follow-choices">
        {suggestions.map(({ creature, reason }) => (
          <li key={creature.id}>
            <button
              type="button"
              className="follow-choice"
              onClick={() => {
                toggle(key, creature.id);
                selectCreature(creature.id);
              }}
            >
              <strong>{creature.name}</strong>
              <span>
                {speciesLabel(creature.speciesId)} · {reason}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="catchup-close"
        onClick={() => dismiss(key)}
      >
        Not now
      </button>
    </section>
  );
}
