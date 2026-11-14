/// <reference lib="dom" />
/**
 * Pasture audio engine. All music and SFX are original procedural Web Audio
 * graphs generated at runtime — no third-party samples or copyrighted assets.
 * Playback stays silent until the first user gesture unlocks AudioContext.
 */

import {
  effectiveMusicGain,
  effectiveSfxGain,
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettings,
} from "./settings";
import {
  moodSfxName,
  shouldPlayMoodSfx,
  type PetMoodKind,
} from "../pasture3d/petMood";
import {
  MUSIC_BAR,
  planPastureMusicBar,
  type MusicEvent,
} from "./pastureMusic";

export {
  MUSIC_BAR,
  MUSIC_BPM,
  MUSIC_LOOP_BARS,
  MUSIC_MAJOR_SCALE,
  MUSIC_ROOT_HZ,
} from "./pastureMusic";

export type SfxName =
  | "ui-click"
  | "hop"
  | "footstep"
  | "open-station"
  | "close-station"
  | "mine-hit"
  | "fish-cast"
  | "fish-reel"
  | "dig"
  | "plant"
  | "water"
  | "harvest"
  | "cook"
  | "race-start"
  | "race-finish"
  | "reward"
  | "error"
  | "cap"
  | "market-buy"
  | "market-list"
  | "craft"
  | "equip"
  | "care"
  | "mood-happy"
  | "mood-hungry"
  | "mood-sleepy";

type Listener = (settings: AudioSettings) => void;

let settings: AudioSettings = loadAudioSettings();
let unlocked = false;
let duckCount = 0;
let ctx: AudioContext | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicTimer: number | null = null;
let musicBar = 0;
let musicStarted = false;
const settingsListeners = new Set<Listener>();
const unlockListeners = new Set<() => void>();
const hopGate = { at: 0 };
const stepGate = { at: 0 };
const moodGate = { at: 0, pets: new Map<string, number>() };

export function getAudioSettings(): AudioSettings {
  return { ...settings };
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export function subscribeAudioSettings(fn: Listener): () => void {
  settingsListeners.add(fn);
  fn(getAudioSettings());
  return () => settingsListeners.delete(fn);
}

export function onAudioUnlocked(fn: () => void): () => void {
  unlockListeners.add(fn);
  if (unlocked) fn();
  return () => unlockListeners.delete(fn);
}

export function updateAudioSettings(
  patch: Partial<AudioSettings>,
): AudioSettings {
  settings = saveAudioSettings({ ...settings, ...patch });
  applyGains(0.08);
  for (const fn of settingsListeners) fn(getAudioSettings());
  if (unlocked && musicStarted) startPastureMusic();
  if (settings.musicMuted) stopPastureMusic();
  return getAudioSettings();
}

export function pushMusicDuck(): void {
  duckCount += 1;
  applyGains(0.35);
}

export function popMusicDuck(): void {
  duckCount = Math.max(0, duckCount - 1);
  applyGains(0.6);
}

export function resetMusicDuck(): void {
  duckCount = 0;
  applyGains(0.2);
}

function ducked(): boolean {
  return duckCount > 0;
}

function applyGains(seconds: number): void {
  if (!ctx || !musicGain || !sfxGain) return;
  const at = ctx.currentTime;
  const dur = Math.max(0.02, seconds);
  musicGain.gain.cancelScheduledValues(at);
  musicGain.gain.setValueAtTime(musicGain.gain.value, at);
  musicGain.gain.linearRampToValueAtTime(
    effectiveMusicGain(settings, ducked()),
    at + dur,
  );
  sfxGain.gain.cancelScheduledValues(at);
  sfxGain.gain.setValueAtTime(sfxGain.gain.value, at);
  sfxGain.gain.linearRampToValueAtTime(effectiveSfxGain(settings), at + 0.05);
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : typeof window !== "undefined" &&
          (
            window as unknown as {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext
        ? (
            window as unknown as {
              webkitAudioContext: typeof AudioContext;
            }
          ).webkitAudioContext
        : null;
  if (!Ctor) return null;
  ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = effectiveSfxGain(settings);
  sfxGain.connect(master);
  return ctx;
}

export async function unlockAudio(): Promise<boolean> {
  const audio = ensureContext();
  if (!audio) return false;
  try {
    if (audio.state === "suspended") await audio.resume();
  } catch {
    return false;
  }
  if (audio.state !== "running" && audio.state !== "suspended") return false;
  const became = !unlocked;
  unlocked = audio.state === "running" || audio.state === "suspended";
  if (audio.state === "suspended") return false;
  unlocked = true;
  if (became) for (const fn of unlockListeners) fn();
  applyGains(0.01);
  return true;
}

export function armAudioUnlock(
  target: EventTarget | null = typeof window === "undefined" ? null : window,
): () => void {
  if (!target) return () => undefined;
  const evts = ["pointerdown", "keydown", "touchend"] as const;
  const go = () => {
    void unlockAudio();
  };
  for (const ev of evts) target.addEventListener(ev, go, { capture: true });
  return () => {
    for (const ev of evts)
      target.removeEventListener(ev, go, {
        capture: true,
      } as EventListenerOptions);
  };
}

function tone(
  audio: AudioContext,
  dest: AudioNode,
  opts: {
    freq: number;
    dur: number;
    type?: OscillatorType;
    gain?: number;
    at?: number;
    slide?: number;
    attack?: number;
  },
): void {
  const at = opts.at ?? audio.currentTime;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = Math.max(600, opts.freq * 4);
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(Math.max(20, opts.freq), at);
  if (opts.slide) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, opts.slide),
      at + opts.dur,
    );
  }
  const peak = opts.gain ?? 0.18;
  const attack = opts.attack ?? Math.min(0.02, opts.dur / 4);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  osc.connect(filter);
  filter.connect(g);
  g.connect(dest);
  osc.start(at);
  osc.stop(at + opts.dur + 0.02);
}

function noiseBurst(
  audio: AudioContext,
  dest: AudioNode,
  opts: { dur: number; gain?: number; at?: number; hp?: number },
): void {
  const at = opts.at ?? audio.currentTime;
  const length = Math.max(1, Math.floor(audio.sampleRate * opts.dur));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = opts.hp ?? 400;
  const g = audio.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.12, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(at);
  src.stop(at + opts.dur + 0.02);
}

function playRecipe(name: SfxName, audio: AudioContext, dest: AudioNode): void {
  const t = audio.currentTime;
  switch (name) {
    case "ui-click":
      tone(audio, dest, { freq: 880, dur: 0.05, gain: 0.12, type: "triangle" });
      break;
    case "hop":
      tone(audio, dest, {
        freq: 260,
        slide: 340,
        dur: 0.1,
        gain: 0.1,
        type: "sine",
      });
      break;
    case "footstep":
      tone(audio, dest, {
        freq: 110,
        slide: 80,
        dur: 0.08,
        gain: 0.08,
        type: "triangle",
      });
      break;
    case "open-station":
      tone(audio, dest, { freq: 392, slide: 523, dur: 0.16, gain: 0.16 });
      tone(audio, dest, { freq: 523, dur: 0.12, gain: 0.08, at: t + 0.08 });
      break;
    case "close-station":
      tone(audio, dest, { freq: 523, slide: 330, dur: 0.14, gain: 0.14 });
      break;
    case "mine-hit":
      noiseBurst(audio, dest, { dur: 0.08, gain: 0.16, hp: 200 });
      tone(audio, dest, {
        freq: 160,
        slide: 90,
        dur: 0.12,
        gain: 0.2,
        type: "square",
      });
      break;
    case "fish-cast":
      tone(audio, dest, {
        freq: 240,
        slide: 640,
        dur: 0.22,
        gain: 0.14,
        type: "triangle",
      });
      break;
    case "fish-reel":
      tone(audio, dest, { freq: 440, dur: 0.06, gain: 0.12, type: "square" });
      tone(audio, dest, {
        freq: 520,
        dur: 0.08,
        gain: 0.1,
        at: t + 0.07,
        type: "square",
      });
      break;
    case "dig":
      noiseBurst(audio, dest, { dur: 0.12, gain: 0.14, hp: 180 });
      tone(audio, dest, { freq: 140, slide: 90, dur: 0.14, gain: 0.16 });
      break;
    case "plant":
      tone(audio, dest, { freq: 330, slide: 392, dur: 0.14, gain: 0.12 });
      break;
    case "water":
      tone(audio, dest, {
        freq: 520,
        slide: 360,
        dur: 0.18,
        gain: 0.1,
        type: "sine",
      });
      tone(audio, dest, { freq: 640, dur: 0.08, gain: 0.06, at: t + 0.05 });
      break;
    case "harvest":
      tone(audio, dest, { freq: 523, dur: 0.1, gain: 0.12 });
      tone(audio, dest, { freq: 659, dur: 0.12, gain: 0.1, at: t + 0.08 });
      break;
    case "cook":
      noiseBurst(audio, dest, { dur: 0.16, gain: 0.08, hp: 800 });
      tone(audio, dest, { freq: 220, slide: 280, dur: 0.16, gain: 0.1 });
      break;
    case "race-start":
      tone(audio, dest, { freq: 392, dur: 0.1, gain: 0.14 });
      tone(audio, dest, { freq: 523, dur: 0.14, gain: 0.16, at: t + 0.12 });
      break;
    case "race-finish":
      tone(audio, dest, { freq: 523, dur: 0.1, gain: 0.14 });
      tone(audio, dest, { freq: 659, dur: 0.1, gain: 0.14, at: t + 0.1 });
      tone(audio, dest, { freq: 784, dur: 0.18, gain: 0.16, at: t + 0.2 });
      break;
    case "reward":
      tone(audio, dest, { freq: 392, dur: 0.12, gain: 0.14 });
      tone(audio, dest, { freq: 523, dur: 0.12, gain: 0.14, at: t + 0.1 });
      tone(audio, dest, { freq: 659, dur: 0.2, gain: 0.16, at: t + 0.2 });
      break;
    case "error":
      tone(audio, dest, {
        freq: 196,
        slide: 140,
        dur: 0.2,
        gain: 0.16,
        type: "square",
      });
      break;
    case "cap":
      tone(audio, dest, { freq: 180, dur: 0.12, gain: 0.12, type: "triangle" });
      tone(audio, dest, {
        freq: 150,
        dur: 0.16,
        gain: 0.1,
        at: t + 0.12,
        type: "triangle",
      });
      break;
    case "market-buy":
      tone(audio, dest, {
        freq: 1046,
        dur: 0.07,
        gain: 0.12,
        type: "triangle",
      });
      tone(audio, dest, {
        freq: 1318,
        dur: 0.12,
        gain: 0.12,
        at: t + 0.07,
        type: "triangle",
      });
      break;
    case "market-list":
      tone(audio, dest, { freq: 659, dur: 0.08, gain: 0.12 });
      tone(audio, dest, { freq: 523, dur: 0.12, gain: 0.1, at: t + 0.08 });
      break;
    case "craft":
      noiseBurst(audio, dest, { dur: 0.07, gain: 0.1, hp: 300 });
      tone(audio, dest, { freq: 200, dur: 0.1, gain: 0.14, type: "square" });
      tone(audio, dest, { freq: 880, dur: 0.1, gain: 0.08, at: t + 0.1 });
      break;
    case "equip":
      tone(audio, dest, { freq: 440, slide: 554, dur: 0.16, gain: 0.13 });
      break;
    case "care":
      tone(audio, dest, { freq: 330, dur: 0.1, gain: 0.12 });
      tone(audio, dest, { freq: 392, dur: 0.12, gain: 0.12, at: t + 0.09 });
      tone(audio, dest, { freq: 494, dur: 0.16, gain: 0.12, at: t + 0.18 });
      break;
    case "mood-happy":
      tone(audio, dest, { freq: 659, dur: 0.07, gain: 0.07, type: "sine" });
      tone(audio, dest, {
        freq: 784,
        dur: 0.1,
        gain: 0.06,
        at: t + 0.06,
        type: "sine",
      });
      break;
    case "mood-hungry":
      tone(audio, dest, {
        freq: 120,
        slide: 90,
        dur: 0.16,
        gain: 0.07,
        type: "triangle",
      });
      break;
    case "mood-sleepy":
      tone(audio, dest, {
        freq: 280,
        slide: 200,
        dur: 0.22,
        gain: 0.06,
        type: "sine",
      });
      break;
  }
}

export function playSfx(name: SfxName): boolean {
  if (!unlocked) return false;
  if (effectiveSfxGain(settings) <= 0) return false;
  const audio = ensureContext();
  if (!audio || !sfxGain || audio.state !== "running") return false;
  try {
    playRecipe(name, audio, sfxGain);
    return true;
  } catch {
    return false;
  }
}

/** Soft hop, rate-limited so a bouncing pet is not a drum roll. */
export function playHopSfx(now = performance.now()): boolean {
  if (now - hopGate.at < 240) return false;
  hopGate.at = now;
  return playSfx("hop");
}

/** Walk footstep, slightly slower than the hop gate so steps stay even. */
export function playFootstepSfx(now = performance.now()): boolean {
  if (now - stepGate.at < 280) return false;
  stepGate.at = now;
  return playSfx("footstep");
}

/** Soft mood cue, rate-limited so a crowded pasture stays quiet. */
export function playMoodSfx(
  kind: PetMoodKind,
  petId: string,
  reducedMotion = false,
  now = performance.now(),
): boolean {
  const lastPet = moodGate.pets.get(petId) ?? 0;
  if (!shouldPlayMoodSfx(kind, reducedMotion, now, lastPet, moodGate.at)) {
    return false;
  }
  const name = moodSfxName(kind);
  if (!name) return false;
  const played = playSfx(name);
  if (played) {
    moodGate.at = now;
    moodGate.pets.set(petId, now);
  }
  return played;
}

function playMusicEvent(
  audio: AudioContext,
  dest: GainNode,
  ev: MusicEvent,
  when: number,
): void {
  if (ev.kind === "tone") {
    tone(audio, dest, {
      freq: ev.freq,
      dur: ev.dur,
      gain: ev.gain,
      type: ev.type,
      at: when + ev.at,
      attack: ev.attack,
      slide: ev.slide,
    });
    return;
  }
  noiseBurst(audio, dest, {
    dur: ev.dur,
    gain: ev.gain,
    at: when + ev.at,
    hp: ev.hp,
  });
}

function scheduleBar(
  audio: AudioContext,
  dest: GainNode,
  barIndex: number,
  when: number,
): void {
  for (const ev of planPastureMusicBar(barIndex)) {
    playMusicEvent(audio, dest, ev, when);
  }
}

function pumpMusic(): void {
  if (!musicStarted || !ctx || !musicGain) return;
  const startedAt = (ctx as AudioContext & { __musicZero?: number })
    .__musicZero;
  const zero = startedAt ?? ctx.currentTime;
  (ctx as AudioContext & { __musicZero?: number }).__musicZero = zero;
  const horizon = ctx.currentTime + MUSIC_BAR * 2.2;
  while (zero + musicBar * MUSIC_BAR < horizon) {
    scheduleBar(ctx, musicGain, musicBar, zero + musicBar * MUSIC_BAR);
    musicBar += 1;
  }
  musicTimer = window.setTimeout(pumpMusic, MUSIC_BAR * 1000);
}

export function startPastureMusic(): boolean {
  if (!unlocked) return false;
  if (settings.musicMuted) return false;
  const audio = ensureContext();
  if (!audio || !musicGain) return false;
  if (audio.state !== "running") return false;
  if (musicStarted) {
    applyGains(0.4);
    return true;
  }
  musicStarted = true;
  musicBar = 0;
  (audio as AudioContext & { __musicZero?: number }).__musicZero =
    audio.currentTime + 0.15;
  applyGains(1.4);
  pumpMusic();
  return true;
}

export function stopPastureMusic(): void {
  musicStarted = false;
  if (musicTimer != null) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
  if (ctx && musicGain) {
    const at = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(at);
    musicGain.gain.setValueAtTime(musicGain.gain.value, at);
    musicGain.gain.linearRampToValueAtTime(0, at + 0.4);
  }
}

/** Test-only reset so unit tests can reuse the module. */
export function resetAudioEngineForTests(next?: AudioSettings): void {
  stopPastureMusic();
  if (ctx) {
    void ctx.close().catch(() => undefined);
  }
  ctx = null;
  musicGain = null;
  sfxGain = null;
  unlocked = false;
  duckCount = 0;
  musicBar = 0;
  musicStarted = false;
  hopGate.at = 0;
  moodGate.at = 0;
  moodGate.pets.clear();
  stepGate.at = 0;
  settings = next ? saveAudioSettings(next) : loadAudioSettings();
}

export function isPastureMusicStarted(): boolean {
  return musicStarted;
}

export function musicDuckCount(): number {
  return duckCount;
}
