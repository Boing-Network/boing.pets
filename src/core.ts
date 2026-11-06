import { blake3 } from "@noble/hashes/blake3";
export const DAY = 86_400_000;
export const SPECIES = [
  "Blobbit",
  "Sprout",
  "Mooncat",
  "Cloudling",
  "Bunbounce",
  "Axobop",
  "Pebblit",
  "Starfin",
  "Mushling",
  "Boingle",
] as const;
export type Action = "hatch" | "feed" | "checkin";
export interface Pet {
  owner: string;
  hatch_tx: string;
  created_at: number;
}
export interface CareEvent {
  action: Action;
  created_at: number;
}
export function hex32(value: unknown): string {
  if (typeof value !== "string" || !/^(0x)?[a-f0-9]{64}$/i.test(value))
    throw new Error("Expected a 32-byte Boing account or transaction id");
  return "0x" + value.replace(/^0x/i, "").toLowerCase();
}
export const dayOf = (time: number) => Math.floor(time / DAY);
export function traits(owner: string, tx: string) {
  const seed = blake3(
    new TextEncoder().encode(`boing.pets:v1:${hex32(owner)}:${hex32(tx)}`),
  );
  return {
    species: SPECIES[seed[0] % SPECIES.length],
    shape: seed[0] % SPECIES.length,
    hue: (seed[1] * 360) / 256,
    accent: (seed[2] * 360) / 256,
    spots: seed[3] % 4,
    antenna: seed[4] % 3,
  };
}
export function state(pet: Pet, events: CareEvent[], now: number) {
  const valid = events.filter(
    (e) => e.created_at <= now && e.created_at >= pet.created_at,
  );
  const lastCare = Math.max(pet.created_at, ...valid.map((e) => e.created_at));
  const lastFed = Math.max(
    pet.created_at,
    ...valid.filter((e) => e.action === "feed").map((e) => e.created_at),
  );
  const days = new Set([
    dayOf(pet.created_at),
    ...valid.map((e) => dayOf(e.created_at)),
  ]);
  let cursor = dayOf(now);
  if (!days.has(cursor)) cursor--;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor--;
  }
  const hunger = Math.max(
    0,
    Math.round(100 - (25 * Math.max(0, now - lastFed)) / DAY),
  );
  const happiness = Math.max(
    0,
    Math.round(100 - (20 * Math.max(0, now - lastCare)) / DAY),
  );
  const status =
    now - lastFed >= 4 * DAY
      ? "stray"
      : now - lastFed >= 2 * DAY
        ? "scruffy"
        : hunger < 75
          ? "peckish"
          : "bouncy";
  return {
    hunger,
    happiness,
    streak,
    status,
    lastCare,
    lastFed,
    checkedIn: valid.some(
      (e) => e.action === "checkin" && dayOf(e.created_at) === dayOf(now),
    ),
    fedToday: valid.some(
      (e) => e.action === "feed" && dayOf(e.created_at) === dayOf(now),
    ),
  };
}
// A challenge marker encoded in a tiny self-transfer: 0.001 BOING + <0.000001 BOING.
// This is NOT a signed memo. The unique amount binds the chain action to its API challenge.
export function markerAmount(id: string, action: Action): string {
  const bytes = blake3(new TextEncoder().encode(`boing.pets:${action}:${id}`));
  const n =
    bytes.slice(0, 5).reduce((n, b) => (n << 8n) + BigInt(b), 0n) %
    1_000_000_000_000n;
  return (1_000_000_000_000_000n + n).toString();
}
export function petSvg(t: ReturnType<typeof traits>, sad = false): string {
  const color = `hsl(${t.hue} 75% 72%)`,
    accent = `hsl(${t.accent} 80% 70%)`;
  const ears = [
    '<ellipse cx="65" cy="71" rx="15" ry="18"/><ellipse cx="135" cy="71" rx="15" ry="18"/>',
    '<path d="M99 69Q56 29 78 24Q112 21 102 69M101 64Q103 17 128 23Q150 35 101 64"/>',
    '<path d="M56 88L53 39L86 70M113 70L148 39L145 89"/>',
    '<circle cx="65" cy="84" r="25"/><circle cx="133" cy="84" r="25"/>',
    '<ellipse cx="74" cy="51" rx="12" ry="35"/><ellipse cx="126" cy="51" rx="12" ry="35"/>',
    '<path d="M58 93L27 68L37 107L25 123L61 129M143 93L173 68L164 107L177 123L141 129"/>',
    '<path d="M56 103L65 55L105 40L142 65L152 110Z"/>',
    '<path d="M100 22L112 57L149 57L120 79L130 116L100 94L69 116L79 79L50 57L88 57Z"/>',
    '<path d="M41 87Q52 22 100 26Q147 22 160 87Z"/>',
    '<path d="M70 70L56 45L86 59L100 29L116 59L144 45L132 80Z"/>',
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 190" role="img" aria-label="${sad ? "Scruffy" : "Happy"} ${t.species}"><ellipse cx="100" cy="166" rx="55" ry="10" fill="#0003"/><g stroke="#142044" stroke-width="4" stroke-linejoin="round" fill="${accent}">${ears[t.shape]}<ellipse cx="100" cy="114" rx="54" ry="48" fill="${color}"/><ellipse cx="69" cy="155" rx="18" ry="9"/><ellipse cx="131" cy="155" rx="18" ry="9"/></g>${Array.from({ length: t.spots }, (_, i) => `<circle cx="${70 + i * 23}" cy="130" r="7" fill="${accent}" opacity=".6"/>`).join("")}<g fill="#142044"><circle cx="80" cy="104" r="5"/><circle cx="120" cy="104" r="5"/></g><path d="${sad ? "M88 127Q100 113 112 127" : "M88 119Q100 134 112 119"}" fill="none" stroke="#142044" stroke-width="4" stroke-linecap="round"/>${t.antenna === 1 ? `<circle cx="100" cy="82" r="5" fill="${accent}"/>` : ""}${sad ? '<path d="M53 144L40 153M147 144L160 153" stroke="#9aa9bd" stroke-width="3"/>' : ""}</svg>`;
}
