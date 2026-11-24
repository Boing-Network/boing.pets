/**
 * What the workshop shows, worked out from the bag: materials on hand, each
 * recipe with what it still needs, and where missing materials come from.
 * Pure, so the rules are tested without rendering.
 */
import {
  GATHER_SOURCES,
  ITEM_CATALOG,
  ItemCategory,
  RECIPES,
  itemDef,
  type InventoryEntry,
  type ItemDef,
  type ItemSlug,
} from "@boing-pets/contract";

export type MaterialRow = {
  slug: ItemSlug;
  name: string;
  count: number;
  /** Territory slugs it grows in. */
  sources: readonly string[];
};

export type RecipeGroup = "tools" | "remedies" | "tonics";

export type RecipeRow = {
  output: ItemSlug;
  name: string;
  description: string;
  group: RecipeGroup;
  inputs: { slug: ItemSlug; name: string; need: number; have: number }[];
  /** Everything needed is in the bag. */
  ready: boolean;
  /** How many could be made right now. */
  makes: number;
  /** Already made and waiting in the bag. */
  owned: number;
};

export const RECIPE_GROUPS: readonly { id: RecipeGroup; title: string }[] = [
  { id: "remedies", title: "Food and potions" },
  { id: "tools", title: "For a territory" },
  { id: "tonics", title: "Tonics" },
];

function nameOf(slug: string): string {
  return itemDef(slug)?.displayName ?? slug;
}

function countsOf(items: readonly InventoryEntry[]): Map<string, number> {
  return new Map(items.map((entry) => [entry.slug, entry.count]));
}

function groupOf(def: ItemDef | undefined): RecipeGroup {
  if (def?.category === ItemCategory.ENHANCEMENT) return "tonics";
  if (def?.target === "TERRITORY") return "tools";
  return "remedies";
}

/** Every raw material, in catalog order, including the ones not yet found. */
export function materialRows(items: readonly InventoryEntry[]): MaterialRow[] {
  const counts = countsOf(items);
  return ITEM_CATALOG.filter(
    (def) => def.category === ItemCategory.RESOURCE,
  ).map((def) => ({
    slug: def.slug,
    name: def.displayName,
    count: counts.get(def.slug) ?? 0,
    sources:
      GATHER_SOURCES.find((source) => source.resource === def.slug)
        ?.territorySlugs ?? [],
  }));
}

/** The recipe book against the bag. Recipes that can be made come first. */
export function recipeRows(items: readonly InventoryEntry[]): RecipeRow[] {
  const counts = countsOf(items);
  const rows = RECIPES.map((recipe): RecipeRow => {
    const def = itemDef(recipe.output);
    const inputs = recipe.inputs.map((input) => ({
      slug: input.slug,
      name: nameOf(input.slug),
      need: input.count,
      have: counts.get(input.slug) ?? 0,
    }));
    const makes = Math.min(
      ...inputs.map((input) => Math.floor(input.have / input.need)),
    );
    return {
      output: recipe.output,
      name: nameOf(recipe.output),
      description: def?.description ?? "",
      group: groupOf(def),
      inputs,
      ready: makes > 0,
      makes,
      owned: counts.get(recipe.output) ?? 0,
    };
  });
  // Stable: ready recipes rise, the book's own order otherwise holds.
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) => Number(b.row.ready) - Number(a.row.ready) || a.index - b.index,
    )
    .map(({ row }) => row);
}

/** "2/3 Clover" for one ingredient. */
export function ingredientText(input: RecipeRow["inputs"][number]): string {
  return `${Math.min(input.have, input.need)}/${input.need} ${input.name}`;
}

/** Things in the bag that are made, not raw (what "use" and "give" act on). */
export function madeItems(items: readonly InventoryEntry[]): InventoryEntry[] {
  return items.filter(
    (entry) => itemDef(entry.slug)?.category !== ItemCategory.RESOURCE,
  );
}

/** Label for an item's use button, and whether a target is still needed. */
export function useAction(
  def: ItemDef,
  targets: {
    territoryName: string | null;
    creatureName: string | null;
    hasLineage: boolean;
  },
): { label: string; ready: boolean; hint: string } {
  switch (def.target) {
    case "TERRITORY":
      return {
        label: targets.territoryName
          ? `Use in ${targets.territoryName}`
          : "Use in a territory",
        ready: targets.territoryName != null,
        hint: "Choose a territory above.",
      };
    case "CREATURE":
      return {
        label: targets.creatureName
          ? `Give to ${targets.creatureName}`
          : "Give to a creature",
        ready: targets.creatureName != null,
        hint: "Select a creature first.",
      };
    case "LINEAGE":
      return {
        label: targets.creatureName
          ? `Use on ${targets.creatureName}'s line`
          : "Use on a lineage",
        ready: targets.hasLineage,
        hint: "Select a creature of that lineage first.",
      };
    default:
      return { label: "Use", ready: false, hint: "" };
  }
}
