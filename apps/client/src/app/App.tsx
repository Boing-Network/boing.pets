import { lazy, Suspense } from "react";
import { CreatureStatus } from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";
import { CatchupPanel } from "../hud/CatchupPanel";
import { ClockControls } from "../hud/ClockControls";
import { IntroTip } from "../hud/IntroTip";
import { InspectionPanel } from "../hud/InspectionPanel";
import { NewsFeed } from "../hud/NewsFeed";
import { SiteNav } from "../hud/SiteNav";
import { SoundControl } from "../hud/SoundControl";
import { Workshop } from "../hud/WorkshopMenu";
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
  /** Site links (Home · Play · Marketplace); off in the desktop app. */
  siteNav?: boolean;
};

export function App({ ipc, siteNav = true }: Props) {
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
        {siteNav ? <SiteNav current="play" /> : null}
        <div className="header-tools">
          <ClockControls ipc={ipc} />
          <SoundControl />
        </div>
      </header>
      <main className="map-stage">
        <Suspense
          fallback={<div className="world-loading">Loading the world…</div>}
        >
          <WorldCanvas />
        </Suspense>
        {/* One layout box for the HUD so its panels can never overlap. */}
        <div className="hud">
          {/* First, so the phone layout can dock the panels below it. */}
          <Workshop ipc={ipc} />
          <InspectionPanel ipc={ipc} />
          <NewsFeed />
          <div className="status-chip">
            {view
              ? `${territoryCount} territories · seed ${view.world.seed}`
              : "No world loaded"}
          </div>
        </div>
        <CatchupPanel />
        <IntroTip />
      </main>
    </div>
  );
}
