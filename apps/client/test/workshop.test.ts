import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ItemSlug,
  RECIPES,
  itemDef,
  type InventoryEntry,
} from "@boing-pets/contract";
import {
  RECIPE_GROUPS,
  ingredientText,
  madeItems,
  materialRows,
  recipeRows,
  useAction,
} from "../src/hud/workshop";

function bag(counts: Partial<Record<ItemSlug, number>>): InventoryEntry[] {
  return Object.entries(counts).map(([slug, count]) => ({
    slug: slug as ItemSlug,
    count: count ?? 0,
    minted: 0,
    nextSpoilTick: null,
  }));
}

test("materials list every resource, found or not, with where it grows", () => {
  const rows = materialRows(bag({ [ItemSlug.CLOVER]: 4 }));
  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.find((row) => row.slug === ItemSlug.CLOVER),
    { slug: ItemSlug.CLOVER, name: "Clover", count: 4, sources: ["meadow"] },
  );
  const crystal = rows.find((row) => row.slug === ItemSlug.CRYSTAL_SHARD);
  assert.equal(crystal?.count, 0);
  assert.deepEqual(crystal?.sources, ["ridge", "crags"]);
  for (const row of rows) assert.ok(row.sources.length > 0, row.slug);
});

test("the recipe book shows what is short and floats what is ready", () => {
  const empty = recipeRows([]);
  assert.equal(empty.length, RECIPES.length);
  assert.ok(empty.every((row) => !row.ready && row.makes === 0));
  // With nothing ready, the book keeps its own order.
  assert.deepEqual(
    empty.map((row) => row.output),
    RECIPES.map((recipe) => recipe.output),
  );

  const rows = recipeRows(
    bag({
      [ItemSlug.THORNBERRY]: 5,
      [ItemSlug.GLOWMOSS]: 2,
      [ItemSlug.CLOVER]: 1,
      [ItemSlug.POTION_MENDING]: 3,
    }),
  );
  const mending = rows[0]!;
  assert.equal(mending.output, ItemSlug.POTION_MENDING);
  assert.equal(mending.ready, true);
  assert.equal(mending.makes, 2);
  assert.equal(mending.owned, 3);
  assert.deepEqual(mending.inputs.map(ingredientText), [
    "2/2 Thornberry",
    "1/1 Glowmoss",
  ]);
  const rations = rows.find((row) => row.output === ItemSlug.RATIONS)!;
  assert.equal(rations.ready, false);
  assert.deepEqual(rations.inputs.map(ingredientText), [
    "1/2 Clover",
    "2/2 Thornberry",
  ]);
});

test("every recipe lands in a group the workshop shows", () => {
  const groups = new Set(RECIPE_GROUPS.map((group) => group.id));
  const rows = recipeRows([]);
  for (const row of rows) assert.ok(groups.has(row.group), row.output);
  const groupOf = (slug: ItemSlug) =>
    rows.find((row) => row.output === slug)?.group;
  assert.equal(groupOf(ItemSlug.TONIC_MIGHT), "tonics");
  assert.equal(groupOf(ItemSlug.SEED_BUNDLE), "tools");
  assert.equal(groupOf(ItemSlug.POTION_CALM), "tools");
  assert.equal(groupOf(ItemSlug.HEARTY_STEW), "remedies");
  assert.equal(groupOf(ItemSlug.POTION_VITALITY), "remedies");
});

test("raw materials are not offered for use; made things are", () => {
  const made = madeItems(
    bag({ [ItemSlug.CLOVER]: 3, [ItemSlug.HEARTY_STEW]: 1 }),
  );
  assert.deepEqual(
    made.map((entry) => entry.slug),
    [ItemSlug.HEARTY_STEW],
  );
});

test("use buttons name their target and wait for one", () => {
  const none = { territoryName: null, creatureName: null, hasLineage: false };
  const all = {
    territoryName: "Meadow",
    creatureName: "Ada",
    hasLineage: true,
  };
  const stew = itemDef(ItemSlug.HEARTY_STEW)!;
  assert.deepEqual(useAction(stew, none), {
    label: "Give to a creature",
    ready: false,
    hint: "Select a creature first.",
  });
  assert.equal(useAction(stew, all).label, "Give to Ada");
  assert.equal(useAction(stew, all).ready, true);
  assert.equal(
    useAction(itemDef(ItemSlug.SEED_BUNDLE)!, all).label,
    "Use in Meadow",
  );
  assert.equal(
    useAction(itemDef(ItemSlug.POTION_VITALITY)!, all).label,
    "Use on Ada's line",
  );
  assert.equal(
    useAction(itemDef(ItemSlug.POTION_VITALITY)!, none).ready,
    false,
  );
});
