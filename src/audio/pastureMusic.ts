/** Street-beat plan for The Yard. Original, procedural, and loopable. */

export const MUSIC_BPM = 96;
export const MUSIC_BEAT = 60 / MUSIC_BPM;
export const MUSIC_BAR = MUSIC_BEAT * 4;
/** Eight-bar form that lands back on the tonic. */
export const MUSIC_LOOP_BARS = 8;
/** A2. Minor pentatonic, the pocket under a street tag. */
export const MUSIC_ROOT_HZ = 110;
/** Minor pentatonic degrees in semitones from the root. */
export const MUSIC_SCALE = [0, 3, 5, 7, 10, 12] as const;

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

/** i i bVII iv | i bIII iv i */
const BAR_CHORD_DEGREE = [0, 0, 4, 2, 0, 1, 2, 0];

const MELODY_A = [0, 2, 4, 2, 1, 0, 2, 4];
const MELODY_B = [4, 3, 2, 0, 2, 4, 3, 1];
const MELODY_C = [1, 2, 4, 3, 2, 1, 0, 2];
const MELODY_D = [4, 2, 1, 0, 2, 1, 0, 0];
const MELODY_PHRASES = [MELODY_A, MELODY_B, MELODY_C, MELODY_D];

export function scaleHz(degree: number, octave = 0): number {
  const span = MUSIC_SCALE.length - 1;
  const wrapped = ((degree % span) + span) % span;
  const oct = octave + Math.floor(degree / span);
  const semitones = MUSIC_SCALE[wrapped]! + oct * 12;
  return MUSIC_ROOT_HZ * Math.pow(2, semitones / 12);
}

export function chordDegree(barIndex: number): number {
  const i = ((barIndex % MUSIC_LOOP_BARS) + MUSIC_LOOP_BARS) % MUSIC_LOOP_BARS;
  return BAR_CHORD_DEGREE[i]!;
}

export function isScaleFrequency(freq: number): boolean {
  if (!(freq > 0) || !Number.isFinite(freq)) return false;
  const raw = 12 * Math.log2(freq / MUSIC_ROOT_HZ);
  let semi = raw % 12;
  if (semi < 0) semi += 12;
  return MUSIC_SCALE.some((s) => Math.abs(semi - (s % 12)) < 0.08);
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

  // Low minor pad: root, minor third, fifth.
  for (const [step, gain, attack] of [
    [0, 0.034, 0.08],
    [1, 0.022, 0.1],
    [3, 0.018, 0.12],
  ] as const) {
    events.push({
      kind: "tone",
      at: 0,
      freq: scaleHz(chord + step, 0),
      dur: MUSIC_BAR * 0.98,
      gain,
      type: "sine",
      attack,
    });
  }

  // Syncopated bass. Short enough to read as notes, low enough to sit under the beat.
  const bassSteps = [0, 0.75, 2, 2.75];
  bassSteps.forEach((beat, i) => {
    const step = [0, 3, 0, 4][i]!;
    events.push({
      kind: "tone",
      at: beat * MUSIC_BEAT,
      freq: scaleHz(chord + step, 0),
      dur: MUSIC_BEAT * 0.38,
      gain: beat === 0 ? 0.12 : 0.09,
      type: "triangle",
      attack: 0.008,
    });
  });

  // Sparse hook. Two-bar phrases, only the strong 8ths, an octave up.
  const start = (barIndex % 2) * 4;
  for (let i = 0; i < 4; i++) {
    if (i === 1) continue;
    const degree = phrase[start + i]!;
    events.push({
      kind: "tone",
      at: i * MUSIC_BEAT + (i === 3 ? MUSIC_BEAT * 0.5 : 0.01),
      freq: scaleHz(degree, 2),
      dur: MUSIC_BEAT * 0.34,
      gain: i === 0 ? 0.05 : 0.038,
      type: "square",
      attack: 0.012,
    });
  }

  // Boom-bap: kick on 1 and the "and" of 3, snare on 2 and 4, swung hats.
  for (const beat of [0, 2.5]) {
    events.push({
      kind: "tone",
      at: beat * MUSIC_BEAT,
      freq: 78,
      dur: 0.16,
      gain: beat === 0 ? 0.16 : 0.11,
      type: "sine",
      slide: 36,
      attack: 0.003,
    });
  }
  for (let i = 0; i < 8; i++) {
    const swung = i % 2 === 1;
    const step = MUSIC_BEAT / 2;
    events.push({
      kind: "noise",
      at: i * step + (swung ? step * 0.22 : 0),
      dur: swung ? 0.03 : 0.022,
      gain: swung ? 0.028 : 0.016,
      hp: swung ? 6400 : 7800,
    });
  }
  for (const beat of [1, 3]) {
    events.push({
      kind: "noise",
      at: beat * MUSIC_BEAT,
      dur: 0.07,
      gain: 0.055,
      hp: 1400,
    });
    events.push({
      kind: "noise",
      at: beat * MUSIC_BEAT + 0.016,
      dur: 0.045,
      gain: 0.03,
      hp: 2200,
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
