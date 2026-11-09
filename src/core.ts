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

export const PERSONALITIES = [
  "Curious",
  "Lazy",
  "Adventurous",
  "Friendly",
  "Mischievous",
  "Cozy",
  "Peppy",
  "Dreamy",
] as const;

export const STAGES = [
  "egg",
  "baby",
  "child",
  "teen",
  "adult",
  "elder",
] as const;

export const ACTIONS = ["hatch", "feed", "checkin", "play", "groom"] as const;

export type Action = (typeof ACTIONS)[number];
export type Personality = (typeof PERSONALITIES)[number];
export type Stage = (typeof STAGES)[number];

export interface Pet {
  owner: string;
  hatch_tx: string;
  created_at: number;
}

export interface CareEvent {
  action: Action;
  created_at: number;
}

/** Soft-currency and XP granted per verified care event (event-sourced). */
export const CARE_REWARDS: Record<Action, { boinglets: number; xp: number }> = {
  hatch: { boinglets: 50, xp: 25 },
  feed: { boinglets: 12, xp: 10 },
  checkin: { boinglets: 6, xp: 6 },
  play: { boinglets: 10, xp: 8 },
  groom: { boinglets: 10, xp: 8 },
};

export const ACHIEVEMENTS = {
  first_bounce: { title: "First Bounce", description: "Hatch your buddy." },
  kind_hello: { title: "Kind Hello", description: "Send a daily hello." },
  full_bowl: { title: "Full Bowl", description: "Feed your buddy." },
  playtime: { title: "Playtime", description: "Play with your buddy." },
  fresh_coat: { title: "Fresh Coat", description: "Groom your buddy." },
  streak_3: {
    title: "Three-Day Glow",
    description: "Keep a 3-day care streak.",
  },
  streak_7: {
    title: "Week of Wobbles",
    description: "Keep a 7-day care streak.",
  },
  balanced_day: {
    title: "Balanced Day",
    description: "Feed, hello, play, and groom in one UTC day.",
  },
} as const;

export type AchievementCode = keyof typeof ACHIEVEMENTS;

export function hex32(value: unknown): string {
  if (typeof value !== "string" || !/^(0x)?[a-f0-9]{64}$/i.test(value))
    throw new Error("Expected a 32-byte Boing account or transaction id");
  return "0x" + value.replace(/^0x/i, "").toLowerCase();
}

export const dayOf = (time: number) => Math.floor(time / DAY);

export function isAction(value: unknown): value is Action {
  return (
    typeof value === "string" && (ACTIONS as readonly string[]).includes(value)
  );
}

export function isSignatureAction(action: Action): boolean {
  return action === "checkin" || action === "play" || action === "groom";
}

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
    personality: PERSONALITIES[seed[5] % PERSONALITIES.length] as Personality,
  };
}

function lastOf(
  pet: Pet,
  valid: CareEvent[],
  match: (e: CareEvent) => boolean,
): number {
  const times = valid.filter(match).map((e) => e.created_at);
  return Math.max(pet.created_at, ...times);
}

function decay(from: number, now: number, perDay: number): number {
  return Math.max(
    0,
    Math.round(100 - (perDay * Math.max(0, now - from)) / DAY),
  );
}

export function growthStage(pet: Pet, careDays: number, now: number): Stage {
  const ageDays = Math.max(0, (now - pet.created_at) / DAY);
  if (ageDays >= 120) return "elder";
  if (ageDays >= 21 && careDays >= 10) return "adult";
  if (ageDays >= 7 && careDays >= 4) return "teen";
  if (ageDays >= 2 && careDays >= 1) return "child";
  return "baby";
}

export function skillLeanings(valid: CareEvent[]) {
  const scores = {
    Explorer: 0,
    Athlete: 0,
    Scholar: 0,
    Performer: 0,
    Collector: 0,
  };
  for (const e of valid) {
    if (e.action === "play") scores.Athlete += 2;
    if (e.action === "groom") scores.Performer += 1;
    if (e.action === "feed") scores.Collector += 1;
    if (e.action === "checkin") scores.Scholar += 1;
    if (e.action === "hatch") scores.Explorer += 2;
  }
  const top = (Object.entries(scores) as [keyof typeof scores, number][]).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  return { scores, focus: top[1] > 0 ? top[0] : ("Explorer" as const) };
}

export function rewardTotals(valid: CareEvent[]) {
  let boinglets = 0;
  let xp = 0;
  for (const e of valid) {
    const reward = CARE_REWARDS[e.action];
    boinglets += reward.boinglets;
    xp += reward.xp;
  }
  return { boinglets, xp };
}

export function state(pet: Pet, events: CareEvent[], now: number) {
  const valid = events.filter(
    (e) => e.created_at <= now && e.created_at >= pet.created_at,
  );
  const lastCare = Math.max(pet.created_at, ...valid.map((e) => e.created_at));
  const lastFed = lastOf(pet, valid, (e) => e.action === "feed");
  const lastPlay = lastOf(
    pet,
    valid,
    (e) => e.action === "play" || e.action === "hatch",
  );
  const lastGroom = lastOf(
    pet,
    valid,
    (e) => e.action === "groom" || e.action === "hatch",
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
  const hunger = decay(lastFed, now, 25);
  const happiness = decay(lastCare, now, 20);
  const energy = decay(lastPlay, now, 15);
  const hygiene = decay(lastGroom, now, 18);
  const health = Math.round(
    hunger * 0.3 + happiness * 0.25 + energy * 0.2 + hygiene * 0.25,
  );
  const status =
    now - lastFed >= 4 * DAY
      ? "stray"
      : now - lastFed >= 2 * DAY
        ? "scruffy"
        : hunger < 75
          ? "peckish"
          : "bouncy";
  const today = dayOf(now);
  const todayActions = new Set(
    valid.filter((e) => dayOf(e.created_at) === today).map((e) => e.action),
  );
  const rewards = rewardTotals(valid);
  const skills = skillLeanings(valid);
  return {
    hunger,
    happiness,
    energy,
    hygiene,
    health,
    streak,
    status,
    stage: growthStage(pet, days.size, now),
    careDays: days.size,
    lastCare,
    lastFed,
    checkedIn: todayActions.has("checkin"),
    fedToday: todayActions.has("feed"),
    playedToday: todayActions.has("play"),
    groomedToday: todayActions.has("groom"),
    boinglets: rewards.boinglets + streak * 2,
    xp: rewards.xp,
    skills,
  };
}

/** Achievements unlocked purely from event history + derived streak. */
export function unlockedAchievements(
  pet: Pet,
  events: CareEvent[],
  now: number,
): AchievementCode[] {
  const valid = events.filter(
    (e) => e.created_at <= now && e.created_at >= pet.created_at,
  );
  const actions = new Set(valid.map((e) => e.action));
  const { streak } = state(pet, events, now);
  const byDay = new Map<number, Set<Action>>();
  for (const e of valid) {
    const d = dayOf(e.created_at);
    const set = byDay.get(d) ?? new Set();
    set.add(e.action);
    byDay.set(d, set);
  }
  const balanced = [...byDay.values()].some(
    (set) =>
      set.has("feed") &&
      set.has("checkin") &&
      set.has("play") &&
      set.has("groom"),
  );
  const out: AchievementCode[] = [];
  // A persisted pet implies a successful hatch (and usually a hatch event).
  out.push("first_bounce");
  if (actions.has("checkin")) out.push("kind_hello");
  if (actions.has("feed")) out.push("full_bowl");
  if (actions.has("play")) out.push("playtime");
  if (actions.has("groom")) out.push("fresh_coat");
  if (streak >= 3) out.push("streak_3");
  if (streak >= 7) out.push("streak_7");
  if (balanced) out.push("balanced_day");
  return out;
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

export interface CareRollup {
  lastCare: number;
  lastFed: number;
  lastPlay: number;
  lastGroom: number;
  careDays: number[];
  actionCounts: Record<Action, number>;
  todayDay: number;
  todayActions: Action[];
  hadBalancedDay: boolean;
}

export function emptyActionCounts(): Record<Action, number> {
  return { hatch: 0, feed: 0, checkin: 0, play: 0, groom: 0 };
}

function isBalancedDay(actions: Iterable<Action>): boolean {
  const set = actions instanceof Set ? actions : new Set(actions);
  return (
    set.has("feed") && set.has("checkin") && set.has("play") && set.has("groom")
  );
}

/** Build a rollup from the same event stream `state()` uses. */
export function rollupFromEvents(
  pet: Pet,
  events: CareEvent[],
  now: number,
): CareRollup {
  const valid = events.filter(
    (e) => e.created_at <= now && e.created_at >= pet.created_at,
  );
  const counts = emptyActionCounts();
  for (const e of valid) counts[e.action] += 1;
  const days = new Set<number>([
    dayOf(pet.created_at),
    ...valid.map((e) => dayOf(e.created_at)),
  ]);
  const today = dayOf(now);
  const todayActions = [
    ...new Set(
      valid.filter((e) => dayOf(e.created_at) === today).map((e) => e.action),
    ),
  ];
  const byDay = new Map<number, Set<Action>>();
  for (const e of valid) {
    const d = dayOf(e.created_at);
    const set = byDay.get(d) ?? new Set<Action>();
    set.add(e.action);
    byDay.set(d, set);
  }
  const hadBalancedDay = [...byDay.values()].some((set) => isBalancedDay(set));
  const careTimes = valid.map((e) => e.created_at);
  return {
    lastCare: Math.max(pet.created_at, ...careTimes),
    lastFed: lastOf(pet, valid, (e) => e.action === "feed"),
    lastPlay: lastOf(
      pet,
      valid,
      (e) => e.action === "play" || e.action === "hatch",
    ),
    lastGroom: lastOf(
      pet,
      valid,
      (e) => e.action === "groom" || e.action === "hatch",
    ),
    careDays: [...days].sort((a, b) => a - b),
    actionCounts: counts,
    todayDay: today,
    todayActions,
    hadBalancedDay,
  };
}

/** Apply one newly confirmed care action onto an existing rollup. */
export function applyCareToRollup(
  rollup: CareRollup,
  action: Action,
  at: number,
  petCreatedAt: number,
): CareRollup {
  const day = dayOf(at);
  const counts = {
    ...rollup.actionCounts,
    [action]: (rollup.actionCounts[action] || 0) + 1,
  };
  const careDays = rollup.careDays.includes(day)
    ? rollup.careDays
    : [...rollup.careDays, day].sort((a, b) => a - b);
  const todayActions =
    rollup.todayDay === day
      ? rollup.todayActions.includes(action)
        ? rollup.todayActions
        : [...rollup.todayActions, action]
      : [action];
  const dayActions = new Set(todayActions);
  return {
    lastCare: Math.max(rollup.lastCare, at, petCreatedAt),
    lastFed: action === "feed" ? Math.max(rollup.lastFed, at) : rollup.lastFed,
    lastPlay:
      action === "play" || action === "hatch"
        ? Math.max(rollup.lastPlay, at)
        : rollup.lastPlay,
    lastGroom:
      action === "groom" || action === "hatch"
        ? Math.max(rollup.lastGroom, at)
        : rollup.lastGroom,
    careDays,
    actionCounts: counts,
    todayDay: day,
    todayActions,
    hadBalancedDay: rollup.hadBalancedDay || isBalancedDay(dayActions),
  };
}

/** Reconstruct `state()` from a rollup without loading events. */
export function stateFromRollup(pet: Pet, rollup: CareRollup, now: number) {
  const today = dayOf(now);
  const todayActions = new Set(
    rollup.todayDay === today ? rollup.todayActions : [],
  );
  const days = new Set(rollup.careDays);
  days.add(dayOf(pet.created_at));
  let cursor = today;
  if (!days.has(cursor)) cursor--;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor--;
  }
  const hunger = decay(rollup.lastFed, now, 25);
  const happiness = decay(rollup.lastCare, now, 20);
  const energy = decay(rollup.lastPlay, now, 15);
  const hygiene = decay(rollup.lastGroom, now, 18);
  const health = Math.round(
    hunger * 0.3 + happiness * 0.25 + energy * 0.2 + hygiene * 0.25,
  );
  const status =
    now - rollup.lastFed >= 4 * DAY
      ? "stray"
      : now - rollup.lastFed >= 2 * DAY
        ? "scruffy"
        : hunger < 75
          ? "peckish"
          : "bouncy";
  let boinglets = 0;
  let xp = 0;
  for (const action of ACTIONS) {
    const n = rollup.actionCounts[action] || 0;
    boinglets += CARE_REWARDS[action].boinglets * n;
    xp += CARE_REWARDS[action].xp * n;
  }
  const scores = {
    Explorer: (rollup.actionCounts.hatch || 0) * 2,
    Athlete: (rollup.actionCounts.play || 0) * 2,
    Scholar: (rollup.actionCounts.checkin || 0) * 1,
    Performer: (rollup.actionCounts.groom || 0) * 1,
    Collector: (rollup.actionCounts.feed || 0) * 1,
  };
  const top = (Object.entries(scores) as [keyof typeof scores, number][]).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  return {
    hunger,
    happiness,
    energy,
    hygiene,
    health,
    streak,
    status,
    stage: growthStage(pet, days.size, now),
    careDays: days.size,
    lastCare: rollup.lastCare,
    lastFed: rollup.lastFed,
    checkedIn: todayActions.has("checkin"),
    fedToday: todayActions.has("feed"),
    playedToday: todayActions.has("play"),
    groomedToday: todayActions.has("groom"),
    boinglets: boinglets + streak * 2,
    xp,
    skills: { scores, focus: top[1] > 0 ? top[0] : ("Explorer" as const) },
  };
}

/** Achievements from rollup — same codes as unlockedAchievements(events). */
export function unlockedAchievementsFromRollup(
  pet: Pet,
  rollup: CareRollup,
  now: number,
): AchievementCode[] {
  const { streak } = stateFromRollup(pet, rollup, now);
  const actions = new Set(
    (Object.entries(rollup.actionCounts) as [Action, number][])
      .filter(([, n]) => n > 0)
      .map(([a]) => a),
  );
  const out: AchievementCode[] = [];
  out.push("first_bounce");
  if (actions.has("checkin")) out.push("kind_hello");
  if (actions.has("feed")) out.push("full_bowl");
  if (actions.has("play")) out.push("playtime");
  if (actions.has("groom")) out.push("fresh_coat");
  if (streak >= 3) out.push("streak_3");
  if (streak >= 7) out.push("streak_7");
  if (rollup.hadBalancedDay) out.push("balanced_day");
  return out;
}
