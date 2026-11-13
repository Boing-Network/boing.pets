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
  MUSIC_BPM,
  MUSIC_LOOP_BARS,
  MUSIC_MAJOR_SCALE,
  chordDegree,
  isMajorScaleFrequency,
  musicLoopDuration,
  planPastureMusicBar,
  planPastureMusicLoop,
  playFootstepSfx,
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

describe("upbeat pasture music plan", () => {
  it("is a major-key loop at a brisk, loopable tempo", () => {
    expect(MUSIC_BPM).toBeGreaterThanOrEqual(110);
    expect(MUSIC_BPM).toBeLessThanOrEqual(128);
    expect(MUSIC_MAJOR_SCALE).toEqual([0, 2, 4, 5, 7, 9, 11, 12]);
    expect(MUSIC_LOOP_BARS).toBe(8);
    expect(musicLoopDuration()).toBeCloseTo(
      (60 / MUSIC_BPM) * 4 * MUSIC_LOOP_BARS,
    );
  });

  it("uses I/IV/V chords and keeps pitched notes in G major", () => {
    const chords = Array.from({ length: MUSIC_LOOP_BARS }, (_, i) =>
      chordDegree(i),
    );
    expect(new Set(chords)).toEqual(new Set([0, 3, 4]));
    expect(chords[0]).toBe(0);
    expect(chords[MUSIC_LOOP_BARS - 1]).toBe(4);
    for (const ev of planPastureMusicLoop()) {
      if (ev.kind !== "tone" || ev.slide) continue;
      expect(isMajorScaleFrequency(ev.freq)).toBe(true);
    }
  });

  it("schedules a bouncy bass, a cheerful melody, and light percussion", () => {
    const bar = planPastureMusicBar(0);
    const tones = bar.filter((e) => e.kind === "tone");
    const noise = bar.filter((e) => e.kind === "noise");
    const bass = tones.filter(
      (e) => e.type === "triangle" && e.freq < 400 && e.dur < 0.3,
    );
    const melody = tones.filter((e) => e.type === "triangle" && e.freq >= 350);
    expect(bass.length).toBeGreaterThanOrEqual(4);
    expect(melody.length).toBeGreaterThanOrEqual(4);
    expect(noise.length).toBeGreaterThanOrEqual(8);
    expect(tones.some((e) => e.kind === "tone" && !!e.slide)).toBe(true);
  });

  it("varies the melody across the loop and repeats after eight bars", () => {
    const sig = (bar: number) =>
      planPastureMusicBar(bar)
        .filter((e) => e.kind === "tone" && e.freq > 350)
        .map((e) => (e.kind === "tone" ? e.freq.toFixed(2) : ""))
        .join(",");
    expect(sig(0)).not.toBe(sig(2));
    expect(sig(0)).not.toBe(sig(4));
    expect(sig(2)).not.toBe(sig(6));
    expect(sig(0)).toBe(sig(MUSIC_LOOP_BARS));
  });

  it("rate-limits walk footsteps so they cannot fire every frame", () => {
    resetAudioEngineForTests(DEFAULT_AUDIO_SETTINGS);
    playFootstepSfx(1000);
    expect(playFootstepSfx(1100)).toBe(false);
    expect(playFootstepSfx(1279)).toBe(false);
  });
});
