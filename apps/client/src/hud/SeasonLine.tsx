/**
 * One line on the season: what it is, when it turns, and which materials it
 * makes plentiful or scarce.
 */
import { useWorldViewStore } from "../state/worldViewStore";
import { seasonSummary } from "./seasons";

export function SeasonLine({ ticksPerDay = 144 }: { ticksPerDay?: number }) {
  const tick = useWorldViewStore((s) => s.view?.world.lastTick);
  if (tick == null) return null;
  const summary = seasonSummary(tick, ticksPerDay);
  return (
    <p
      className={`season-line season-${summary.season.toLowerCase()}`}
      title={`${summary.next}. Seasons change how much of each material a territory holds.`}
    >
      <strong>{summary.title}</strong>
      <span>{summary.note}</span>
    </p>
  );
}
