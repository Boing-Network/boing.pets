import { describe, expect, it } from "vitest";
import { onchainItemByGameId } from "../src/content/onchainItems";
import {
  assertSafeCraftRecipe,
  canCraftRecipe,
  CRAFT_DAILY_CAP,
  CRAFT_RECIPES,
  craftItemName,
  craftRecipeById,
  missingIngredients,
  publicCraftRules,
  type CraftRecipe,
} from "../src/content/crafting";

describe("crafting content", () => {
  it("defines starter recipes from activity resources into catalog items", () => {
    expect(CRAFT_RECIPES.length).toBe(9);
    expect(CRAFT_DAILY_CAP).toBe(10);
    expect(craftRecipeById("craft-iron-pick")?.outputItemId).toBe(
      "tool-pick-iron",
    );
    expect(publicCraftRules().kitchen).toMatch(/Kitchen/);
    for (const recipe of CRAFT_RECIPES) {
      expect(() => assertSafeCraftRecipe(recipe)).not.toThrow();
      expect(recipe.outputItemId.startsWith("food-")).toBe(false);
      expect(recipe.outputItemId.startsWith("pet-")).toBe(false);
      expect(recipe.outputItemId.startsWith("ribbon-")).toBe(false);
      expect(recipe.outputItemId).not.toBe("tool-pick-wood");
      if (recipe.outputItemId !== "crop-forage") {
        expect(
          onchainItemByGameId(recipe.outputItemId) ||
            recipe.outputItemId === "crop-forage",
        ).toBeTruthy();
      }
    }
  });

  it("names reserved and forage items without inventing pet crafts", () => {
    expect(craftItemName("tool-pick-iron")).toBe("Iron Pick");
    expect(craftItemName("crop-forage")).toBe("Foraged Greens");
    expect(craftItemName("tool-pick-wood")).toBe("Wood Pick");
  });

  it("reports whether a player can craft and what is missing", () => {
    const recipe = craftRecipeById("craft-iron-pick")!;
    expect(canCraftRecipe(recipe, { "ore-pebble": 3, "ore-spark": 1 })).toBe(
      true,
    );
    expect(canCraftRecipe(recipe, { "ore-pebble": 2, "ore-spark": 1 })).toBe(
      false,
    );
    expect(missingIngredients(recipe, { "ore-pebble": 1 })).toEqual([
      { itemId: "ore-pebble", qty: 2 },
      { itemId: "ore-spark", qty: 1 },
    ]);
  });

  it("refuses reserved or pet outputs", () => {
    const bad: CraftRecipe = {
      id: "nope",
      name: "Nope",
      description: "",
      inputs: [{ itemId: "ore-pebble", qty: 1 }],
      outputItemId: "tool-pick-wood",
      outputQty: 1,
    };
    expect(() => assertSafeCraftRecipe(bad)).toThrow(/reserved/);
  });
});
