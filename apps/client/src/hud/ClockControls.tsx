import { TIME_SCALES, type TimeScale } from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";

type Props = {
  ipc: IpcClient;
};

export function ClockControls({ ipc }: Props) {
  const paused = useUiStore((s) => s.paused);
  const scale = useUiStore((s) => s.scale);
  const clock = useWorldViewStore((s) => s.clock);
  const displayPaused = clock?.paused ?? paused;
  const displayScale = clock?.scale ?? scale;

  return (
    <div className="clock-controls" role="group" aria-label="Simulation clock">
      <button
        type="button"
        className="clock-btn"
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
