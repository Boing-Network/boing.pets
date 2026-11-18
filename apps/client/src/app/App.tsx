import { CreatureStatus } from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";
import { useWorldViewStore } from "../state/worldViewStore";
import { WorldCanvas } from "../view/WorldCanvas";
import "./shell.css";

type Props = {
  /** IPC handle for future HUD commands (pause, influence). Bound at boot. */
  ipc: IpcClient;
};

export function App({ ipc }: Props) {
  void ipc;
  const view = useWorldViewStore((s) => s.view);

  const livingCount =
    view?.creatures.filter((c) => c.status === CreatureStatus.ALIVE).length ??
    0;
  const territoryCount = view?.territories.length ?? 0;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="brand">Living Pets</h1>
        <p className="meta">
          {view
            ? `${view.world.name} · tick ${view.world.lastTick} · ${livingCount} living`
            : "Waiting for host snapshot…"}
        </p>
      </header>
      <main className="map-stage">
        <WorldCanvas />
        <div className="status-chip">
          {view
            ? `${territoryCount} territories · seed ${view.world.seed}`
            : "No world loaded"}
        </div>
      </main>
    </div>
  );
}
