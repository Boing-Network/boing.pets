import { useEffect, useState } from "react";
import { useWorldViewStore } from "../state/worldViewStore";
import {
  catchupLines,
  catchupSeen,
  formatWorldSpan,
  markCatchupSeen,
} from "./catchup";

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Notable moments shown (the host ranks them). */
const MAX_NOTABLE = 5;

/**
 * "While you were away": shown once per catch-up report (the host sends one
 * after simulating time the world spent offline), dismissed with Continue.
 */
export function CatchupPanel() {
  const report = useWorldViewStore((s) => s.lastCatchup);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (report == null) return;
    setOpen(!catchupSeen(report, browserStorage()));
  }, [report]);

  if (report == null || !open) return null;
  const span = report.summary.toTick - report.summary.fromTick;
  const lines = catchupLines(report);
  const notable = report.summary.notable.slice(0, MAX_NOTABLE);
  const close = () => {
    markCatchupSeen(report, browserStorage());
    setOpen(false);
  };

  return (
    <section
      className="catchup-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="catchup-title"
    >
      <h2 id="catchup-title" className="catchup-title">
        While you were away
      </h2>
      <p className="catchup-span">
        {formatWorldSpan(span)} passed in the world (ticks{" "}
        {report.summary.fromTick}–{report.summary.toTick}).
      </p>
      {lines.length > 0 ? (
        <ul className="catchup-tallies">
          {lines.map((line) => (
            <li key={line.label}>
              <strong>{line.count}</strong> {line.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="catchup-quiet">A quiet stretch: nothing notable.</p>
      )}
      {notable.length > 0 ? (
        <ol className="catchup-notable">
          {notable.map((item) => (
            <li key={item.eventId}>{item.summary}</li>
          ))}
        </ol>
      ) : null}
      <button type="button" className="clock-btn catchup-close" onClick={close}>
        Continue
      </button>
    </section>
  );
}
