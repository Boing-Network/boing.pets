import { CARE_REWARDS, dayOf, type CareEvent } from "./core";

export const CURRENCIES = ["boinglets", "sparkles"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const LISTING_FEE_BPS = 500; // 5% sink on successful sales
export const SINK_OWNER = "boing-pets-sink";
/** Testnet faucet — not a payment product. */
export const SPARKLES_DAILY = 10;

/** Cosmetics-only catalog — no combat power. */
export const CATALOG = [
  {
    id: "hat-ribbon",
    name: "Street Ribbon",
    kind: "pet_skin",
    priceBoinglets: 40,
    priceSparkles: 0,
    description: "A soft ribbon for your buddy. Purely cosmetic.",
  },
  {
    id: "hat-antenna",
    name: "Glow Antenna",
    kind: "pet_skin",
    priceBoinglets: 75,
    priceSparkles: 0,
    description: "Twinkly antenna tip. No stats.",
  },
  {
    id: "furn-cushion",
    name: "Stoop Cushion",
    kind: "furniture",
    priceBoinglets: 60,
    priceSparkles: 0,
    description: "A round cushion for your home plot.",
  },
  {
    id: "furn-lamp",
    name: "Alley Lamp",
    kind: "furniture",
    priceBoinglets: 90,
    priceSparkles: 0,
    description: "Warm light for your cottage grid.",
  },
  {
    id: "frame-gold",
    name: "Gold Card Frame",
    kind: "profile",
    priceBoinglets: 120,
    priceSparkles: 0,
    description: "Cosmetic profile frame for the pasture card.",
  },
  {
    id: "hat-stardust",
    name: "Neon Halo",
    kind: "pet_skin",
    priceBoinglets: 0,
    priceSparkles: 8,
    description: "Premium testnet halo. Cosmetics only — no power.",
  },
  {
    id: "frame-aurora",
    name: "Night Frame",
    kind: "profile",
    priceBoinglets: 0,
    priceSparkles: 12,
    description: "Sparkles-only profile frame for the pasture card.",
  },
  {
    id: "tool-pick-iron",
    name: "Iron Pick",
    kind: "tool",
    priceBoinglets: 80,
    priceSparkles: 0,
    description:
      "Tier-2 pickaxe for mining rarer veins. Cosmetic tool progression.",
  },
  {
    id: "tool-pick-crystal",
    name: "Crystal Pick",
    kind: "tool",
    priceBoinglets: 180,
    priceSparkles: 0,
    description: "Tier-3 pickaxe. Unlocks the best mining rolls.",
  },
  {
    id: "hat-leaf",
    name: "Fern Cap",
    kind: "pet_skin",
    priceBoinglets: 50,
    priceSparkles: 0,
    description: "A leafy cap for your buddy. Purely cosmetic.",
  },
  {
    id: "furn-lantern",
    name: "Glow Lantern",
    kind: "furniture",
    priceBoinglets: 110,
    priceSparkles: 0,
    description: "A warm lantern for your cottage grid.",
  },
  {
    id: "tool-pick-aether",
    name: "Aether Pick",
    kind: "tool",
    priceBoinglets: 320,
    priceSparkles: 0,
    description:
      "Tier-4 pickaxe for the rarest mining rolls. Cosmetic tool progression.",
  },
  {
    id: "hat-comet",
    name: "Comet Pin",
    kind: "pet_skin",
    priceBoinglets: 0,
    priceSparkles: 10,
    description: "An epic testnet pin. Cosmetics only - no power.",
  },
] as const;

export type CatalogItem = (typeof CATALOG)[number];
export type CatalogItemId = CatalogItem["id"];

export function catalogItem(id: string) {
  return CATALOG.find((item) => item.id === id) ?? null;
}

export function catalogPrice(item: CatalogItem): {
  currency: Currency;
  amount: number;
} {
  if (item.priceSparkles > 0)
    return { currency: "sparkles", amount: item.priceSparkles };
  return { currency: "boinglets", amount: item.priceBoinglets };
}

export function sparklesDayKey(now: number): string {
  return `d:${dayOf(now)}`;
}

/** Lifetime soft-currency earn from verified care events (same as Phase 1 derivation). */
export function careEarnings(events: CareEvent[]): number {
  return events.reduce((sum, e) => sum + CARE_REWARDS[e.action].boinglets, 0);
}

export function listingFee(price: number): number {
  return Math.max(1, Math.floor((price * LISTING_FEE_BPS) / 10_000));
}

export function netSellerProceeds(price: number): number {
  return Math.max(0, price - listingFee(price));
}

export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === "string" &&
    (CURRENCIES as readonly string[]).includes(value)
  );
}
