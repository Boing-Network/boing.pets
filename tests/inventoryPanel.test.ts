import { describe, expect, it } from "vitest";
import {
  buildInventoryEntries,
  entriesForTab,
  inventoryConsumable,
  inventoryTabFor,
  inventoryUseArea,
} from "../src/pasture3d/inventoryPanel";

describe("pasture inventory panel", () => {
  it("groups crops, fish, and other goods, and lists recipes with a use action", () => {
    expect(inventoryTabFor("crop-sprout")).toBe("crops");
    expect(inventoryTabFor("fish-ripple")).toBe("fish");
    expect(inventoryTabFor("food-snack")).toBe("items");
    expect(inventoryUseArea("food-snack")).toBe(null);
    expect(inventoryConsumable("food-snack")).toBe("serve");
    expect(inventoryUseArea("hat-ribbon")).toBe("customize");
    expect(inventoryConsumable("hat-ribbon")).toBe(null);
    const entries = buildInventoryEntries([
      { item_id: "crop-sprout", qty: 2 },
      { item_id: "fish-ripple", qty: 1 },
      { item_id: "food-snack", qty: 1 },
      { item_id: "ore-pebble", qty: 3 },
    ]);
    expect(entriesForTab(entries, "crops").map((row) => row.id)).toEqual([
      "crop-sprout",
    ]);
    expect(entriesForTab(entries, "fish").map((row) => row.id)).toEqual([
      "fish-ripple",
    ]);
    const items = entriesForTab(entries, "items");
    expect(items.some((row) => row.id === "food-snack")).toBe(true);
    const snack = items.find((row) => row.id === "food-snack");
    expect(snack?.name).toBe("Corner Snack");
    expect(snack?.consumable).toBe("serve");
    expect(items.some((row) => row.id === "ore-pebble" && row.qty === 3)).toBe(
      true,
    );
    const salad = entriesForTab(entries, "recipes").find(
      (row) => row.id === "recipe-sprout-salad",
    );
    expect(salad?.ready).toBe(true);
    expect(salad?.useArea).toBe("cook");
    expect(salad?.sellable).toBe(false);
    expect(salad?.iconId).toBe("food-sprout-salad");
  });
});
