import { describe, expect, it } from "vitest";
import {
  ADVENTURE_DURATIONS,
  ADVENTURE_EXCLUSIVE_ITEMS,
  ADVENTURE_LOCATION_DAILY_CAP,
  ADVENTURE_LOCATIONS,
  ADVENTURE_PITY_CAP,
  ADVENTURE_RARITY_WEIGHTS,
  diminishingFactor,
  mulberry32,
  publicAdventureRates,
  resolveAdventureRewards,
  rollRarity,
  slotsForCompletions,
} from "../src/content/adventures";
import { CURRENCY_LABELS } from "../src/content/currencyLabels";
import { itemDisplayName, itemRarity } from "../src/content/items";
import { isLegendaryRarity, ITEM_RARITIES } from "../src/content/rarities";

describe("idle adventure rates", () => {
  it("covers six locations and five durations", () => {
    expect(ADVENTURE_LOCATIONS).toHaveLength(6);
    expect(ADVENTURE_DURATIONS).toHaveLength(5);
    expect(ADVENTURE_DURATIONS.map((row) => row.id)).toEqual([
      "flash",
      "block",
      "shift",
      "night",
      "marathon",
    ]);
  });

  it("labels Grail and Vaulted, and keeps them tradeable", () => {
    const rates = publicAdventureRates();
    expect(rates.rarities.map((row) => row.id)).toEqual([...ITEM_RARITIES]);
    expect(rates.rarities.find((row) => row.id === "mythic")?.label).toBe(
      "Grail",
    );
    expect(rates.rarities.find((row) => row.id === "iconic")?.label).toBe(
      "Vaulted",
    );
    expect(rates.pityCap).toBe(ADVENTURE_PITY_CAP);
    expect(rates.pityGrants).toBe("legendary");
    expect(rates.noPityFor).toEqual(["mythic", "iconic"]);
    expect(ADVENTURE_EXCLUSIVE_ITEMS["grail-tag"]?.tradeable).toBe(true);
    expect(ADVENTURE_EXCLUSIVE_ITEMS["vaulted-jacket"]?.tradeable).toBe(true);
    expect(itemDisplayName("grail-tag")).toBe("Grail Tag");
    expect(itemDisplayName("vaulted-jacket")).toBe("Vaulted Jacket");
    expect(itemRarity("grail-tag")).toBe("mythic");
    expect(itemRarity("vaulted-jacket")).toBe("iconic");
  });

  it("renames currencies and street items in display only", () => {
    expect(CURRENCY_LABELS.boinglets).toBe("Cred");
    expect(CURRENCY_LABELS.sparkles).toBe("Laces");
    expect(itemDisplayName("fish-ripple")).toBe("Curb Minnow");
    expect(itemDisplayName("food-snack")).toBe("Corner Snack");
  });

  it("simulates the configured odds distribution", () => {
    const trials = 50_000;
    const counts: Record<string, number> = {};
    for (const rarity of ITEM_RARITIES) counts[rarity] = 0;
    const rng = mulberry32(0x51ed);
    for (let i = 0; i < trials; i++) {
      counts[rollRarity(rng, 0).rarity]! += 1;
    }
    const totalWeight = ITEM_RARITIES.reduce(
      (sum, rarity) => sum + ADVENTURE_RARITY_WEIGHTS[rarity],
      0,
    );
    for (const rarity of ITEM_RARITIES) {
      const expected =
        (ADVENTURE_RARITY_WEIGHTS[rarity] / totalWeight) * trials;
      const actual = counts[rarity]!;
      const pad = Math.max(8, expected * 0.35 + 12);
      expect(actual).toBeGreaterThan(expected - pad);
      expect(actual).toBeLessThan(expected + pad);
    }
    expect(counts.mythic).toBeGreaterThan(0);
    expect(counts.iconic).toBeGreaterThan(0);
    expect(counts.common).toBeGreaterThan(counts.legendary);
  });

  it("never grants mythic or iconic from the pity cap", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 2_000; i++) {
      const rolled = rollRarity(rng, ADVENTURE_PITY_CAP);
      expect(rolled.fromPity).toBe(true);
      expect(rolled.rarity).toBe("legendary");
      expect(rolled.rarity).not.toBe("mythic");
      expect(rolled.rarity).not.toBe("iconic");
      expect(isLegendaryRarity(rolled.rarity)).toBe(true);
    }
    const resolved = resolveAdventureRewards({
      rng: mulberry32(99),
      durationScale: 1,
      outcome: "success",
      pityMisses: ADVENTURE_PITY_CAP,
      ownedItemIds: new Set(),
      diminishing: 1,
    });
    const items = resolved.rewards.filter((row) => row.kind === "item");
    expect(items).toHaveLength(1);
    expect(items[0]?.rarity).toBe("legendary");
    expect(items[0]?.gameItemId).not.toBe("grail-tag");
    expect(items[0]?.gameItemId).not.toBe("vaulted-jacket");
  });

  it("converts duplicates into materials and applies diminishing plus the daily cap", () => {
    const resolved = resolveAdventureRewards({
      rng: mulberry32(3),
      durationScale: 1,
      outcome: "success",
      pityMisses: 0,
      ownedItemIds: new Set([
        "loot-pebble",
        "loot-map-scrap",
        "loot-sun-shard",
        "loot-comet-bead",
        "hat-stardust",
        "grail-tag",
        "vaulted-jacket",
      ]),
      diminishing: 1,
    });
    expect(resolved.rewards.some((row) => row.duplicate)).toBe(true);
    expect(
      resolved.rewards.some(
        (row) => row.kind === "material" && row.gameItemId?.startsWith("mat-"),
      ),
    ).toBe(true);
    expect(diminishingFactor(0)).toBe(1);
    expect(diminishingFactor(1)).toBeCloseTo(0.82);
    expect(diminishingFactor(ADVENTURE_LOCATION_DAILY_CAP - 1)).toBeGreaterThan(
      0,
    );
    expect(diminishingFactor(ADVENTURE_LOCATION_DAILY_CAP)).toBe(0);
    expect(slotsForCompletions(0)).toBe(1);
    expect(slotsForCompletions(5)).toBe(2);
    expect(slotsForCompletions(15)).toBe(3);
    expect(slotsForCompletions(40)).toBe(4);
  });
});
