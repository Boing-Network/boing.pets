import { describe, expect, it } from "vitest";
import {
  CRAFT_RECIPES,
  canCraftRecipe,
  craftRecipeById,
} from "../src/content/crafting";
import { RECIPES } from "../src/content/cooking";
import { FISH, pickFish } from "../src/content/fishing";
import { CROPS } from "../src/content/gardening";
import { pickOre, pickaxeTier } from "../src/content/mining";
import { TREASURES, pickTreasure } from "../src/content/treasure";
import { DROP_TABLE } from "../src/drops";
import { isSellableItem } from "../src/market";
import {
  onchainItemByGameId,
  ONCHAIN_RESERVED_ITEM_IDS,
} from "../src/content/onchainItems";
import { itemRarity } from "../src/content/items";

describe("item expansion recipes and drops", () => {
  it("adds craft recipes that mix existing and new resources", () => {
    const lantern = craftRecipeById("craft-glow-lantern");
    expect(lantern?.outputItemId).toBe("furn-lantern");
    expect(lantern?.inputs.map((row) => row.itemId)).toEqual([
      "loot-sun-shard",
      "ore-emberite",
      "crop-honeyroot",
    ]);
    const pick = craftRecipeById("craft-aether-pick");
    expect(pick?.outputItemId).toBe("tool-pick-aether");
    expect(
      canCraftRecipe(pick!, {
        "tool-pick-crystal": 1,
        "ore-aetherite": 2,
        "loot-comet-bead": 1,
      }),
    ).toBe(true);
    expect(CRAFT_RECIPES.some((row) => row.id === "craft-leaf-cap")).toBe(true);
    expect(CRAFT_RECIPES.some((row) => row.id === "craft-comet-pin")).toBe(
      true,
    );
  });

  it("adds kitchen recipes for honeyroot tart and starlit broth", () => {
    expect(RECIPES.some((row) => row.foodId === "food-honey-tart")).toBe(true);
    expect(RECIPES.some((row) => row.foodId === "food-starlit")).toBe(true);
  });

  it("keeps rarer activity rolls less common and gates epic ore", () => {
    expect(pickaxeTier(["tool-pick-aether"])).toBe(4);
    const woodRolls = Array.from(
      { length: 80 },
      (_, i) => pickOre(`wood-${i}`, 1).id,
    );
    expect(woodRolls).not.toContain("ore-crystal");
    expect(woodRolls).not.toContain("ore-emberite");
    expect(woodRolls).not.toContain("ore-aetherite");
    const ironRolls = Array.from(
      { length: 80 },
      (_, i) => pickOre(`iron-${i}`, 2).id,
    );
    expect(ironRolls).not.toContain("ore-aetherite");

    const fishWeights = Object.fromEntries(
      FISH.map((row) => [row.id, row.weight]),
    );
    expect(fishWeights["fish-ripple"]).toBeGreaterThan(
      fishWeights["fish-starfin"]!,
    );
    const lootWeights = Object.fromEntries(
      TREASURES.map((row) => [row.id, row.weight]),
    );
    expect(lootWeights["loot-pebble"]).toBeGreaterThan(
      lootWeights["loot-comet-bead"]!,
    );
    expect(itemRarity("crop-starglider")).toBe("epic");
    expect(CROPS.some((row) => row.id === "crop-honeyroot")).toBe(true);
    // Deterministic helpers still return a defined row.
    expect(pickFish("seed-1").id.startsWith("fish-")).toBe(true);
    expect(pickTreasure("seed-1").id.startsWith("loot-")).toBe(true);
  });

  it("weights new cosmetic drops by rarity and keeps the table at 1000", () => {
    expect(DROP_TABLE.reduce((sum, row) => sum + row.weight, 0)).toBe(1000);
    const byId = Object.fromEntries(
      DROP_TABLE.map((row) => [row.gameItemId, row]),
    );
    expect(byId["hat-leaf"]?.tier).toBe("uncommon");
    expect(byId["furn-lantern"]?.tier).toBe("rare");
    expect(byId["hat-comet"]?.tier).toBe("epic");
    expect(byId["hat-stardust"]?.tier).toBe("legendary");
    expect(byId["hat-ribbon"]!.weight).toBeGreaterThan(
      byId["hat-stardust"]!.weight,
    );
    expect(byId["hat-comet"]!.weight).toBeGreaterThan(
      byId["frame-aurora"]!.weight,
    );
  });

  it("maps new stackables on-chain and keeps reserved ids unsaleable", () => {
    expect(onchainItemByGameId("ore-emberite")?.itemId).toBe(4);
    expect(onchainItemByGameId("ore-aetherite")?.itemId).toBe(5);
    expect(onchainItemByGameId("fish-starfin")?.itemId).toBe(14);
    expect(onchainItemByGameId("tool-pick-aether")?.itemId).toBe(63);
    expect(onchainItemByGameId("hat-comet")?.itemId).toBe(79);
    for (const reserved of ONCHAIN_RESERVED_ITEM_IDS) {
      expect(onchainItemByGameId(reserved.gameItemId)).toBeUndefined();
      expect(isSellableItem(reserved.gameItemId)).toBe(false);
    }
  });
});
