/** Public pasture lighting.

The Yard stays locked to one shared late-afternoon hour so every visitor
sees the same dusk rooftop. Hours are 0-24. `samplePastureDay` still
understands a wall-clock timestamp for tests and for the debug override,
but the public default must not follow the visitor's clock.
*/

/** Late afternoon / dusk, matching The Yard mockups (hard west sun). */
export const PUBLIC_PASTURE_HOUR = 17;

export function publicPastureDay() {
  return samplePastureDay(PUBLIC_PASTURE_HOUR, true);
}

export type PastureDaySample = {
  hour: number;
  sunX: number;
  sunY: number;
  sunZ: number;
  sunColor: string;
  sunIntensity: number;
  fillColor: string;
  fillIntensity: number;
  ambient: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  background: string;
  exposure: number;
  showFireflies: boolean;
  isNight: boolean;
};

type Key = {
  hour: number;
  sunColor: string;
  sunIntensity: number;
  fillColor: string;
  fillIntensity: number;
  ambient: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  background: string;
  exposure: number;
};

const KEYS: readonly Key[] = [
  {
    hour: 0,
    sunColor: "#9bbcff",
    sunIntensity: 0.18,
    fillColor: "#3a4a7a",
    fillIntensity: 0.12,
    ambient: 0.1,
    hemiSky: "#1a2748",
    hemiGround: "#1a1816",
    hemiIntensity: 0.22,
    fogColor: "#1b2438",
    fogNear: 28,
    fogFar: 110,
    background: "#151c2c",
    exposure: 0.78,
  },
  {
    hour: 5.5,
    sunColor: "#ffb38a",
    sunIntensity: 0.45,
    fillColor: "#7a8ec8",
    fillIntensity: 0.18,
    ambient: 0.16,
    hemiSky: "#f3c4a0",
    hemiGround: "#5a4a3a",
    hemiIntensity: 0.32,
    fogColor: "#d9b6a0",
    fogNear: 32,
    fogFar: 120,
    background: "#c9a090",
    exposure: 0.9,
  },
  {
    hour: 8,
    sunColor: "#ffe2b0",
    sunIntensity: 1.15,
    fillColor: "#9bb7ff",
    fillIntensity: 0.22,
    ambient: 0.28,
    hemiSky: "#cfe4ff",
    hemiGround: "#7a6a58",
    hemiIntensity: 0.5,
    fogColor: "#d2c4b0",
    fogNear: 40,
    fogFar: 140,
    background: "#c9b8a8",
    exposure: 1.02,
  },
  {
    hour: 12,
    sunColor: "#fff1d0",
    sunIntensity: 1.35,
    fillColor: "#9bb7ff",
    fillIntensity: 0.22,
    ambient: 0.32,
    hemiSky: "#cfe4ff",
    hemiGround: "#7a6a58",
    hemiIntensity: 0.55,
    fogColor: "#cbbba4",
    fogNear: 40,
    fogFar: 140,
    background: "#c9b8a8",
    exposure: 1.05,
  },
  {
    hour: 17,
    sunColor: "#ffb36a",
    sunIntensity: 1.12,
    fillColor: "#6a7a9a",
    fillIntensity: 0.22,
    ambient: 0.2,
    hemiSky: "#f0c4a0",
    hemiGround: "#6a5a48",
    hemiIntensity: 0.4,
    fogColor: "#c4a888",
    fogNear: 36,
    fogFar: 130,
    background: "#d4a878",
    exposure: 0.92,
  },
  {
    hour: 19.5,
    sunColor: "#ff8a6a",
    sunIntensity: 0.55,
    fillColor: "#5a6aaa",
    fillIntensity: 0.18,
    ambient: 0.16,
    hemiSky: "#c48aaa",
    hemiGround: "#2a2420",
    hemiIntensity: 0.34,
    fogColor: "#6a5470",
    fogNear: 30,
    fogFar: 115,
    background: "#4a3a58",
    exposure: 0.86,
  },
  {
    hour: 22,
    sunColor: "#9bbcff",
    sunIntensity: 0.22,
    fillColor: "#3a4a7a",
    fillIntensity: 0.12,
    ambient: 0.1,
    hemiSky: "#1a2748",
    hemiGround: "#1a1816",
    hemiIntensity: 0.22,
    fogColor: "#1b2438",
    fogNear: 28,
    fogFar: 110,
    background: "#151c2c",
    exposure: 0.78,
  },
  {
    hour: 24,
    sunColor: "#9bbcff",
    sunIntensity: 0.18,
    fillColor: "#3a4a7a",
    fillIntensity: 0.12,
    ambient: 0.1,
    hemiSky: "#1a2748",
    hemiGround: "#1a1816",
    hemiIntensity: 0.22,
    fogColor: "#1b2438",
    fogNear: 28,
    fogFar: 110,
    background: "#151c2c",
    exposure: 0.78,
  },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function parseHex(color: string): [number, number, number] {
  const n = Number.parseInt(color.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const r = Math.round(lerp(ar, br, t) * 255);
  const g = Math.round(lerp(ag, bg, t) * 255);
  const bl = Math.round(lerp(ab, bb, t) * 255);
  return (
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    bl.toString(16).padStart(2, "0")
  );
}

export function hourFromMs(ms: number): number {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

export function samplePastureDay(
  msOrHour: number,
  isHour = false,
): PastureDaySample {
  const hour = (((isHour ? msOrHour : hourFromMs(msOrHour)) % 24) + 24) % 24;
  let i = 0;
  while (i + 1 < KEYS.length && KEYS[i + 1]!.hour <= hour) i += 1;
  const a = KEYS[i]!;
  const b = KEYS[Math.min(i + 1, KEYS.length - 1)]!;
  const span = b.hour - a.hour || 1;
  const t = Math.max(0, Math.min(1, (hour - a.hour) / span));
  const angle = ((hour - 6) / 12) * Math.PI;
  const sunY = Math.max(0.12, Math.sin(angle) * 28);
  const sunX = Math.cos(angle) * 36;
  const sunZ = Math.sin(angle * 0.35) * 16;
  const showFireflies = hour >= 19 || hour < 5.8;
  return {
    hour,
    sunX,
    sunY,
    sunZ: showFireflies ? 18 : sunZ,
    sunColor: mixHex(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    fillColor: mixHex(a.fillColor, b.fillColor, t),
    fillIntensity: lerp(a.fillIntensity, b.fillIntensity, t),
    ambient: lerp(a.ambient, b.ambient, t),
    hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, t),
    fogColor: mixHex(a.fogColor, b.fogColor, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    background: mixHex(a.background, b.background, t),
    exposure: lerp(a.exposure, b.exposure, t),
    showFireflies,
    isNight: hour >= 20 || hour < 5.5,
  };
}
