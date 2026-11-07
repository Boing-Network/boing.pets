import { DAY, dayOf, hex32, type Action } from "./core";

export const YARD_ACTIONS = [
  "deploy_nft",
  "mint_nft",
  "stake_nft",
  "unstake_nft",
  "bond",
  "unbond",
  "collect",
  "buy_pen",
  "buy_stand",
  "buy_toy",
  "train_forage",
  "train_greet",
  "train_play",
  "wander",
] as const;
export type YardAction = (typeof YARD_ACTIONS)[number];
export type Building = "pen" | "stand" | "toy";
export const BUILDINGS: Record<Building, { cost: number; daily: number; label: string }> = {
  pen: { cost: 40, daily: 22, label: "Boarding pen" },
  stand: { cost: 70, daily: 30, label: "Snack stand" },
  toy: { cost: 55, daily: 20, label: "Toy cart" },
};
export const BOND_AMOUNT = (10n ** 16n).toString();
export const FIELD_RADIUS = 30;
export const SKILLS = ["forage", "greet", "play"] as const;
export type Skill = (typeof SKILLS)[number];
export type Stage = "hatchling" | "juvenile" | "grown" | "elder";
const ACCRUAL_CAP = 3 * DAY;

export function isYardAction(action: string): action is YardAction {
  return (YARD_ACTIONS as readonly string[]).includes(action);
}

export function buildingOf(action: YardAction): Building | null {
  if (action === "buy_pen") return "pen";
  if (action === "buy_stand") return "stand";
  if (action === "buy_toy") return "toy";
  return null;
}

export function yardSpot(owner: string) {
  const hex = hex32(owner).slice(2);
  const x = parseInt(hex.slice(0, 4), 16) / 65535;
  const z = parseInt(hex.slice(4, 8), 16) / 65535;
  return { x: Math.round((x - 0.5) * 180) / 10, z: Math.round((z - 0.5) * 180) / 10 };
}

export function pasturePlace(owner: string, status: string, staked: boolean) {
  const home = yardSpot(owner);
  if (staked || status === "bouncy") return home;
  if (status === "peckish") return { x: home.x * 0.85, z: home.z * 0.85 };
  if (status === "scruffy") return { x: home.x * 1.2, z: home.z * 1.2 };
  const length = Math.hypot(home.x, home.z) || 1;
  return {
    x: Math.round((home.x / length) * 85) / 10,
    z: Math.round((home.z / length) * 85) / 10,
  };
}

export function evolutionStage(ageMs: number, careEvents: number, skillPoints: number): Stage {
  const score = careEvents + skillPoints + Math.floor(Math.max(0, ageMs) / DAY);
  if (score >= 18) return "elder";
  if (score >= 8) return "grown";
  if (score >= 3) return "juvenile";
  return "hatchling";
}

export function stageScale(stage: Stage) {
  if (stage === "hatchling") return 0.62;
  if (stage === "juvenile") return 0.84;
  if (stage === "elder") return 1.12;
  return 1;
}

export function dailyRate(input: {
  hunger: number;
  happiness: number;
  status: string;
  buildings: readonly Building[];
  nftStaked: boolean;
  bonded: boolean;
  forage?: number;
  greet?: number;
  play?: number;
}) {
  const belly = Math.min(1, Math.max(0, input.hunger / 100));
  const joy = Math.min(1, Math.max(0, input.happiness / 100));
  // A buddy earns a living from being fed and glad. Buildings only help when they have something to work with.
  const forage = Math.min(12, input.forage ?? 0);
  const greet = Math.min(12, input.greet ?? 0);
  const play = Math.min(12, input.play ?? 0);
  let rate = 8 * (0.3 + 0.7 * belly) * (0.4 + 0.6 * joy);
  rate += forage * 0.35 * (0.4 + belly);
  rate += greet * 0.3 * joy;
  if (input.buildings.includes("pen")) rate += input.status === "stray" ? 8 : BUILDINGS.pen.daily;
  if (input.buildings.includes("stand")) rate += BUILDINGS.stand.daily * belly * (1 + forage / 40);
  if (input.buildings.includes("toy")) rate += BUILDINGS.toy.daily * joy * (1 + play / 30);
  if (input.nftStaked) rate *= 1.25;
  if (input.buildings.length && !input.bonded) rate *= 0.9;
  if (input.bonded) rate *= 1.1;
  return Math.max(0, Math.round(rate));
}

export function previewKibble(input: {
  stored: number;
  settledAt: number;
  now: number;
  ratePerDay: number;
}) {
  const elapsed = Math.max(0, Math.min(ACCRUAL_CAP, input.now - input.settledAt));
  const gained = Math.floor((input.ratePerDay * elapsed) / DAY);
  return { kibble: input.stored + gained, gained, settledAt: input.settledAt + elapsed };
}

export function online(seenAt: number | null, now: number) {
  return seenAt !== null && now - seenAt < 60_000;
}

export function careAction(action: string): action is Action {
  return action === "hatch" || action === "feed" || action === "checkin";
}

export { dayOf };
