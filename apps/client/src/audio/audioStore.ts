/** Sound preferences, remembered per browser. */
import { create } from "zustand";

const KEY = "living-pets.audio.v1";

export type AudioPrefs = { enabled: boolean; volume: number; music: boolean };

export const DEFAULT_AUDIO_PREFS: AudioPrefs = {
  enabled: true,
  volume: 0.7,
  music: true,
};

/** Tolerant parse: anything missing or malformed falls back to the default. */
export function parseAudioPrefs(raw: string | null | undefined): AudioPrefs {
  if (!raw) return DEFAULT_AUDIO_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<AudioPrefs> | null;
    if (value == null || typeof value !== "object") return DEFAULT_AUDIO_PREFS;
    return {
      enabled:
        typeof value.enabled === "boolean"
          ? value.enabled
          : DEFAULT_AUDIO_PREFS.enabled,
      volume:
        typeof value.volume === "number" && Number.isFinite(value.volume)
          ? Math.min(1, Math.max(0, value.volume))
          : DEFAULT_AUDIO_PREFS.volume,
      music:
        typeof value.music === "boolean"
          ? value.music
          : DEFAULT_AUDIO_PREFS.music,
    };
  } catch {
    return DEFAULT_AUDIO_PREFS;
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function load(): AudioPrefs {
  try {
    return parseAudioPrefs(storage()?.getItem(KEY));
  } catch {
    return DEFAULT_AUDIO_PREFS;
  }
}

type AudioState = AudioPrefs & {
  /** True once the browser has let the audio context run. */
  unlocked: boolean;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setMusic: (music: boolean) => void;
};

export const useAudioStore = create<AudioState>((set, get) => {
  const save = (patch: Partial<AudioPrefs>) => {
    set(patch);
    const { enabled, volume, music } = get();
    try {
      storage()?.setItem(KEY, JSON.stringify({ enabled, volume, music }));
    } catch {
      // Storage can be blocked; the choice then lasts for this visit.
    }
  };
  return {
    ...load(),
    unlocked: false,
    setEnabled: (enabled) => save({ enabled }),
    setVolume: (volume) => save({ volume: Math.min(1, Math.max(0, volume)) }),
    setMusic: (music) => save({ music }),
  };
});
