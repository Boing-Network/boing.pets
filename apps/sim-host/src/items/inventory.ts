/**
 * Pure inventory arithmetic over lots. No I/O, no wall clock: spoilage is by
 * sim tick so a paused world does not rot anyone's bag.
 */
import {
  ITEM_CATALOG,
  itemDef,
  recipeFor,
  type InventoryEntry,
  type ItemSlug,
} from "@boing-pets/contract";
import type { InventoryLotRow } from "./types";

export function lotLive(lot: InventoryLotRow, tick: number): boolean {
  return (
    lot.remaining > 0 && (lot.spoilsAtTick == null || tick < lot.spoilsAtTick)
  );
}

/** Spoil tick for an item gained at `tick` (null never spoils). */
export function spoilTick(
  slug: string,
  tick: number,
  ticksPerDay: number,
): number | null {
  const def = itemDef(slug);
  if (def == null || def.spoilDays == null) return null;
  return tick + def.spoilDays * ticksPerDay;
}

/** Which lots count: every lot, only on-chain (minted) ones, or only off-chain. */
export type MintFilter = "any" | "minted" | "unminted";

export function lotMatches(lot: InventoryLotRow, which: MintFilter): boolean {
  if (which === "any") return true;
  return (lot.minted === true) === (which === "minted");
}

export function balanceOf(
  lots: readonly InventoryLotRow[],
  accountId: string,
  slug: string,
  tick: number,
  which: MintFilter = "any",
): number {
  let total = 0;
  for (const lot of lots) {
    if (lot.accountId !== accountId || lot.itemSlug !== slug) continue;
    if (!lotMatches(lot, which)) continue;
    if (lotLive(lot, tick)) total += lot.remaining;
  }
  return total;
}

/** Every live unit per slug for one account, filtered by mint state. */
export function bagUnits(
  lots: readonly InventoryLotRow[],
  accountId: string,
  tick: number,
  which: MintFilter = "any",
): Map<ItemSlug, number> {
  const out = new Map<ItemSlug, number>();
  for (const lot of lots) {
    if (lot.accountId !== accountId || !lotMatches(lot, which)) continue;
    if (!lotLive(lot, tick)) continue;
    const slug = lot.itemSlug as ItemSlug;
    out.set(slug, (out.get(slug) ?? 0) + lot.remaining);
  }
  return out;
}

/** Catalog-ordered stacks with a positive live balance. */
export function inventoryEntries(
  lots: readonly InventoryLotRow[],
  accountId: string,
  tick: number,
): InventoryEntry[] {
  const out: InventoryEntry[] = [];
  for (const def of ITEM_CATALOG) {
    let count = 0;
    let minted = 0;
    let nextSpoilTick: number | null = null;
    for (const lot of lots) {
      if (lot.accountId !== accountId || lot.itemSlug !== def.slug) continue;
      if (!lotLive(lot, tick)) continue;
      count += lot.remaining;
      if (lot.minted === true) minted += lot.remaining;
      if (
        lot.spoilsAtTick != null &&
        (nextSpoilTick == null || lot.spoilsAtTick < nextSpoilTick)
      ) {
        nextSpoilTick = lot.spoilsAtTick;
      }
    }
    if (count > 0) {
      out.push({ slug: def.slug, count, minted, nextSpoilTick });
    }
  }
  return out;
}

export type DebitOptions = {
  /** Only take lots in this mint state (default: any). */
  only?: MintFilter;
  /** Take lots in this mint state first, then the rest. */
  prefer?: "minted" | "unminted";
};

/**
 * Take `count` of `slug`, soonest-spoiling first (never-spoiling last), ties
 * by lot id; `prefer` puts one mint state ahead of that order and `only`
 * restricts to it. Returns the changed lots, or null when the balance is short.
 */
export function planDebit(
  lots: readonly InventoryLotRow[],
  accountId: string,
  slug: string,
  count: number,
  tick: number,
  nowMs: number,
  options: DebitOptions = {},
): InventoryLotRow[] | null {
  if (!(count > 0)) return [];
  const only = options.only ?? "any";
  const rank = (lot: InventoryLotRow): number =>
    options.prefer == null || lotMatches(lot, options.prefer) ? 0 : 1;
  const live = lots
    .filter(
      (lot) =>
        lot.accountId === accountId &&
        lot.itemSlug === slug &&
        lotMatches(lot, only) &&
        lotLive(lot, tick),
    )
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const sa = a.spoilsAtTick ?? Number.MAX_SAFE_INTEGER;
      const sb = b.spoilsAtTick ?? Number.MAX_SAFE_INTEGER;
      return sa !== sb ? sa - sb : a.id - b.id;
    });
  let left = count;
  const changed: InventoryLotRow[] = [];
  for (const lot of live) {
    if (left <= 0) break;
    const take = Math.min(lot.remaining, left);
    left -= take;
    changed.push({
      ...lot,
      remaining: lot.remaining - take,
      updatedAtMs: nowMs,
    });
  }
  return left > 0 ? null : changed;
}

/** Apply changed lots over a list (by sourceKey). */
export function mergeLots(
  lots: readonly InventoryLotRow[],
  changed: readonly InventoryLotRow[],
): InventoryLotRow[] {
  const byKey = new Map(changed.map((lot) => [lot.sourceKey, lot]));
  const out = lots.map((lot) => byKey.get(lot.sourceKey) ?? lot);
  for (const lot of changed) {
    if (!lots.some((row) => row.sourceKey === lot.sourceKey)) out.push(lot);
  }
  return out;
}

export function nextLotId(lots: readonly InventoryLotRow[]): number {
  let max = 0;
  for (const lot of lots) if (lot.id > max) max = lot.id;
  return max + 1;
}

/**
 * Craft one `output`: debit every input (off-chain units first unless `debit`
 * says otherwise), then add a fresh unminted lot keyed `craft:<lotId>` (or
 * `sourceKey`). Null when the recipe is unknown or inputs are short.
 */
export function planCraft(input: {
  lots: readonly InventoryLotRow[];
  worldId: number;
  accountId: string;
  output: ItemSlug;
  tick: number;
  ticksPerDay: number;
  nowMs: number;
  debit?: DebitOptions;
  sourceKey?: string;
}): InventoryLotRow[] | null {
  const recipe = recipeFor(input.output);
  if (recipe == null) return null;
  let working: InventoryLotRow[] = [...input.lots];
  const changed: InventoryLotRow[] = [];
  for (const need of recipe.inputs) {
    const debit = planDebit(
      working,
      input.accountId,
      need.slug,
      need.count,
      input.tick,
      input.nowMs,
      input.debit ?? { prefer: "unminted" },
    );
    if (debit == null) return null;
    working = mergeLots(working, debit);
    for (const lot of debit) {
      const at = changed.findIndex((row) => row.sourceKey === lot.sourceKey);
      if (at >= 0) changed[at] = lot;
      else changed.push(lot);
    }
  }
  const id = nextLotId(input.lots);
  changed.push({
    id,
    worldId: input.worldId,
    accountId: input.accountId,
    sourceKey: input.sourceKey ?? `craft:${id}`,
    itemSlug: recipe.output,
    amount: 1,
    remaining: 1,
    gainedTick: input.tick,
    spoilsAtTick: spoilTick(recipe.output, input.tick, input.ticksPerDay),
    minted: false,
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
  });
  return changed;
}

/** Recipes whose inputs are all on hand. */
export function craftableOutputs(
  lots: readonly InventoryLotRow[],
  accountId: string,
  tick: number,
): ItemSlug[] {
  const out: ItemSlug[] = [];
  for (const def of ITEM_CATALOG) {
    const recipe = recipeFor(def.slug);
    if (recipe == null) continue;
    const ok = recipe.inputs.every(
      (need) => balanceOf(lots, accountId, need.slug, tick) >= need.count,
    );
    if (ok) out.push(def.slug);
  }
  return out;
}
