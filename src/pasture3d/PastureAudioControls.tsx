import { useEffect, useId, useState } from "react";
import {
  getAudioSettings,
  playSfx,
  subscribeAudioSettings,
  updateAudioSettings,
  type AudioSettings,
} from "../audio";

export function PastureAudioControls() {
  const [settings, setSettings] = useState<AudioSettings>(getAudioSettings);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => subscribeAudioSettings(setSettings), []);

  const muted = settings.musicMuted && settings.sfxMuted;
  const label = muted ? "Unmute audio" : "Audio settings";

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
        }}
      >
        Audio
      </button>
      {open ? (
        <div
          id={panelId}
          className="pasture-audio-panel"
          role="group"
          aria-label="Music and sound effects"
        >
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
        </div>
      ) : null}
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
