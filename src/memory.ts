import {
  dayOf,
  DAY,
  type Action,
  type CareEvent,
  type CareRollup,
  type Pet,
  type Personality,
} from "./core";

export type MemoryKind = "episode" | "preference" | "neglect" | "suggestion";

export interface PetMemoryRow {
  id: string;
  owner: string;
  kind: MemoryKind | string;
  payload: string;
  created_at: number;
}

export interface PetMind {
  mood: "content" | "playful" | "lonely" | "curious" | "tired";
  favoriteActivity: Action | "none";
  activityCounts: Record<Action, number>;
  daysSinceCare: number;
  daysSinceFeed: number;
  cues: string[];
  suggestion: string;
}

const ACTIVITY_LABEL: Record<Action, string> = {
  hatch: "hatching day",
  feed: "snack time",
  checkin: "hellos",
  play: "play",
  groom: "grooming",
};

export function activityCounts(events: CareEvent[]): Record<Action, number> {
  const counts: Record<Action, number> = {
    hatch: 0,
    feed: 0,
    checkin: 0,
    play: 0,
    groom: 0,
  };
  for (const e of events) counts[e.action] += 1;
  return counts;
}

export function favoriteActivity(
  counts: Record<Action, number>,
): Action | "none" {
  const ranked = (Object.entries(counts) as [Action, number][]).filter(
    ([action]) => action !== "hatch",
  );
  ranked.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length || ranked[0][1] <= 0) return "none";
  return ranked[0][0];
}

function personalityCue(
  personality: Personality,
  favorite: Action | "none",
): string {
  if (favorite === "play") {
    if (personality === "Adventurous" || personality === "Peppy")
      return "Keeps asking to race toward the Forest path.";
    if (personality === "Lazy" || personality === "Cozy")
      return "Wants short play bursts, then a long nap.";
  }
  if (favorite === "feed") {
    if (personality === "Curious" || personality === "Mischievous")
      return "Curious about Beach snacks and new flavors.";
    return "Lights up at snack time more than anything.";
  }
  if (favorite === "groom") {
    return personality === "Dreamy" || personality === "Friendly"
      ? "Dreams of a fancy grooming salon visit."
      : "Feels braver when freshly groomed.";
  }
  if (favorite === "checkin") {
    return "Cherishes daily hellos — routine is love.";
  }
  switch (personality) {
    case "Adventurous":
      return "Eyes the mountain trail whenever you open the world.";
    case "Lazy":
      return "Would like the cushion catalog more than a hike.";
    case "Curious":
      return "Wants to inspect every glowing pad in town.";
    case "Mischievous":
      return "Plotting a tiny marketplace prank (harmless).";
    case "Friendly":
      return "Hopes to meet plaza guests soon.";
    case "Peppy":
      return "Ready to bounce the moment you say go.";
    case "Dreamy":
      return "Staring at clouds over Tutorial Meadow.";
    default:
      return "Happy just sharing the pasture with you.";
  }
}

export function buildPetMind(
  pet: Pet,
  events: CareEvent[],
  personality: Personality,
  now: number,
): PetMind {
  const valid = events.filter(
    (e) => e.created_at <= now && e.created_at >= pet.created_at,
  );
  const counts = activityCounts(valid);
  const favorite = favoriteActivity(counts);
  const lastCare = Math.max(pet.created_at, ...valid.map((e) => e.created_at));
  const lastFed = Math.max(
    pet.created_at,
    ...valid.filter((e) => e.action === "feed").map((e) => e.created_at),
  );
  const daysSinceCare = Math.max(0, Math.floor((now - lastCare) / DAY));
  const daysSinceFeed = Math.max(0, Math.floor((now - lastFed) / DAY));

  let mood: PetMind["mood"] = "content";
  if (daysSinceCare >= 3) mood = "lonely";
  else if (counts.play >= counts.feed && counts.play > 0) mood = "playful";
  else if (personality === "Curious" || personality === "Adventurous")
    mood = "curious";
  else if (counts.play === 0 && dayOf(now) - dayOf(pet.created_at) >= 2)
    mood = "tired";

  const cues: string[] = [];
  if (daysSinceFeed >= 2)
    cues.push("Belly rumbles — a feed would mean the world.");
  if (daysSinceCare >= 1 && daysSinceCare < 3)
    cues.push("Missed yesterday's bounce a little.");
  if (favorite !== "none")
    cues.push(`Favorite ritual lately: ${ACTIVITY_LABEL[favorite]}.`);
  cues.push(personalityCue(personality, favorite));

  let suggestion = "A short hello keeps the bond warm.";
  if (daysSinceFeed >= 2) suggestion = "Please feed me before we explore.";
  else if (favorite === "play" || mood === "playful")
    suggestion = "Can we play, then visit the lake pads in Starter Town?";
  else if (favorite === "groom")
    suggestion = "A groom would make me parade-ready for the plaza.";
  else if (mood === "curious")
    suggestion = "Let's peek at the Marketplace board together.";
  else if (mood === "lonely")
    suggestion = "Just checking in would help me feel found again.";

  return {
    mood,
    favoriteActivity: favorite,
    activityCounts: counts,
    daysSinceCare,
    daysSinceFeed,
    cues: cues.slice(0, 4),
    suggestion,
  };
}

export function episodePayload(action: Action, at: number): string {
  return JSON.stringify({
    action,
    at,
    note: `Remembered ${ACTIVITY_LABEL[action]}`,
  });
}

/** Same mind cues as buildPetMind, driven by a care rollup. */
export function buildPetMindFromRollup(
  pet: Pet,
  rollup: CareRollup,
  personality: Personality,
  now: number,
): PetMind {
  const counts = { ...rollup.actionCounts };
  const favorite = favoriteActivity(counts);
  const lastCare = Math.max(pet.created_at, rollup.lastCare);
  const lastFed = Math.max(pet.created_at, rollup.lastFed);
  const daysSinceCare = Math.max(0, Math.floor((now - lastCare) / DAY));
  const daysSinceFeed = Math.max(0, Math.floor((now - lastFed) / DAY));

  let mood: PetMind["mood"] = "content";
  if (daysSinceCare >= 3) mood = "lonely";
  else if (counts.play >= counts.feed && counts.play > 0) mood = "playful";
  else if (personality === "Curious" || personality === "Adventurous")
    mood = "curious";
  else if (counts.play === 0 && dayOf(now) - dayOf(pet.created_at) >= 2)
    mood = "tired";

  const cues: string[] = [];
  if (daysSinceFeed >= 2)
    cues.push("Belly rumbles — a feed would mean the world.");
  if (daysSinceCare >= 1 && daysSinceCare < 3)
    cues.push("Missed yesterday's bounce a little.");
  if (favorite !== "none")
    cues.push(`Favorite ritual lately: ${ACTIVITY_LABEL[favorite]}.`);
  cues.push(personalityCue(personality, favorite));

  let suggestion = "A short hello keeps the bond warm.";
  if (daysSinceFeed >= 2) suggestion = "Please feed me before we explore.";
  else if (favorite === "play" || mood === "playful")
    suggestion = "Can we play, then visit the lake pads in Starter Town?";
  else if (favorite === "groom")
    suggestion = "A groom would make me parade-ready for the plaza.";
  else if (mood === "curious")
    suggestion = "Let's peek at the Marketplace board together.";
  else if (mood === "lonely")
    suggestion = "Just checking in would help me feel found again.";

  return {
    mood,
    favoriteActivity: favorite,
    activityCounts: counts,
    daysSinceCare,
    daysSinceFeed,
    cues: cues.slice(0, 4),
    suggestion,
  };
}
