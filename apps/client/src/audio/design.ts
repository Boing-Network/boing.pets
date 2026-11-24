/**
 * Sound design as data. Pure: no Web Audio, no DOM, no randomness, so the
 * choices here are testable. The engine (`engine.ts`) turns these specs into
 * oscillators. Like the creatures, every sound is built from code: there are
 * no audio files.
 */
import {
  EventKind,
  SPECIES_CATALOG,
  type SpeciesBodyPlan,
  type WorldEventView,
} from "@boing-pets/contract";
import type { BiomeId } from "../view/world/biomes";

// ---------------------------------------------------------------- voices --

export type VoiceWave = "sine" | "triangle" | "sawtooth" | "square" | "noise";

/** One tone (or noise burst) of a creature call. Times in seconds. */
export type VoicePart = {
  wave: VoiceWave;
  /** Pitch glide in Hz. For noise: the band-pass centre. */
  from: number;
  to: number;
  at: number;
  dur: number;
  gain: number;
  /** Tremolo rate in Hz (full depth): churrs, croaks, growls. */
  am?: number;
  /** Vibrato rate in Hz and depth in cents. */
  vibHz?: number;
  vibCents?: number;
  /** Low-pass cutoff in Hz that softens harsh waves. */
  lowpass?: number;
};

export type VoiceSpec = { parts: VoicePart[] };

type PartInput = Omit<VoicePart, "at"> & { at?: number };

function voice(...parts: PartInput[]): VoiceSpec {
  return { parts: parts.map((p) => ({ ...p, at: p.at ?? 0 })) };
}

/** The same part repeated `count` times, `gap` seconds apart. */
function repeat(part: PartInput, count: number, gap: number): PartInput[] {
  const start = part.at ?? 0;
  return Array.from({ length: count }, (_, i) => ({
    ...part,
    at: start + i * gap,
  }));
}

const PLAN_VOICES: Record<SpeciesBodyPlan, VoiceSpec> = {
  // Two quick yips.
  canid: voice(
    ...repeat(
      { wave: "triangle", from: 760, to: 520, dur: 0.11, gain: 0.8 },
      2,
      0.17,
    ),
  ),
  // Low bellow.
  cervid: voice({
    wave: "sawtooth",
    from: 190,
    to: 140,
    dur: 0.55,
    gain: 0.7,
    lowpass: 700,
    vibHz: 5,
    vibCents: 18,
  }),
  // Bleat.
  bovid: voice({
    wave: "sawtooth",
    from: 400,
    to: 360,
    dur: 0.42,
    gain: 0.6,
    lowpass: 1900,
    vibHz: 13,
    vibCents: 60,
  }),
  // Foot thumps, then a small squeak.
  lagomorph: voice(
    ...repeat(
      { wave: "noise", from: 110, to: 110, dur: 0.07, gain: 0.9 },
      2,
      0.16,
    ),
    { wave: "sine", from: 1500, to: 1900, at: 0.42, dur: 0.07, gain: 0.35 },
  ),
  // Squeaks.
  rodent: voice(
    ...repeat(
      { wave: "sine", from: 2500, to: 3300, dur: 0.055, gain: 0.55 },
      3,
      0.1,
    ),
  ),
  // Chitter.
  mustelid: voice(
    ...repeat(
      {
        wave: "square",
        from: 1150,
        to: 880,
        dur: 0.05,
        gain: 0.4,
        lowpass: 2600,
      },
      5,
      0.075,
    ),
  ),
  // Mew that rises and falls.
  felid: voice(
    {
      wave: "triangle",
      from: 520,
      to: 700,
      dur: 0.22,
      gain: 0.65,
      vibHz: 6,
      vibCents: 25,
    },
    {
      wave: "triangle",
      from: 700,
      to: 430,
      at: 0.22,
      dur: 0.34,
      gain: 0.65,
      vibHz: 6,
      vibCents: 25,
    },
  ),
  // Grunts.
  suid: voice(
    ...repeat(
      {
        wave: "sawtooth",
        from: 100,
        to: 78,
        dur: 0.13,
        gain: 0.85,
        lowpass: 480,
      },
      2,
      0.2,
    ),
  ),
  // A slow puff of breath over a low knock.
  chelonian: voice(
    { wave: "noise", from: 520, to: 520, dur: 0.45, gain: 0.4 },
    { wave: "sine", from: 120, to: 95, dur: 0.16, gain: 0.6 },
  ),
  // Drip.
  urodele: voice(
    { wave: "sine", from: 1500, to: 720, dur: 0.06, gain: 0.6 },
    { wave: "sine", from: 1900, to: 900, at: 0.16, dur: 0.05, gain: 0.45 },
  ),
  // Wing flutter.
  moth: voice({
    wave: "noise",
    from: 3200,
    to: 3200,
    dur: 0.55,
    gain: 0.75,
    am: 27,
  }),
  // Rapid high chirps.
  bat: voice(
    ...repeat(
      { wave: "sine", from: 5400, to: 3900, dur: 0.028, gain: 0.65 },
      6,
      0.055,
    ),
  ),
  // Hoo, hoo-hoo.
  owl: voice(
    { wave: "sine", from: 345, to: 330, dur: 0.28, gain: 0.8 },
    { wave: "sine", from: 345, to: 335, at: 0.5, dur: 0.14, gain: 0.7 },
    { wave: "sine", from: 350, to: 315, at: 0.72, dur: 0.36, gain: 0.8 },
  ),
  // Churring trill.
  nightjar: voice({
    wave: "sine",
    from: 1900,
    to: 1820,
    dur: 0.95,
    gain: 0.45,
    am: 24,
  }),
  // Harsh croak.
  heron: voice(
    {
      wave: "sawtooth",
      from: 250,
      to: 195,
      dur: 0.3,
      gain: 0.6,
      lowpass: 1300,
      am: 55,
    },
    { wave: "noise", from: 900, to: 900, dur: 0.3, gain: 0.25 },
  ),
  // Klee-klee-klee.
  raptor: voice(
    ...repeat(
      { wave: "triangle", from: 2950, to: 2450, dur: 0.085, gain: 0.5 },
      4,
      0.13,
    ),
  ),
  // Thin scream.
  swift: voice(
    { wave: "sine", from: 4200, to: 5200, dur: 0.16, gain: 0.4 },
    { wave: "sine", from: 5200, to: 4500, at: 0.16, dur: 0.22, gain: 0.4 },
  ),
  // Caw, caw.
  corvid: voice(
    ...repeat(
      {
        wave: "sawtooth",
        from: 640,
        to: 520,
        dur: 0.2,
        gain: 0.5,
        lowpass: 2400,
        am: 70,
      },
      2,
      0.3,
    ),
  ),
  // Deep growl.
  ursid: voice({
    wave: "sawtooth",
    from: 74,
    to: 60,
    dur: 0.95,
    gain: 0.9,
    lowpass: 380,
    am: 21,
  }),
  // Ribbit.
  anuran: voice(
    {
      wave: "sawtooth",
      from: 210,
      to: 250,
      dur: 0.14,
      gain: 0.6,
      lowpass: 1000,
      am: 46,
    },
    {
      wave: "sawtooth",
      from: 250,
      to: 340,
      at: 0.2,
      dur: 0.2,
      gain: 0.6,
      lowpass: 1000,
      am: 46,
    },
  ),
};

/** Species whose call is not the default for their body plan. */
const SLUG_VOICES: Record<string, VoiceSpec> = {
  // The wolf howls where the fox yips.
  "ash-wolf": voice(
    {
      wave: "sawtooth",
      from: 290,
      to: 440,
      dur: 0.5,
      gain: 0.6,
      lowpass: 1100,
    },
    {
      wave: "sawtooth",
      from: 440,
      to: 400,
      at: 0.5,
      dur: 1.1,
      gain: 0.6,
      lowpass: 1100,
      vibHz: 5,
      vibCents: 22,
    },
  ),
  // One long alarm whistle.
  "slate-marmot": voice({
    wave: "sine",
    from: 2900,
    to: 2700,
    dur: 0.3,
    gain: 0.5,
  }),
  // Quill rattle.
  "thorn-porcupine": voice({
    wave: "noise",
    from: 2400,
    to: 2400,
    dur: 0.5,
    gain: 0.4,
    am: 18,
  }),
  // "Chee-ow".
  "gale-chough": voice({
    wave: "triangle",
    from: 1700,
    to: 900,
    dur: 0.26,
    gain: 0.5,
    lowpass: 3200,
  }),
};

const SILENT: VoiceSpec = { parts: [] };

/** Small stable hash to 0…1 (no shared state, safe to call anywhere). */
function hashUnit(n: number): number {
  let h = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return ((h >>> 0) % 10_000) / 10_000;
}

const SPECIES_BY_ID = new Map<number, (typeof SPECIES_CATALOG)[number]>(
  SPECIES_CATALOG.map((row) => [row.id, row]),
);

/** The call of a species; empty for an unknown id. */
export function voiceForSpecies(speciesId: number): VoiceSpec {
  const row = SPECIES_BY_ID.get(speciesId);
  if (row == null) return SILENT;
  return SLUG_VOICES[row.slug] ?? PLAN_VOICES[row.bodyPlan];
}

/**
 * Pitch factor for one creature: species sharing a body plan sit a little
 * apart, and each individual has its own voice within the species.
 */
export function voicePitch(speciesId: number, creatureId: number): number {
  const species = 0.9 + hashUnit(speciesId * 31 + 7) * 0.22;
  const individual = 0.95 + hashUnit(creatureId * 17 + 3) * 0.1;
  return species * individual;
}

export function voiceDuration(spec: VoiceSpec): number {
  return spec.parts.reduce((end, p) => Math.max(end, p.at + p.dur), 0);
}

// ------------------------------------------------------------------ cues --

/** Notes are MIDI numbers so cues and music share one scale. */
export type CueNote = { midi: number; at: number; dur: number; gain: number };
export type CueSpec = {
  timbre: "bell" | "pluck";
  notes: CueNote[];
  /** A breath of filtered noise under the notes (travel). */
  whoosh?: boolean;
};

/** D minor pentatonic: any two notes agree, so overlapping cues never clash. */
export const SCALE: readonly number[] = [62, 65, 67, 69, 72, 74, 77, 79];

export const PAD_CHORDS: readonly (readonly number[])[] = [
  [50, 57, 60, 65],
  [53, 60, 67, 69],
  [45, 55, 60, 64],
  [43, 50, 57, 62],
];

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

const EVENT_CUES: Record<EventKind, CueSpec> = {
  // A rising chime.
  [EventKind.BIRTH]: {
    timbre: "bell",
    notes: [
      { midi: 69, at: 0, dur: 1.4, gain: 0.5 },
      { midi: 74, at: 0.14, dur: 1.6, gain: 0.5 },
      { midi: 77, at: 0.28, dur: 2.2, gain: 0.55 },
    ],
  },
  // One low bell, left to ring.
  [EventKind.DEATH]: {
    timbre: "bell",
    notes: [
      { midi: 50, at: 0, dur: 4.5, gain: 0.6 },
      { midi: 45, at: 0.05, dur: 4.5, gain: 0.35 },
    ],
  },
  // Two voices, then one above them.
  [EventKind.MATING]: {
    timbre: "bell",
    notes: [
      { midi: 65, at: 0, dur: 1.8, gain: 0.4 },
      { midi: 69, at: 0, dur: 1.8, gain: 0.4 },
      { midi: 72, at: 0.35, dur: 2, gain: 0.35 },
    ],
  },
  // Quick high sparkle.
  [EventKind.DISCOVERY]: {
    timbre: "pluck",
    notes: [
      { midi: 79, at: 0, dur: 0.5, gain: 0.4 },
      { midi: 81, at: 0.08, dur: 0.5, gain: 0.4 },
      { midi: 86, at: 0.16, dur: 0.9, gain: 0.45 },
    ],
  },
  // A step up, on a breath of wind.
  [EventKind.MIGRATION]: {
    timbre: "pluck",
    whoosh: true,
    notes: [
      { midi: 67, at: 0.1, dur: 0.7, gain: 0.3 },
      { midi: 69, at: 0.3, dur: 0.9, gain: 0.3 },
    ],
  },
  // One small pluck.
  [EventKind.ITEM]: {
    timbre: "pluck",
    notes: [{ midi: 72, at: 0, dur: 0.5, gain: 0.3 }],
  },
};

export function cueForEvent(kind: EventKind): CueSpec {
  return EVENT_CUES[kind];
}

/** Lower plays first when several events land in one patch. */
const CUE_PRIORITY: Record<EventKind, number> = {
  [EventKind.BIRTH]: 0,
  [EventKind.DEATH]: 0,
  [EventKind.MATING]: 1,
  [EventKind.DISCOVERY]: 2,
  [EventKind.MIGRATION]: 3,
  [EventKind.ITEM]: 4,
};

/** At most this many cues per batch of events; the rest are dropped. */
export const MAX_CUES_PER_BATCH = 3;
/** Events older than this many ticks are history, not news. */
const FRESH_TICKS = 3;

/**
 * Which of the world's events should sound now. The first call (cursor null)
 * only primes the cursor, so joining a world does not replay its history;
 * neither does the snapshot after a reconnect, because stale ticks are
 * skipped. Fast time scales are thinned to the most important few.
 */
export function selectEventCues(
  events: readonly WorldEventView[],
  cursor: number | null,
  currentTick: number,
): { cursor: number; play: WorldEventView[] } {
  let maxId = cursor ?? 0;
  const fresh: WorldEventView[] = [];
  for (const event of events) {
    if (cursor != null && event.id > cursor) {
      if (event.tick >= currentTick - FRESH_TICKS) fresh.push(event);
    }
    if (event.id > maxId) maxId = event.id;
  }
  fresh.sort(
    (a, b) => CUE_PRIORITY[a.kind] - CUE_PRIORITY[b.kind] || a.id - b.id,
  );
  return { cursor: maxId, play: fresh.slice(0, MAX_CUES_PER_BATCH) };
}

// -------------------------------------------------------------- ambience --

/** What the camera is looking at, sampled a few times a second. */
export type SceneInput = {
  /** Biome under the orbit target; null over the wilds or the sea. */
  biome: BiomeId | null;
  /** World units from the orbit target to water; zero or less is in it. */
  waterDistance: number;
  /** 0 = zoomed right in, 1 = the whole map. */
  zoom: number;
};

/** Layer levels, each 0…1. */
export type SceneMix = {
  wind: number;
  /** 0 = low and soft, 1 = thin mountain air. */
  windBright: number;
  water: number;
  crickets: number;
  /** How often nearby creatures call. */
  wildlife: number;
};

type BiomeSound = { wind: number; bright: number; crickets: number };

const BIOME_SOUND: Record<BiomeId, BiomeSound> = {
  meadow: { wind: 0.35, bright: 0.3, crickets: 1 },
  thicket: { wind: 0.25, bright: 0.2, crickets: 0.65 },
  ridge: { wind: 0.8, bright: 0.7, crickets: 0.15 },
  glade: { wind: 0.3, bright: 0.35, crickets: 0.8 },
  fen: { wind: 0.2, bright: 0.2, crickets: 0.55 },
  grove: { wind: 0.45, bright: 0.25, crickets: 0.5 },
  crags: { wind: 1, bright: 1, crickets: 0 },
};

/** Open country between territories and over the sea. */
const WILD_SOUND: BiomeSound = { wind: 0.6, bright: 0.5, crickets: 0.2 };

/** Water is audible within this many world units of the bank. */
export const WATER_EARSHOT = 26;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Close to the ground you hear the place: insects, water, creatures. Pulled
 * back to the whole map, those fade and the wind takes over.
 */
export function sceneMix(input: SceneInput): SceneMix {
  const sound = input.biome ? BIOME_SOUND[input.biome] : WILD_SOUND;
  const zoom = clamp01(input.zoom);
  const near = 1 - zoom;
  const detail = near * near;
  return {
    wind: clamp01(sound.wind * (0.55 + 0.45 * near) + zoom * 0.45),
    windBright: clamp01(sound.bright * near + zoom * 0.6),
    water:
      clamp01(1 - Math.max(0, input.waterDistance) / WATER_EARSHOT) * detail,
    crickets: sound.crickets * detail,
    wildlife: input.biome ? detail : 0,
  };
}

/** Normalises the camera's orbit distance to the 0…1 zoom `sceneMix` takes. */
export function zoomFromDistance(distance: number): number {
  return clamp01((distance - 14) / 150);
}

// --------------------------------------------------------------- spatial --

export type Listener = {
  /** Orbit target on the ground plane. */
  x: number;
  z: number;
  /** Unit vector pointing to the camera's right on the ground plane. */
  rightX: number;
  rightZ: number;
};

/**
 * Level and stereo position of something happening at a world point. Far
 * events stay faintly audible: they are the only news of the wider world.
 */
export function spatialise(
  listener: Listener,
  point: { x: number; z: number },
): { gain: number; pan: number } {
  const dx = point.x - listener.x;
  const dz = point.z - listener.z;
  const distance = Math.hypot(dx, dz);
  const gain = Math.max(0.3, 1 / (1 + (distance / 70) ** 2));
  if (distance < 1e-6) return { gain, pan: 0 };
  const side = (dx * listener.rightX + dz * listener.rightZ) / distance;
  return { gain, pan: Math.max(-0.8, Math.min(0.8, side * 0.8)) };
}
