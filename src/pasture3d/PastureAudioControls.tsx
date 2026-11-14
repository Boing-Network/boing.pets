import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  getAudioSettings,
  playSfx,
  subscribeAudioSettings,
  updateAudioSettings,
  type AudioSettings,
} from "../audio";
import {
  getA11ySettings,
  subscribeA11ySettings,
  updateA11ySettings,
  type A11ySettings,
  type CookHintPalette,
  type TextSize,
} from "../ui/a11ySettings";
import { readPastureTouchPrefs } from "./mobileControls";

export function PastureAudioControls() {
  const [settings, setSettings] = useState<AudioSettings>(getAudioSettings);
  const [a11y, setA11y] = useState<A11ySettings>(getA11ySettings);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"audio" | "access">("audio");
  const [touchSheet, setTouchSheet] = useState(
    () => readPastureTouchPrefs().touchControls,
  );
  const panelId = useId();

  useEffect(() => subscribeAudioSettings(setSettings), []);
  useEffect(() => subscribeA11ySettings(setA11y), []);
  useEffect(() => {
    const sync = () => setTouchSheet(readPastureTouchPrefs().touchControls);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  useEffect(() => {
    const stage = document.querySelector(".pasture-3d-stage");
    stage?.classList.toggle("is-settings-open", open);
    return () => {
      stage?.classList.remove("is-settings-open");
    };
  }, [open]);

  const muted = settings.musicMuted && settings.sfxMuted;
  const label = muted ? "Unmute audio" : "Audio and accessibility settings";

  const panel = open ? (
    <div
      id={panelId}
      className="pasture-audio-panel pasture-settings-panel"
      role="group"
      aria-label="Audio and accessibility"
    >
      <div
        className="pasture-settings-tabs"
        role="tablist"
        aria-label="Settings sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "audio"}
          onClick={() => {
            playSfx("ui-click");
            setTab("audio");
          }}
        >
          Audio
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "access"}
          onClick={() => {
            playSfx("ui-click");
            setTab("access");
          }}
        >
          Access
        </button>
      </div>
      {tab === "audio" ? (
        <>
          <AudioSlider
            label="Music"
            volume={settings.musicVolume}
            muted={settings.musicMuted}
            onVolume={(musicVolume) => updateAudioSettings({ musicVolume })}
            onMuted={(musicMuted) => updateAudioSettings({ musicMuted })}
          />
          <AudioSlider
            label="SFX"
            volume={settings.sfxVolume}
            muted={settings.sfxMuted}
            onVolume={(sfxVolume) => updateAudioSettings({ sfxVolume })}
            onMuted={(sfxMuted) => updateAudioSettings({ sfxMuted })}
          />
        </>
      ) : (
        <>
          <label className="pasture-audio-row">
            <span>Camera</span>
            <input
              type="range"
              min={40}
              max={200}
              step={10}
              value={Math.round(a11y.cameraSensitivity * 100)}
              aria-label="Camera sensitivity"
              onChange={(event) =>
                updateA11ySettings({
                  cameraSensitivity: Number(event.target.value) / 100,
                })
              }
            />
          </label>
          <label className="pasture-audio-row">
            <span>Text</span>
            <select
              aria-label="Text size"
              value={a11y.textSize}
              onChange={(event) =>
                updateA11ySettings({ textSize: event.target.value as TextSize })
              }
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
          <label className="pasture-settings-check">
            <input
              type="checkbox"
              checked={a11y.reducedMotion}
              onChange={(event) =>
                updateA11ySettings({ reducedMotion: event.target.checked })
              }
            />
            Reduced motion
          </label>
          <label className="pasture-audio-row">
            <span>Cook hints</span>
            <select
              aria-label="Cooking hint palette"
              value={a11y.cookHintPalette}
              onChange={(event) =>
                updateA11ySettings({
                  cookHintPalette: event.target.value as CookHintPalette,
                })
              }
            >
              <option value="default">Colors + shapes</option>
              <option value="colorblind">Colorblind-safe + shapes</option>
            </select>
          </label>
        </>
      )}
    </div>
  ) : null;

  const stage =
    typeof document !== "undefined"
      ? document.querySelector(".pasture-3d-stage")
      : null;

  return (
    <div className="pasture-audio-controls">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        className={muted ? "is-muted" : undefined}
        onClick={() => {
          playSfx("ui-click");
          setOpen((value) => !value);
          setTab("audio");
        }}
      >
        Settings
      </button>
      {panel && touchSheet && stage ? createPortal(panel, stage) : panel}
    </div>
  );
}

function AudioSlider({
  label,
  volume,
  muted,
  onVolume,
  onMuted,
}: {
  label: string;
  volume: number;
  muted: boolean;
  onVolume: (value: number) => void;
  onMuted: (muted: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="pasture-audio-row">
      <button
        type="button"
        className={muted ? "is-muted" : undefined}
        aria-pressed={muted}
        aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
        onClick={() => {
          playSfx("ui-click");
          onMuted(!muted);
        }}
      >
        {muted ? "Muted" : label}
      </button>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(volume * 100)}
        disabled={muted}
        aria-label={`${label} volume`}
        onChange={(event) => onVolume(Number(event.target.value) / 100)}
      />
    </div>
  );
}
