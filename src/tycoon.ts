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
] as const;
export type YardAction = (typeof YARD_ACTIONS)[number];
export type Building = "pen" | "stand" | "toy";
export const BUILDINGS: Record<Building, { cost: number; daily: number; label: string }> = {
  pen: { cost: 40, daily: 48, label: "Boarding pen" },
  stand: { cost: 70, daily: 36, label: "Snack stand" },
  toy: { cost: 55, daily: 24, label: "Toy cart" },
};
export const BOND_AMOUNT = (10n ** 16n).toString();
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

export function dailyRate(input: {
  status: string;
  buildings: readonly Building[];
  nftStaked: boolean;
  bonded: boolean;
}) {
  let rate = 12;
  for (const kind of input.buildings) rate += BUILDINGS[kind].daily;
  if (input.nftStaked) rate *= 2;
  if (input.bonded) rate = Math.round(rate * 1.5);
  const care =
    input.status === "stray" ? 0.15 : input.status === "scruffy" ? 0.45 : input.status === "peckish" ? 0.8 : 1;
  return Math.max(0, Math.round(rate * care));
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
