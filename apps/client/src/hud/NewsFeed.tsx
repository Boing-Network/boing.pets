import { useEffect, useMemo, useState } from "react";
import { CreatureStatus } from "@boing-pets/contract";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { tickClock } from "./activity";
import { PanelBar, usePanel } from "./PanelBar";

/**
 * "World news": births, deaths, matings, migrations and discoveries as they
 * happen. Without it the only sign of a birth is a number changing in the
 * header. A line about a living creature selects it.
 */
export function NewsFeed() {
  const log = useWorldViewStore((s) => s.eventLog);
  const creatures = useWorldViewStore((s) => s.view?.creatures);
  const selectCreature = useUiStore((s) => s.selectCreature);
  const { collapsed, toggle } = usePanel("news");

  // Unread badge: live events that arrived while the feed was folded.
  const [readCount, setReadCount] = useState(log.liveCount);
  useEffect(() => {
    // Open means read. A new world restarts the count below what was read.
    if (!collapsed || log.liveCount < readCount) setReadCount(log.liveCount);
  }, [collapsed, log.liveCount, readCount]);
  const unread = collapsed ? Math.max(0, log.liveCount - readCount) : 0;

  const living = useMemo(() => {
    const ids = new Set<number>();
    for (const creature of creatures ?? []) {
      if (creature.status === CreatureStatus.ALIVE) ids.add(creature.id);
    }
    return ids;
  }, [creatures]);

  if (log.worldId == null) return null;
  const lines = log.entries.slice().reverse();

  return (
    <section
      className={`news-feed hud-panel${collapsed ? " hud-panel--collapsed" : ""}`}
      aria-label="World news"
    >
      <PanelBar
        title={unread > 0 ? `World news (${unread} new)` : "World news"}
        name="World news"
        bodyId="news-body"
        collapsed={collapsed}
        onToggle={toggle}
      />
      <div id="news-body" className="panel-body" hidden={collapsed}>
        {lines.length === 0 ? (
          <p className="news-empty">
            Quiet so far. Births, deaths and journeys show up here.
          </p>
        ) : (
          <ol className="news-list" aria-live="polite">
            {lines.map((event) => {
              const actorId = event.actorId;
              const body = (
                <>
                  <time>{tickClock(event.tick)}</time>
                  {event.summary}
                </>
              );
              return (
                <li key={event.id}>
                  {actorId != null && living.has(actorId) ? (
                    <button
                      type="button"
                      className="news-line news-line--link"
                      title="Inspect this creature"
                      onClick={() => selectCreature(actorId)}
                    >
                      {body}
                    </button>
                  ) : (
                    <span className="news-line">{body}</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
