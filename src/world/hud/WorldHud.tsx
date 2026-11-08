import { useState, type MutableRefObject } from "react";
import { hex32 } from "../../core";
import type { WorldStation, WorldZoneConfig } from "../config/zones";
import type { ControlState } from "../hooks/usePlayerControls";
import { syncRemotePosition } from "../lib/positionApi";
import type { LivePose } from "../scene/Player";
import { Joystick } from "./Joystick";

interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export function WorldHud({
  zone,
  station,
  controls,
  livePose,
  preferPerf,
  notice,
  onNotice,
}: {
  zone: WorldZoneConfig;
  station: WorldStation | null;
  controls: MutableRefObject<ControlState>;
  livePose: MutableRefObject<LivePose>;
  preferPerf: boolean;
  notice: string;
  onNotice: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function cloudSave() {
    if (busy) return;
    setBusy(true);
    try {
      const provider = (window as Window & { boing?: Provider }).boing;
      if (!provider) {
        onNotice("Install/open Boing Express, then cloud-save from here.");
        return;
      }
      const accounts = (await provider.request({
        method: "boing_requestAccounts",
        params: [],
      })) as string[];
      const owner = hex32(accounts?.[0]);
      const pose = livePose.current;
      await syncRemotePosition({
        owner,
        zone: pose.zone,
        position: { x: pose.x, y: pose.y, z: pose.z },
        sign: async (message) => {
          const signature = await provider.request({
            method: "boing_signMessage",
            params: [message, owner],
          });
          if (typeof signature !== "string")
            throw new Error("Wallet did not return a signature");
          return signature;
        },
      });
      onNotice("Position signed and saved to the pasture cloud.");
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "Cloud save failed. Retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="world-hud">
      <header className="world-top">
        <a className="world-brand" href="/">
          boing<span>pets</span>
        </a>
        <div className="world-title">
          <p className="eyebrow">PHASE 2.5 · HARDENED PREVIEW</p>
          <h1>{zone.name}</h1>
          <p>{zone.tagline}</p>
        </div>
        <div className="world-top-actions">
          <button
            type="button"
            className="world-exit"
            disabled={busy}
            onClick={() => void cloudSave()}
          >
            {busy ? "Saving…" : "Cloud save"}
          </button>
          <a className="world-exit" href="/">
            ← Pasture
          </a>
        </div>
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
              <span className="prompt-cta muted">Look around for care pads</span>
            )}
          </>
        ) : (
          <span>{notice}</span>
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
        <span>{preferPerf ? "Perf mode on" : "Desktop quality"}</span>
      </footer>
    </div>
  );
}
