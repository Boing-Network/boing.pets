import { useEffect, useRef, useState } from "react";
import { app } from "../ui/appRuntime";
import {
  fetchAdventuresDesk,
  type AdventuresDesk,
} from "../ui/adventureClient";
import {
  formatCountdown,
  nextReadyAt,
  readyRunCount,
  runningRunCount,
} from "../ui/adventureHub";
import { playSfx } from "../audio";

const POLL_MS = 30_000;

export function useAdventureDesk(active: boolean) {
  const [desk, setDesk] = useState<AdventuresDesk | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = () => {
      void fetchAdventuresDesk()
        .then((next) => {
          if (!cancelled) setDesk(next);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, app.owner]);

  return desk;
}

export function AdventureHudChip({
  desk,
  hidden,
  onOpen,
}: {
  desk: AdventuresDesk | null;
  hidden?: boolean;
  onOpen: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const seenReady = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!desk) return;
    const ready = desk.runs.filter((run) => run.status === "ready");
    if (!primed.current) {
      for (const run of ready) seenReady.current.add(run.id);
      primed.current = true;
      return;
    }
    const fresh = ready.filter((run) => !seenReady.current.has(run.id));
    if (fresh.length) {
      for (const run of fresh) seenReady.current.add(run.id);
      setToast(
        fresh.length === 1
          ? "A trip just landed. Claim it at Dispatch."
          : `${fresh.length} trips just landed. Claim them at Dispatch.`,
      );
      playSfx("ui-click");
    }
  }, [desk]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (hidden || !desk) return null;
  const ready = readyRunCount(desk.runs);
  const running = runningRunCount(desk.runs);
  if (!ready && !running && !toast) return null;
  const until = nextReadyAt(desk.runs, now);
  const copy =
    ready > 0
      ? `${ready} ready to claim`
      : until
        ? `Back in ${formatCountdown(until - now)}`
        : `${running} out on a trip`;

  return (
    <div className="adventure-hud">
      {toast ? (
        <p className="adventure-hud-toast" role="status">
          {toast}
        </p>
      ) : null}
      <button
        type="button"
        className={"adventure-hud-chip" + (ready ? " is-ready" : "")}
        onClick={onOpen}
      >
        <strong>
          <span className="adventure-hud-kicker">Dispatch</span>
          <span className="adventure-hud-frac">
            {ready}/{ready + running || desk.slots}
          </span>
        </strong>
        <span>{copy}</span>
      </button>
    </div>
  );
}
