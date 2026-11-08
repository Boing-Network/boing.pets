import { CARE_REWARDS, type CareEvent } from "./core";

export const CURRENCIES = ["boinglets", "sparkles"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const LISTING_FEE_BPS = 500; // 5% sink on successful sales
export const SINK_OWNER = "boing-pets-sink";

/** Cosmetics-only catalog — no combat power. */
export const CATALOG = [
  {
    id: "hat-ribbon",
    name: "Pasture Ribbon",
    kind: "pet_skin",
    priceBoinglets: 40,
    description: "A soft ribbon for your buddy. Purely cosmetic.",
  },
  {
    id: "hat-antenna",
    name: "Glow Antenna",
    kind: "pet_skin",
    priceBoinglets: 75,
    description: "Twinkly antenna tip. No stats.",
  },
  {
    id: "furn-cushion",
    name: "Bounce Cushion",
    kind: "furniture",
    priceBoinglets: 60,
    description: "A round cushion for future homes.",
  },
  {
    id: "furn-lamp",
    name: "Meadow Lamp",
    kind: "furniture",
    priceBoinglets: 90,
    description: "Warm light for housing (Phase 6).",
  },
  {
    id: "frame-gold",
    name: "Gold Card Frame",
    kind: "profile",
    priceBoinglets: 120,
    description: "Cosmetic profile frame for the pasture card.",
  },
] as const;

export type CatalogItemId = (typeof CATALOG)[number]["id"];

export function catalogItem(id: string) {
  return CATALOG.find((item) => item.id === id) ?? null;
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
