import type { MutableRefObject } from "react";
import type { WorldStation, WorldZoneConfig } from "../config/zones";
import type { ControlState } from "../hooks/usePlayerControls";
import { Joystick } from "./Joystick";

export function WorldHud({
  zone,
  station,
  controls,
  reducedMotion,
}: {
  zone: WorldZoneConfig;
  station: WorldStation | null;
  controls: MutableRefObject<ControlState>;
  reducedMotion: boolean;
}) {
  return (
    <div className="world-hud">
      <header className="world-top">
        <a className="world-brand" href="/">
          boing<span>pets</span>
        </a>
        <div className="world-title">
          <p className="eyebrow">PHASE 2 · 3D PREVIEW</p>
          <h1>{zone.name}</h1>
          <p>{zone.tagline}</p>
        </div>
        <a className="world-exit" href="/">
          ← Pasture
        </a>
      </header>

      <div className={`prompt ${station ? "visible" : ""}`} role="status">
        {station ? (
          <>
            <strong>{station.label}</strong>
            <span>{station.hint}</span>
            {station.careHref ? (
              <a className="prompt-cta" href={station.careHref}>
                Open care desk · E
              </a>
            ) : (
              <span className="prompt-cta muted">Press E near pads later</span>
            )}
          </>
        ) : (
          <span>Walk toward a glowing pad to interact</span>
        )}
      </div>

      <div className="world-controls">
        <Joystick controls={controls} />
        <button
          type="button"
          className="interact-btn"
          onPointerDown={() => {
            controls.current.interact = true;
          }}
          onPointerUp={() => {
            controls.current.interact = false;
          }}
          onPointerLeave={() => {
            controls.current.interact = false;
          }}
        >
          Interact
        </button>
      </div>

      <footer className="world-help">
        <span>WASD / arrows move</span>
        <span>E interact</span>
        <span>{reducedMotion ? "Reduced motion on" : "Soft camera follow"}</span>
      </footer>
    </div>
  );
}
