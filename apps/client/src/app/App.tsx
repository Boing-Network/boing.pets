import { lazy, Suspense } from "react";
import { CreatureStatus } from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";
import { ClockControls } from "../hud/ClockControls";
import { InfluencePanel } from "../hud/InfluencePanel";
import { InspectionPanel } from "../hud/InspectionPanel";
import { useWorldViewStore } from "../state/worldViewStore";
import "../hud/controls.css";
import "./shell.css";

// three / react-three-fiber / drei load in their own chunks so the HUD and
// the host connection start before the 3D stack has downloaded.
const WorldCanvas = lazy(() =>
  import("../view/WorldCanvas").then((m) => ({ default: m.WorldCanvas })),
);

type Props = {
  /** IPC handle for HUD queries (family / creature). Bound at boot. */
  ipc: IpcClient;
};

export function App({ ipc }: Props) {
  const view = useWorldViewStore((s) => s.view);
  const clock = useWorldViewStore((s) => s.clock);

  const livingCount =
    view?.creatures.filter((c) => c.status === CreatureStatus.ALIVE).length ??
    0;
  const territoryCount = view?.territories.length ?? 0;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand">
          <h1 className="brand">Living Pets</h1>
          <p className="meta">
            {view
              ? `${view.world.name} · tick ${view.world.lastTick} · ${livingCount} living${
                  clock
                    ? ` · ${clock.paused ? "paused" : `${clock.scale}×`}`
                    : ""
                }`
              : "Waiting for host snapshot…"}
          </p>
        </div>
        <ClockControls ipc={ipc} />
      </header>
      <main className="map-stage">
        <Suspense
          fallback={<div className="world-loading">Loading the world…</div>}
        >
          <WorldCanvas />
        </Suspense>
        <InfluencePanel ipc={ipc} />
        <InspectionPanel ipc={ipc} />
        <div className="status-chip">
          {view
            ? `${territoryCount} territories · seed ${view.world.seed}`
            : "No world loaded"}
        </div>
      </main>
    </div>
  );
}
