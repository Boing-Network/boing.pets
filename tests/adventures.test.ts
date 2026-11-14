import { describe, expect, it } from "vitest";
import {
  ADVENTURE_DURATIONS,
  ADVENTURE_EXCLUSIVE_ITEMS,
  ADVENTURE_LOCATION_DAILY_CAP,
  ADVENTURE_LOCATIONS,
  ADVENTURE_MYTHIC_CEILING_WEIGHT,
  ADVENTURE_ICONIC_CEILING_WEIGHT,
  ADVENTURE_PITY_CAP,
  ADVENTURE_RARITY_WEIGHTS,
  ADVENTURE_WEIGHT_TOTAL,
  consolationCred,
  diminishingFactor,
  effectiveRarityWeights,
  estimateAdventure,
  locationAvailability,
  mulberry32,
  outcomeChances,
  publicAdventureRates,
  resolveAdventureRewards,
  rollRarity,
  slotsForCompletions,
  snapshotStyleLuck,
  STYLE_LUCK_MULTIPLIER_CAP,
  styleLuckMultiplierFromPoints,
  weightsToChances,
} from "../src/content/adventures";
import { CURRENCY_LABELS } from "../src/content/currencyLabels";
import { itemDisplayName, itemRarity } from "../src/content/items";
import { isLegendaryRarity, ITEM_RARITIES } from "../src/content/rarities";

describe("idle adventure rates", () => {
  it("covers six themed locations and five spec durations", () => {
    expect(ADVENTURE_LOCATIONS.map((row) => row.id)).toEqual([
      "night-market",
      "rooftop-sessions",
      "underground-show",
      "designer-district",
      "the-lost-drop",
      "worldwide-pop-up",
    ]);
    expect(ADVENTURE_DURATIONS.map((row) => row.minutes)).toEqual([
      45, 180, 480, 1_440, 4_320,
    ]);
    expect(ADVENTURE_LOCATIONS.every((row) => row.theme.length > 0)).toBe(true);
  });

  it("uses exact per-1,000,000 base odds from the spec", () => {
    const rates = publicAdventureRates();
    expect(ADVENTURE_WEIGHT_TOTAL).toBe(1_000_000);
    expect(ADVENTURE_RARITY_WEIGHTS).toEqual({
      common: 650_000,
      uncommon: 220_000,
      rare: 90_000,
      epic: 30_000,
      legendary: 8_000,
      mythic: 1_900,
      iconic: 100,
    });
    expect(
      ITEM_RARITIES.reduce((sum, id) => sum + ADVENTURE_RARITY_WEIGHTS[id], 0),
    ).toBe(ADVENTURE_WEIGHT_TOTAL);
    expect(rates.rarities.find((row) => row.id === "iconic")?.chance).toBe(
      0.0001,
    );
    expect(rates.rarities.find((row) => row.id === "mythic")?.chance).toBe(
      0.0019,
    );
    expect(rates.diminishing.dailyCap).toBe(ADVENTURE_LOCATION_DAILY_CAP);
    expect(rates.note).toMatch(/Dispatch station/);
  });

  it("labels Grail and Vaulted, and keeps them tradeable", () => {
    const rates = publicAdventureRates();
    expect(rates.rarities.find((row) => row.id === "mythic")?.label).toBe(
      "Grail",
    );
    expect(rates.rarities.find((row) => row.id === "iconic")?.label).toBe(
      "Vaulted",
    );
    expect(rates.pityGrants).toBe("legendary");
    expect(rates.noPityFor).toEqual(["mythic", "iconic"]);
    expect(ADVENTURE_EXCLUSIVE_ITEMS["grail-tag"]?.tradeable).toBe(true);
    expect(ADVENTURE_EXCLUSIVE_ITEMS["vaulted-jacket"]?.tradeable).toBe(true);
    expect(itemDisplayName("grail-tag")).toBe("Grail Tag");
    expect(itemRarity("grail-tag")).toBe("mythic");
  });

  it("renames currencies in display only", () => {
    expect(CURRENCY_LABELS.boinglets).toBe("Cred");
    expect(CURRENCY_LABELS.sparkles).toBe("Laces");
  });

  it("simulates the configured odds distribution within tolerance", () => {
    const trials = 200_000;
    const counts: Record<string, number> = {};
    for (const rarity of ITEM_RARITIES) counts[rarity] = 0;
    const rng = mulberry32(0x51ed);
    for (let i = 0; i < trials; i++) {
      counts[rollRarity(rng, 0).rarity]! += 1;
    }
    for (const rarity of ITEM_RARITIES) {
      const expected =
        (ADVENTURE_RARITY_WEIGHTS[rarity] / ADVENTURE_WEIGHT_TOTAL) * trials;
      const actual = counts[rarity]!;
      const pad = Math.max(12, expected * 0.2 + 16);
      expect(actual).toBeGreaterThan(expected - pad);
      expect(actual).toBeLessThan(expected + pad);
    }
    expect(counts.mythic).toBeGreaterThan(0);
    expect(counts.iconic).toBeGreaterThan(0);
  });

  it("keeps Mythic and Iconic under the defined ceilings at Style Luck cap", () => {
    const { multiplier } = styleLuckMultiplierFromPoints(10_000);
    expect(multiplier).toBe(STYLE_LUCK_MULTIPLIER_CAP);
    const weights = effectiveRarityWeights({
      durationId: "longform",
      luckMultiplier: multiplier,
      adventureBonus: 1.15 * 1.12 * 1.05,
      sets: [
        "sneakerhead",
        "nightlife",
        "designer",
        "graffiti",
        "complete-collection",
      ],
      locationId: "designer-district",
    });
    expect(weights.mythic).toBeLessThanOrEqual(ADVENTURE_MYTHIC_CEILING_WEIGHT);
    expect(weights.iconic).toBeLessThanOrEqual(ADVENTURE_ICONIC_CEILING_WEIGHT);
    const chances = weightsToChances(weights);
    expect(chances.mythic).toBeLessThanOrEqual(0.0038);
    expect(chances.iconic).toBeLessThanOrEqual(0.0002);
    const rng = mulberry32(99);
    let mythic = 0;
    let iconic = 0;
    const trials = 80_000;
    for (let i = 0; i < trials; i++) {
      const rarity = rollRarity(rng, 0, weights).rarity;
      if (rarity === "mythic") mythic += 1;
      if (rarity === "iconic") iconic += 1;
    }
    expect(mythic / trials).toBeLessThan(0.005);
    expect(iconic / trials).toBeLessThan(0.0008);
  });

  it("never grants mythic or iconic from the pity cap", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 2_000; i++) {
      const rolled = rollRarity(rng, ADVENTURE_PITY_CAP);
      expect(rolled.fromPity).toBe(true);
      expect(rolled.rarity).toBe("legendary");
      expect(isLegendaryRarity(rolled.rarity)).toBe(true);
    }
    const resolved = resolveAdventureRewards({
      rng: mulberry32(99),
      durationScale: 1,
      durationId: "session",
      locationId: "night-market",
      outcome: "success",
      pityMisses: ADVENTURE_PITY_CAP,
      ownedItemIds: new Set(),
      diminishing: 1,
    });
    const items = resolved.rewards.filter((row) => row.kind === "item");
    expect(items[0]?.rarity).toBe("legendary");
    expect(items[0]?.gameItemId).not.toBe("grail-tag");
    expect(items[0]?.gameItemId).not.toBe("vaulted-jacket");
  });

  it("does not make longer trips harsher on failure", () => {
    const quick = outcomeChances({ durationId: "quick" });
    const longform = outcomeChances({ durationId: "longform" });
    const daylong = outcomeChances({ durationId: "daylong" });
    expect(quick.fail).toBeLessThan(longform.fail);
    expect(daylong.fail).toBeCloseTo(longform.fail, 5);
    expect(consolationCred(6.5)).toBeGreaterThan(consolationCred(0.55));
  });

  it("locks The Lost Drop until enough runs are complete", () => {
    expect(
      locationAvailability("the-lost-drop", { completions: 0 }).available,
    ).toBe(false);
    expect(
      locationAvailability("the-lost-drop", { completions: 5 }).available,
    ).toBe(true);
    expect(
      locationAvailability("the-lost-drop", { completions: 5 }).fullTable,
    ).toBe(false);
    expect(
      locationAvailability("the-lost-drop", { completions: 15 }).fullTable,
    ).toBe(true);
  });

  it("returns an estimated outcome preview with Style Luck breakdown", () => {
    const snapshot = snapshotStyleLuck({
      equippedIds: ["hat-stardust", "frame-aurora"],
      ownedItemIds: [
        "hat-stardust",
        "frame-aurora",
        "shoe-runner",
        "shoe-night",
        "acc-chain",
        "jewel-hoop",
        "jacket-studio",
        "acc-luxury-clip",
      ],
      stage: "adult",
      xp: 400,
    });
    expect(snapshot.sets).toEqual(
      expect.arrayContaining([
        "sneakerhead",
        "nightlife",
        "designer",
        "graffiti",
        "complete-collection",
      ]),
    );
    const preview = estimateAdventure({
      locationId: "night-market",
      durationId: "overnight",
      snapshot,
      completions: 0,
      priorCompletesToday: 1,
    });
    expect(preview.available).toBe(true);
    expect(preview.outcomes.success).toBeGreaterThan(0.4);
    expect(preview.styleLuck.multiplier).toBeGreaterThan(1);
    expect(preview.styleLuck.cap).toBe(STYLE_LUCK_MULTIPLIER_CAP);
    expect(preview.diminishing).toBeCloseTo(0.82);
    expect(preview.rarities).toHaveLength(7);
  });

  it("converts duplicates into materials and keeps the daily cap", () => {
    const resolved = resolveAdventureRewards({
      rng: mulberry32(3),
      durationScale: 1,
      locationId: "night-market",
      durationId: "session",
      outcome: "success",
      pityMisses: 0,
      ownedItemIds: new Set([
        "acc-chain",
        "hat-beanie",
        "hat-ribbon",
        "hat-antenna",
        "jewel-hoop",
        "hat-stardust",
        "grail-tag",
      ]),
      diminishing: 1,
    });
    expect(resolved.rewards.some((row) => row.duplicate)).toBe(true);
    expect(diminishingFactor(ADVENTURE_LOCATION_DAILY_CAP)).toBe(0);
    expect(slotsForCompletions(40)).toBe(4);
  });
});
