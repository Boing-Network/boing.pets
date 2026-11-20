import { TIME_SCALES, type TimeScale } from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { WalletButton } from "./WalletButton";

type Props = {
  ipc: IpcClient;
};

export function ClockControls({ ipc }: Props) {
  const paused = useUiStore((s) => s.paused);
  const scale = useUiStore((s) => s.scale);
  const clock = useWorldViewStore((s) => s.clock);
  const session = useWorldViewStore((s) => s.session);
  const connection = useWorldViewStore((s) => s.connection);
  const lastNotice = useWorldViewStore((s) => s.lastNotice);
  const displayPaused = clock?.paused ?? paused;
  const displayScale = clock?.scale ?? scale;
  // Shared worlds: only the owner drives time. Local play always may.
  const canDriveClock =
    connection === "local" ||
    (session?.role === "owner" && connection === "live");
  const lockedTitle = canDriveClock
    ? undefined
    : "Only the world owner can pause or change speed";
  const showNotice = lastNotice != null && Date.now() - lastNotice.atMs < 6_000;

  return (
    <div className="clock-controls" role="group" aria-label="Simulation clock">
      {connection !== "local" ? (
        <span
          className={`mp-chip mp-chip--${connection}`}
          role="status"
          aria-label="Shared world status"
          title={session ? `Signed in as ${session.displayName}` : undefined}
        >
          {connection === "live"
            ? `Shared · ${session?.role === "owner" ? "Owner" : "Player"} · ${session?.displayName ?? ""}`
            : connection === "connecting"
              ? "Shared · connecting…"
              : connection === "reconnecting"
                ? "Shared · reconnecting…"
                : "Shared · offline"}
          {showNotice ? ` — ${lastNotice.detail}` : null}
        </span>
      ) : null}
      <WalletButton />
      <button
        type="button"
        className="clock-btn"
        disabled={!canDriveClock}
        title={lockedTitle}
        aria-pressed={displayPaused}
        onClick={() => {
          ipc.send(
            displayPaused
              ? { message: "clock.resume", body: {} }
              : { message: "clock.pause", body: {} },
          );
        }}
      >
        {displayPaused ? "Resume" : "Pause"}
      </button>
      <div className="clock-scales" role="group" aria-label="Time scale">
        {TIME_SCALES.map((value) => (
          <button
            key={value}
            type="button"
            className={
              value === displayScale
                ? "clock-btn clock-btn--active"
                : "clock-btn"
            }
            aria-pressed={value === displayScale}
            disabled={!canDriveClock}
            title={lockedTitle}
            onClick={() => {
              ipc.send({
                message: "clock.setScale",
                body: { scale: value as TimeScale },
              });
            }}
          >
            {value}×
          </button>
        ))}
      </div>
    </div>
  );
}
