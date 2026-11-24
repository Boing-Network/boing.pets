/**
 * Web Audio synthesis for the world: ambience beds (wind, water, crickets),
 * creature calls, event cues, a sparse generative score and UI ticks. No
 * audio files. What to play is decided in `design.ts` and `bind.ts`; this
 * file only makes the sound.
 *
 *   beds ─┐
 *   sfx  ─┼─► master ─► compressor ─► speakers
 *   music ┘      ▲
 *   sfx/music ─► reverb
 */
import {
  PAD_CHORDS,
  SCALE,
  midiToHz,
  type CueSpec,
  type SceneMix,
  type VoicePart,
  type VoiceSpec,
} from "./design";

export type PlayOptions = {
  /** 0…1 on top of the spec's own levels. */
  gain?: number;
  /** -1 (left) … 1 (right). */
  pan?: number;
  /** Pitch factor (voices only). */
  pitch?: number;
  /** 0…1 share sent to the reverb: more reads as further away. */
  wet?: number;
};

export type AudioEngine = {
  /** Creates (first call) or resumes the context. Call from a user gesture. */
  start(): void;
  /** Fades out and suspends: no CPU while muted or hidden. */
  stop(): void;
  running(): boolean;
  setVolume(volume: number): void;
  setMusic(on: boolean): void;
  setScene(mix: SceneMix): void;
  playVoice(spec: VoiceSpec, options?: PlayOptions): void;
  playCue(spec: CueSpec, options?: PlayOptions): void;
  playTick(): void;
  /** Output level right now (RMS, 0…1). For checks, not for mixing. */
  level(): number;
  dispose(): void;
};

const BED_LEVEL = { wind: 0.16, water: 0.2, crickets: 0.045 };
const VOICE_LEVEL = 0.45;
const CUE_LEVEL = 0.4;
const MUSIC_LEVEL = 0.55;
const SILENCE = 0.0001;
/** How far ahead of the clock the schedulers queue notes, in seconds. */
const LOOKAHEAD = 0.6;
const SCHEDULER_MS = 200;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)]!;

type Graph = {
  ctx: AudioContext;
  master: GainNode;
  beds: GainNode;
  sfx: GainNode;
  music: GainNode;
  reverb: GainNode;
  analyser: AnalyserNode;
  noise: AudioBuffer;
  wind: { gain: GainNode; filter: BiquadFilterNode };
  water: { gain: GainNode };
  meter: Float32Array<ArrayBuffer>;
};

function audioContextClass(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Four seconds of pink-ish noise (Paul Kellet's filter), looped by beds. */
function makeNoise(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
  }
  return buffer;
}

/** A soft outdoor tail: decaying noise, darker as it fades. */
function makeImpulse(ctx: AudioContext): AudioBuffer {
  const seconds = 2.6;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      const white = Math.random() * 2 - 1;
      // One-pole low-pass whose cutoff falls with time.
      const k = 0.55 - 0.45 * t;
      smooth += (white - smooth) * k;
      data[i] = smooth * (1 - t) ** 2.4;
    }
  }
  return buffer;
}

function buildGraph(ctx: AudioContext): Graph {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.3;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(compressor).connect(ctx.destination);
  compressor.connect(analyser);

  const bus = (level: number) => {
    const node = ctx.createGain();
    node.gain.value = level;
    node.connect(master);
    return node;
  };
  const beds = bus(1);
  const sfx = bus(1);
  const music = bus(MUSIC_LEVEL);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx);
  const reverb = ctx.createGain();
  reverb.gain.value = 1;
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.55;
  reverb.connect(convolver).connect(reverbReturn).connect(master);

  const noise = makeNoise(ctx);
  const loop = (rate: number) => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.playbackRate.value = rate;
    source.start(0, Math.random() * 3);
    return source;
  };

  const windFilter = ctx.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 400;
  windFilter.Q.value = 0.6;
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  loop(0.7).connect(windFilter).connect(windGain).connect(beds);

  const waterHigh = ctx.createBiquadFilter();
  waterHigh.type = "highpass";
  waterHigh.frequency.value = 500;
  const waterBand = ctx.createBiquadFilter();
  waterBand.type = "bandpass";
  waterBand.frequency.value = 1500;
  waterBand.Q.value = 0.5;
  const waterGain = ctx.createGain();
  waterGain.gain.value = 0;
  loop(1.3).connect(waterHigh).connect(waterBand).connect(waterGain);
  waterGain.connect(beds);

  return {
    ctx,
    master,
    beds,
    sfx,
    music,
    reverb,
    analyser,
    noise,
    wind: { gain: windGain, filter: windFilter },
    water: { gain: waterGain },
    meter: new Float32Array(analyser.fftSize),
  };
}

type Cricket = { next: number; hz: number; pan: number; period: number };

export function createAudioEngine(): AudioEngine {
  let graph: Graph | null = null;
  let wanted = false;
  let volume = 0.7;
  let musicOn = true;
  let scene: SceneMix = {
    wind: 0.4,
    windBright: 0.4,
    water: 0,
    crickets: 0,
    wildlife: 0,
  };
  let timer: ReturnType<typeof setInterval> | null = null;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let crickets: Cricket[] = [];
  let nextGust = 0;
  let nextBloop = 0;
  let nextPad = 0;
  let nextPhrase = 0;
  let chordIndex = 0;

  const isRunning = () =>
    graph != null && wanted && graph.ctx.state === "running";

  /** dry + reverb send behind an optional stereo position. */
  function output(g: Graph, bus: GainNode, pan: number, wet: number): GainNode {
    const out = g.ctx.createGain();
    const panner = g.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner);
    panner.connect(bus);
    if (wet > 0) {
      const send = g.ctx.createGain();
      send.gain.value = wet;
      panner.connect(send).connect(g.reverb);
    }
    return out;
  }

  function applyScene(g: Graph): void {
    const now = g.ctx.currentTime;
    g.water.gain.gain.setTargetAtTime(scene.water * BED_LEVEL.water, now, 0.5);
  }

  /** Wind breathes: every couple of seconds it drifts to a new strength. */
  function gust(g: Graph, now: number): void {
    const strength = rand(0.55, 1);
    const cutoff = (260 + scene.windBright * 900) * rand(0.75, 1.35);
    g.wind.gain.gain.setTargetAtTime(
      scene.wind * BED_LEVEL.wind * strength,
      now,
      1.1,
    );
    g.wind.filter.frequency.setTargetAtTime(cutoff, now, 1.3);
  }

  /** One trill: a held tone gated into a handful of quick pulses. */
  function trill(g: Graph, cricket: Cricket, at: number): void {
    const pulses = 3 + Math.floor(Math.random() * 3);
    const osc = g.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = cricket.hz;
    const env = g.ctx.createGain();
    env.gain.value = 0;
    const level = scene.crickets * BED_LEVEL.crickets;
    for (let i = 0; i < pulses; i += 1) {
      const t = at + i * 0.042;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(level, t + 0.006);
      env.gain.linearRampToValueAtTime(0, t + 0.024);
    }
    osc.connect(env).connect(output(g, g.beds, cricket.pan, 0.15));
    osc.start(at);
    osc.stop(at + pulses * 0.042 + 0.05);
  }

  /** A single water plop over the hiss. */
  function bloop(g: Graph, at: number): void {
    const osc = g.ctx.createOscillator();
    osc.type = "sine";
    const hz = rand(380, 900);
    osc.frequency.setValueAtTime(hz, at);
    osc.frequency.exponentialRampToValueAtTime(hz * rand(1.5, 2.1), at + 0.07);
    const env = g.ctx.createGain();
    env.gain.setValueAtTime(SILENCE, at);
    env.gain.exponentialRampToValueAtTime(scene.water * 0.05, at + 0.012);
    env.gain.exponentialRampToValueAtTime(SILENCE, at + 0.09);
    osc.connect(env).connect(output(g, g.beds, rand(-0.6, 0.6), 0.3));
    osc.start(at);
    osc.stop(at + 0.12);
  }

  function note(
    g: Graph,
    timbre: CueSpec["timbre"],
    hz: number,
    at: number,
    dur: number,
    level: number,
    out: GainNode,
  ): void {
    // A bell is a fundamental plus an inharmonic partial that dies sooner.
    const partials: { ratio: number; gain: number; life: number }[] =
      timbre === "bell"
        ? [
            { ratio: 1, gain: 1, life: 1 },
            { ratio: 2.76, gain: 0.22, life: 0.35 },
            { ratio: 5.4, gain: 0.08, life: 0.15 },
          ]
        : [
            { ratio: 1, gain: 1, life: 1 },
            { ratio: 2, gain: 0.3, life: 0.4 },
          ];
    for (const partial of partials) {
      const osc = g.ctx.createOscillator();
      osc.type = timbre === "bell" ? "sine" : "triangle";
      osc.frequency.value = hz * partial.ratio;
      const env = g.ctx.createGain();
      const end = at + Math.max(0.08, dur * partial.life);
      env.gain.setValueAtTime(SILENCE, at);
      env.gain.exponentialRampToValueAtTime(
        Math.max(SILENCE, level * partial.gain),
        at + 0.008,
      );
      env.gain.exponentialRampToValueAtTime(SILENCE, end);
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(end + 0.05);
    }
  }

  /** A slow chord swell: two detuned voices per note, under a low-pass. */
  function pad(g: Graph, chord: readonly number[], at: number): void {
    const attack = 3.2;
    const hold = 3.5;
    const release = 6;
    const filter = g.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 850;
    const env = g.ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.05, at + attack);
    env.gain.setValueAtTime(0.05, at + attack + hold);
    env.gain.linearRampToValueAtTime(0, at + attack + hold + release);
    filter.connect(env).connect(output(g, g.music, 0, 0.6));
    for (const midi of chord) {
      for (const cents of [-5, 5]) {
        const osc = g.ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = midiToHz(midi);
        osc.detune.value = cents;
        osc.connect(filter);
        osc.start(at);
        osc.stop(at + attack + hold + release + 0.1);
      }
    }
  }

  /** One to three plucked notes wandering the scale. */
  function phrase(g: Graph, at: number): void {
    const count = 1 + Math.floor(Math.random() * 3);
    let index = Math.floor(Math.random() * SCALE.length);
    let t = at;
    for (let i = 0; i < count; i += 1) {
      const out = output(g, g.music, rand(-0.4, 0.4), 0.7);
      note(g, "pluck", midiToHz(SCALE[index]!), t, 1.6, 0.07, out);
      index = Math.max(
        0,
        Math.min(SCALE.length - 1, index + pick([-2, -1, 1, 2])),
      );
      t += pick([0.3, 0.45, 0.6]);
    }
  }

  function schedule(): void {
    const g = graph;
    if (g == null || !isRunning()) return;
    const now = g.ctx.currentTime;
    const horizon = now + LOOKAHEAD;

    if (now >= nextGust) {
      gust(g, now);
      nextGust = now + rand(1.6, 3.4);
    }

    if (scene.crickets > 0.02) {
      for (const cricket of crickets) {
        if (cricket.next < now) cricket.next = now + rand(0, 0.5);
        while (cricket.next < horizon) {
          trill(g, cricket, cricket.next);
          // Mostly a steady rhythm; now and then one falls quiet a while.
          cricket.next +=
            Math.random() < 0.08
              ? rand(2, 5)
              : cricket.period * rand(0.92, 1.1);
        }
      }
    }

    if (scene.water > 0.15) {
      if (nextBloop < now) nextBloop = now + rand(0.2, 1.2);
      while (nextBloop < horizon) {
        bloop(g, nextBloop);
        nextBloop += rand(0.5, 2.4) / Math.max(0.3, scene.water);
      }
    }

    if (musicOn) {
      if (nextPad < now) nextPad = now + rand(1, 3);
      while (nextPad < horizon) {
        chordIndex = (chordIndex + pick([1, 1, 2, 3])) % PAD_CHORDS.length;
        pad(g, PAD_CHORDS[chordIndex]!, nextPad);
        nextPad += rand(9, 14);
      }
      if (nextPhrase < now) nextPhrase = now + rand(4, 8);
      while (nextPhrase < horizon) {
        phrase(g, nextPhrase);
        nextPhrase += rand(6, 15);
      }
    }
  }

  function voicePart(
    g: Graph,
    part: VoicePart,
    start: number,
    pitch: number,
    level: number,
    out: GainNode,
  ): void {
    const at = start + part.at;
    const end = at + part.dur;
    const attack = Math.min(0.02, part.dur * 0.25);
    const env = g.ctx.createGain();
    env.gain.setValueAtTime(SILENCE, at);
    env.gain.exponentialRampToValueAtTime(
      Math.max(SILENCE, level * part.gain),
      at + attack,
    );
    env.gain.setValueAtTime(
      Math.max(SILENCE, level * part.gain),
      Math.max(at + attack, end - part.dur * 0.35),
    );
    env.gain.exponentialRampToValueAtTime(SILENCE, end);

    let tail: AudioNode = env;
    if (part.am != null) {
      // Tremolo: a gain swinging 0…1 at the given rate.
      const gate = g.ctx.createGain();
      gate.gain.value = 0.5;
      const lfo = g.ctx.createOscillator();
      lfo.frequency.value = part.am;
      const depth = g.ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(gate.gain);
      lfo.start(at);
      lfo.stop(end + 0.05);
      env.connect(gate);
      tail = gate;
    }
    tail.connect(out);

    if (part.wave === "noise") {
      const source = g.ctx.createBufferSource();
      source.buffer = g.noise;
      source.loop = true;
      const band = g.ctx.createBiquadFilter();
      // Low thumps read better through a low-pass than a narrow band.
      band.type = part.from < 200 ? "lowpass" : "bandpass";
      band.frequency.value = part.from * pitch;
      band.Q.value = 1.2;
      const makeup = g.ctx.createGain();
      makeup.gain.value = 3;
      source.connect(band).connect(makeup).connect(env);
      source.start(at, Math.random() * 3);
      source.stop(end + 0.05);
      return;
    }

    const osc = g.ctx.createOscillator();
    osc.type = part.wave;
    osc.frequency.setValueAtTime(part.from * pitch, at);
    osc.frequency.exponentialRampToValueAtTime(part.to * pitch, end);
    if (part.vibHz != null && part.vibCents != null) {
      const lfo = g.ctx.createOscillator();
      lfo.frequency.value = part.vibHz;
      const depth = g.ctx.createGain();
      depth.gain.value = part.vibCents;
      lfo.connect(depth).connect(osc.detune);
      lfo.start(at);
      lfo.stop(end + 0.05);
    }
    if (part.lowpass != null) {
      const filter = g.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = part.lowpass * Math.max(1, pitch);
      osc.connect(filter).connect(env);
    } else {
      osc.connect(env);
    }
    osc.start(at);
    osc.stop(end + 0.05);
  }

  function whoosh(g: Graph, at: number, level: number, out: GainNode): void {
    const source = g.ctx.createBufferSource();
    source.buffer = g.noise;
    source.loop = true;
    const band = g.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(300, at);
    band.frequency.exponentialRampToValueAtTime(1800, at + 0.5);
    band.frequency.exponentialRampToValueAtTime(500, at + 1);
    const env = g.ctx.createGain();
    env.gain.setValueAtTime(SILENCE, at);
    env.gain.exponentialRampToValueAtTime(level * 1.6, at + 0.4);
    env.gain.exponentialRampToValueAtTime(SILENCE, at + 1.05);
    source.connect(band).connect(env).connect(out);
    source.start(at, Math.random() * 3);
    source.stop(at + 1.1);
  }

  function fadeMaster(g: Graph, to: number, seconds: number): void {
    const now = g.ctx.currentTime;
    g.master.gain.cancelScheduledValues(now);
    g.master.gain.setTargetAtTime(to, now, seconds / 3);
  }

  return {
    start() {
      wanted = true;
      if (suspendTimer != null) {
        clearTimeout(suspendTimer);
        suspendTimer = null;
      }
      if (graph == null) {
        const Ctx = audioContextClass();
        if (Ctx == null) return;
        let ctx: AudioContext;
        try {
          ctx = new Ctx({ latencyHint: "interactive" });
        } catch {
          return;
        }
        graph = buildGraph(ctx);
        crickets = [0, 1, 2, 3].map((i) => ({
          next: 0,
          hz: 4100 + i * 230 + rand(-60, 60),
          pan: [-0.7, 0.5, -0.2, 0.75][i]!,
          period: rand(0.55, 1.1),
        }));
        applyScene(graph);
        // Chromium fires this when a gesture finally lets a blocked context
        // run; pick the fade up from there.
        ctx.onstatechange = () => {
          if (graph != null && wanted && ctx.state === "running") {
            fadeMaster(graph, volume, 0.8);
          }
        };
      }
      const g = graph;
      // Rejected (not thrown) when the browser still wants a gesture; the
      // next gesture calls start() again.
      void g.ctx.resume().catch(() => undefined);
      fadeMaster(g, volume, 0.8);
      timer ??= setInterval(schedule, SCHEDULER_MS);
    },

    stop() {
      wanted = false;
      const g = graph;
      if (g == null) return;
      fadeMaster(g, 0, 0.25);
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
      suspendTimer ??= setTimeout(() => {
        suspendTimer = null;
        if (!wanted) void g.ctx.suspend().catch(() => undefined);
      }, 400);
    },

    running: isRunning,

    setVolume(next) {
      volume = Math.max(0, Math.min(1, next));
      if (graph != null && wanted) fadeMaster(graph, volume, 0.15);
    },

    setMusic(on) {
      musicOn = on;
      const g = graph;
      if (g == null) return;
      // Notes already queued fade with the bus instead of being cut.
      g.music.gain.setTargetAtTime(
        on ? MUSIC_LEVEL : 0,
        g.ctx.currentTime,
        on ? 0.4 : 0.8,
      );
    },

    setScene(mix) {
      scene = mix;
      if (graph != null) applyScene(graph);
    },

    playVoice(spec, options = {}) {
      const g = graph;
      if (g == null || !isRunning() || spec.parts.length === 0) return;
      const out = output(g, g.sfx, options.pan ?? 0, options.wet ?? 0.25);
      const level = VOICE_LEVEL * (options.gain ?? 1);
      const start = g.ctx.currentTime + 0.02;
      for (const part of spec.parts) {
        voicePart(g, part, start, options.pitch ?? 1, level, out);
      }
    },

    playCue(spec, options = {}) {
      const g = graph;
      if (g == null || !isRunning()) return;
      const out = output(g, g.sfx, options.pan ?? 0, options.wet ?? 0.5);
      const level = CUE_LEVEL * (options.gain ?? 1);
      const start = g.ctx.currentTime + 0.02;
      if (spec.whoosh) whoosh(g, start, level * 0.5, out);
      for (const n of spec.notes) {
        note(
          g,
          spec.timbre,
          midiToHz(n.midi),
          start + n.at,
          n.dur,
          level * n.gain,
          out,
        );
      }
    },

    playTick() {
      const g = graph;
      if (g == null || !isRunning()) return;
      const at = g.ctx.currentTime + 0.005;
      const osc = g.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1250, at);
      osc.frequency.exponentialRampToValueAtTime(820, at + 0.04);
      const env = g.ctx.createGain();
      env.gain.setValueAtTime(SILENCE, at);
      env.gain.exponentialRampToValueAtTime(0.05, at + 0.004);
      env.gain.exponentialRampToValueAtTime(SILENCE, at + 0.05);
      osc.connect(env).connect(g.sfx);
      osc.start(at);
      osc.stop(at + 0.07);
    },

    level() {
      const g = graph;
      if (g == null) return 0;
      g.analyser.getFloatTimeDomainData(g.meter);
      let sum = 0;
      for (const sample of g.meter) sum += sample * sample;
      return Math.sqrt(sum / g.meter.length);
    },

    dispose() {
      wanted = false;
      if (timer != null) clearInterval(timer);
      if (suspendTimer != null) clearTimeout(suspendTimer);
      timer = null;
      suspendTimer = null;
      void graph?.ctx.close().catch(() => undefined);
      graph = null;
    },
  };
}
