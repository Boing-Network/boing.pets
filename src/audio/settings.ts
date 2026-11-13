/** Persistence and gain math for pasture music and SFX. No Web Audio here. */

export const AUDIO_STORAGE_KEY = "boing-pets-audio-v1";

export type AudioSettings = {
  musicVolume: number;
  sfxVolume: number;
  musicMuted: boolean;
  sfxMuted: boolean;
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicVolume: 0.42,
  sfxVolume: 0.7,
  musicMuted: false,
  sfxMuted: false,
};

export const MUSIC_DUCK_LEVEL = 0.18;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseAudioSettings(raw: unknown): AudioSettings {
  const src =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    musicVolume: clamp01(
      typeof src.musicVolume === "number"
        ? src.musicVolume
        : DEFAULT_AUDIO_SETTINGS.musicVolume,
    ),
    sfxVolume: clamp01(
      typeof src.sfxVolume === "number"
        ? src.sfxVolume
        : DEFAULT_AUDIO_SETTINGS.sfxVolume,
    ),
    musicMuted: asBoolean(src.musicMuted, DEFAULT_AUDIO_SETTINGS.musicMuted),
    sfxMuted: asBoolean(src.sfxMuted, DEFAULT_AUDIO_SETTINGS.sfxMuted),
  };
}

export function loadAudioSettings(
  storage: Pick<Storage, "getItem"> | null = defaultStorage(),
): AudioSettings {
  if (!storage) return { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const raw = storage.getItem(AUDIO_STORAGE_KEY);
    return parseAudioSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(
  settings: AudioSettings,
  storage: Pick<Storage, "setItem"> | null = defaultStorage(),
): AudioSettings {
  const next = parseAudioSettings(settings);
  if (!storage) return next;
  try {
    storage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or private-mode failures should not break the pasture.
  }
  return next;
}

export function effectiveMusicGain(
  settings: AudioSettings,
  ducked = false,
): number {
  if (settings.musicMuted) return 0;
  return settings.musicVolume * (ducked ? MUSIC_DUCK_LEVEL : 1);
}

export function effectiveSfxGain(settings: AudioSettings): number {
  if (settings.sfxMuted) return 0;
  return settings.sfxVolume;
}

export function isCapMessage(message: string): boolean {
  return /cap|no attempts|attempt(?:s)? left|already (?:played|claimed|done)|come back tomorrow|daily limit/i.test(
    message,
  );
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
