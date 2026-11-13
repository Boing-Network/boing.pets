/** Pure pasture-music plan so the loop can be tested and rendered offline. */

export const MUSIC_BPM = 120;
export const MUSIC_BEAT = 60 / MUSIC_BPM;
export const MUSIC_BAR = MUSIC_BEAT * 4;
/** Eight-bar form that loops back to the tonic. */
export const MUSIC_LOOP_BARS = 8;
/** G3 — G major, bright and pastoral. */
export const MUSIC_ROOT_HZ = 196;
/** Ionian / major scale degrees in semitones from the root. */
export const MUSIC_MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12] as const;

export type MusicToneEvent = {
  kind: "tone";
  at: number;
  freq: number;
  dur: number;
  gain: number;
  type: "sine" | "triangle" | "square" | "sawtooth";
  attack?: number;
  slide?: number;
};

export type MusicNoiseEvent = {
  kind: "noise";
  at: number;
  dur: number;
  gain: number;
  hp: number;
};

export type MusicEvent = MusicToneEvent | MusicNoiseEvent;

/** I I IV I | V IV I V — cheerful major loop that resolves on repeat. */
const BAR_CHORD_DEGREE = [0, 0, 3, 0, 4, 3, 0, 4];

const MELODY_A = [4, 2, 0, 2, 5, 4, 2, 0];
const MELODY_B = [4, 5, 7, 5, 4, 2, 0, 2];
const MELODY_C = [7, 5, 4, 2, 4, 5, 7, 9];
const MELODY_D = [9, 7, 5, 4, 5, 4, 2, 0];
const MELODY_PHRASES = [MELODY_A, MELODY_B, MELODY_C, MELODY_D];

export function scaleHz(degree: number, octave = 0): number {
  const span = MUSIC_MAJOR_SCALE.length - 1;
  const wrapped = ((degree % span) + span) % span;
  const oct = octave + Math.floor(degree / span);
  const semitones = MUSIC_MAJOR_SCALE[wrapped]! + oct * 12;
  return MUSIC_ROOT_HZ * Math.pow(2, semitones / 12);
}

export function chordDegree(barIndex: number): number {
  const i = ((barIndex % MUSIC_LOOP_BARS) + MUSIC_LOOP_BARS) % MUSIC_LOOP_BARS;
  return BAR_CHORD_DEGREE[i]!;
}

export function isMajorScaleFrequency(freq: number): boolean {
  if (!(freq > 0) || !Number.isFinite(freq)) return false;
  const raw = 12 * Math.log2(freq / MUSIC_ROOT_HZ);
  let semi = raw % 12;
  if (semi < 0) semi += 12;
  return MUSIC_MAJOR_SCALE.some((s) => Math.abs(semi - (s % 12)) < 0.08);
}

/** Events for one bar, with times relative to the bar start. */
export function planPastureMusicBar(barIndex: number): MusicEvent[] {
  const events: MusicEvent[] = [];
  const chord = chordDegree(barIndex);
  const phrase =
    MELODY_PHRASES[
      Math.floor(
        (((barIndex % MUSIC_LOOP_BARS) + MUSIC_LOOP_BARS) % MUSIC_LOOP_BARS) /
          2,
      )
    ]!;
  const bounce = barIndex % 2 === 0 ? 0 : 4;

  // Soft major pad (root + third + fifth of the bar chord).
  events.push({
    kind: "tone",
    at: 0,
    freq: scaleHz(chord, -1),
    dur: MUSIC_BAR * 0.96,
    gain: 0.038,
    type: "sine",
    attack: 0.1,
  });
  events.push({
    kind: "tone",
    at: 0,
    freq: scaleHz(chord + 2, -1),
    dur: MUSIC_BAR * 0.96,
    gain: 0.024,
    type: "sine",
    attack: 0.12,
  });
  events.push({
    kind: "tone",
    at: 0,
    freq: scaleHz(chord + 4, -1),
    dur: MUSIC_BAR * 0.96,
    gain: 0.02,
    type: "sine",
    attack: 0.14,
  });

  // Bouncy bass: short notes on beats 1, the "and" of 2, 3, and 4.
  const bassSteps: Array<{ beat: number; deg: number; oct: number }> = [
    { beat: 0, deg: chord, oct: -1 },
    { beat: 1.5, deg: chord + 4, oct: -1 },
    { beat: 2, deg: chord, oct: -1 },
    { beat: 3, deg: chord + bounce, oct: 0 },
  ];
  for (const step of bassSteps) {
    events.push({
      kind: "tone",
      at: step.beat * MUSIC_BEAT,
      freq: scaleHz(step.deg, step.oct),
      dur: MUSIC_BEAT * 0.42,
      gain: step.beat === 0 ? 0.09 : 0.07,
      type: "triangle",
      attack: 0.012,
    });
  }

  // Cheerful melody in two-bar phrases, with an 8th-note skip on odd bars.
  const start = (barIndex % 2) * 4;
  for (let i = 0; i < 4; i++) {
    const degree = phrase[start + i]!;
    const pickup = barIndex % 2 === 1 && i === 3;
    events.push({
      kind: "tone",
      at: i * MUSIC_BEAT + 0.02,
      freq: scaleHz(degree, 1),
      dur: MUSIC_BEAT * (pickup ? 0.85 : 0.62),
      gain: i === 0 ? 0.07 : 0.055,
      type: "triangle",
      attack: 0.03,
    });
    if (pickup) {
      events.push({
        kind: "tone",
        at: i * MUSIC_BEAT + MUSIC_BEAT * 0.5,
        freq: scaleHz(0, 1),
        dur: MUSIC_BEAT * 0.28,
        gain: 0.04,
        type: "triangle",
        attack: 0.02,
      });
    }
  }

  // Light percussion: soft kick, offbeat shaker, clap on 2 and 4.
  for (const beat of [0, 2]) {
    events.push({
      kind: "tone",
      at: beat * MUSIC_BEAT,
      freq: 120,
      dur: 0.11,
      gain: 0.1,
      type: "sine",
      slide: 48,
      attack: 0.004,
    });
  }
  for (let i = 0; i < 8; i++) {
    const accent = i % 2 === 1;
    events.push({
      kind: "noise",
      at: i * (MUSIC_BEAT / 2) + 0.005,
      dur: accent ? 0.045 : 0.03,
      gain: accent ? 0.032 : 0.018,
      hp: accent ? 5200 : 7000,
    });
  }
  for (const beat of [1, 3]) {
    events.push({
      kind: "noise",
      at: beat * MUSIC_BEAT,
      dur: 0.055,
      gain: 0.045,
      hp: 1600,
    });
    events.push({
      kind: "noise",
      at: beat * MUSIC_BEAT + 0.018,
      dur: 0.04,
      gain: 0.028,
      hp: 2000,
    });
  }

  return events;
}

export function planPastureMusicLoop(): MusicEvent[] {
  const events: MusicEvent[] = [];
  for (let bar = 0; bar < MUSIC_LOOP_BARS; bar++) {
    const start = bar * MUSIC_BAR;
    for (const ev of planPastureMusicBar(bar)) {
      events.push({ ...ev, at: ev.at + start });
    }
  }
  return events;
}

export function musicLoopDuration(): number {
  return MUSIC_LOOP_BARS * MUSIC_BAR;
}
