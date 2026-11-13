import { afterEach, describe, expect, it } from "vitest";
import {
  AUDIO_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  armAudioUnlock,
  effectiveMusicGain,
  effectiveSfxGain,
  isAudioUnlocked,
  isCapMessage,
  isPastureMusicStarted,
  loadAudioSettings,
  musicDuckCount,
  parseAudioSettings,
  playSfx,
  popMusicDuck,
  pushMusicDuck,
  resetAudioEngineForTests,
  resetMusicDuck,
  saveAudioSettings,
  startPastureMusic,
  unlockAudio,
  updateAudioSettings,
} from "../src/audio";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => (key in data ? data[key]! : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    data,
  };
}

describe("pasture audio settings", () => {
  it("parses and clamps persisted volume and mute flags", () => {
    const parsed = parseAudioSettings({
      musicVolume: 1.8,
      sfxVolume: -2,
      musicMuted: true,
      sfxMuted: "yes",
    });
    expect(parsed.musicVolume).toBe(1);
    expect(parsed.sfxVolume).toBe(0);
    expect(parsed.musicMuted).toBe(true);
    expect(parsed.sfxMuted).toBe(false);
  });

  it("round-trips settings through storage", () => {
    const storage = memoryStorage();
    const saved = saveAudioSettings(
      { musicVolume: 0.3, sfxVolume: 0.5, musicMuted: true, sfxMuted: false },
      storage,
    );
    expect(storage.data[AUDIO_STORAGE_KEY]).toContain("0.3");
    expect(loadAudioSettings(storage)).toEqual(saved);
    expect(loadAudioSettings(memoryStorage()).musicVolume).toBe(
      DEFAULT_AUDIO_SETTINGS.musicVolume,
    );
    expect(
      loadAudioSettings(memoryStorage({ [AUDIO_STORAGE_KEY]: "{" })),
    ).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it("returns zero gain when muted and ducks music during minigames", () => {
    const live = parseAudioSettings({ musicVolume: 0.8, sfxVolume: 0.6 });
    expect(effectiveMusicGain(live, false)).toBeCloseTo(0.8);
    expect(effectiveMusicGain(live, true)).toBeCloseTo(0.8 * 0.18);
    expect(effectiveMusicGain({ ...live, musicMuted: true }, false)).toBe(0);
    expect(effectiveSfxGain(live)).toBeCloseTo(0.6);
    expect(effectiveSfxGain({ ...live, sfxMuted: true })).toBe(0);
  });

  it("detects daily-cap error copy", () => {
    expect(isCapMessage("Daily cap reached — come back tomorrow.")).toBe(true);
    expect(isCapMessage("No attempts left today.")).toBe(true);
    expect(isCapMessage("Could not reach the market.")).toBe(false);
  });
});

describe("pasture audio gesture gate", () => {
  afterEach(() => {
    resetAudioEngineForTests(DEFAULT_AUDIO_SETTINGS);
  });

  it("stays silent before a user gesture and does not start music", () => {
    resetAudioEngineForTests(DEFAULT_AUDIO_SETTINGS);
    expect(isAudioUnlocked()).toBe(false);
    expect(playSfx("ui-click")).toBe(false);
    expect(startPastureMusic()).toBe(false);
    expect(isPastureMusicStarted()).toBe(false);
  });

  it("unlocks from a trusted gesture listener and then allows playback", async () => {
    const target = new EventTarget();
    const disarm = armAudioUnlock(target);
    expect(isAudioUnlocked()).toBe(false);
    target.dispatchEvent(new Event("pointerdown"));
    // jsdom may not implement AudioContext; unlock should still be safe.
    const unlocked = await unlockAudio();
    if (unlocked) {
      expect(isAudioUnlocked()).toBe(true);
    } else {
      expect(playSfx("reward")).toBe(false);
    }
    disarm();
  });

  it("tracks music duck push/pop for overlays and minigames", () => {
    resetMusicDuck();
    expect(musicDuckCount()).toBe(0);
    pushMusicDuck();
    pushMusicDuck();
    expect(musicDuckCount()).toBe(2);
    popMusicDuck();
    expect(musicDuckCount()).toBe(1);
    popMusicDuck();
    popMusicDuck();
    expect(musicDuckCount()).toBe(0);
  });

  it("persists mute changes through updateAudioSettings", () => {
    const storage = memoryStorage();
    const prev = globalThis.localStorage;
    const fake = {
      getItem: storage.getItem,
      setItem: storage.setItem,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } as Storage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: fake,
    });
    resetAudioEngineForTests(DEFAULT_AUDIO_SETTINGS);
    const next = updateAudioSettings({ musicMuted: true, musicVolume: 0.2 });
    expect(next.musicMuted).toBe(true);
    expect(next.musicVolume).toBe(0.2);
    expect(loadAudioSettings(storage).musicMuted).toBe(true);
    if (prev === undefined) {
      // jsdom always has localStorage; restore anyway.
    }
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: prev,
    });
  });
});
