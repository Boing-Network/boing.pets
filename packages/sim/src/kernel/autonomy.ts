/**
 * Creature autonomy with items: loot, craft, use.
 *
 * - LOOT is kernel-native and deterministic: after a successful FORAGE in a
 *   territory where a resource grows, a seeded roll may let the creature pick
 *   up `LOOT_RULES.units`. The unit is drawn from the territory's regrowing
 *   stock as a HARVEST modifier with no source influence, exactly like a
 *   player gather, so creature loot never adds supply beyond `GATHER_RULES`.
 *   The host credits the ITEM/loot event to the creature's keeper (or its
 *   pouch) after the tick is durable.
 * - CRAFT and USE are decided by the pure planner below from the creature's
 *   needs and the units it may use (its pouch first, then its keeper's
 *   unminted bag). The host records each decision as a CREATURE_* influence,
 *   which the kernel applies next tick (see influences.ts), so replaying the
 *   influence log reproduces the world exactly.
 *
 * The kernel never stores inventory.
 */
import {
  CREATURE_USE_THRESHOLDS,
  CreatureStatus,
  EventKind,
  EventTemplate,
  GATHER_RULES,
  LOOT_RULES,
  ModifierKind,
  RECIPES,
  creatureCraftable,
  creatureUseRule,
  itemDef,
  resourceForTerritory,
  type ItemSlug,
} from "@boing-pets/contract";
import { assertInteger, clamp } from "../math";
import { rngInt } from "../rng";
import type {
  CreatureRow,
  TerritoryModifierRow,
  WorldEvent,
  WorldSnapshot,
} from "../types";
import { resourceStock } from "./items";
import { aggregateTerritories } from "./territories";
import type { TerritoryTick } from "./needs";

function takeEventId(snapshot: WorldSnapshot): number {
  const id = snapshot.world.nextEventId;
  snapshot.world.nextEventId = id + 1;
  return id;
}

function itemName(slug: string): string {
  return itemDef(slug)?.displayName ?? slug;
}

/** Creature loots (HARVEST rows with no influence) started in the last day. */
export function creatureLootsToday(
  snapshot: WorldSnapshot,
  territoryId: number,
  tick: number,
): number {
  const since = tick - snapshot.ruleset.ticksPerDay;
  let count = 0;
  for (const modifier of snapshot.modifiers) {
    if (modifier.kind !== ModifierKind.HARVEST) continue;
    if (modifier.territoryId !== territoryId) continue;
    if (modifier.sourceInfluenceId != null) continue;
    if (modifier.startTick <= since || modifier.startTick > tick) continue;
    count += 1;
  }
  return count;
}

export type LootCheck =
  | { ok: true; resource: ItemSlug; units: number }
  | {
      ok: false;
      reason: "no_resource" | "reserve" | "daily_cap" | "roll";
    };

/** Pure: may `creature` loot in its territory at `tick`? */
export function lootCheck(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  territorySlug: string,
): LootCheck {
  const resource = resourceForTerritory(territorySlug);
  if (resource == null) return { ok: false, reason: "no_resource" };
  const stock = resourceStock(snapshot, creature.territoryId, tick);
  if (stock == null) return { ok: false, reason: "no_resource" };
  const units = LOOT_RULES.units;
  if (stock.free - units < LOOT_RULES.reserve) {
    return { ok: false, reason: "reserve" };
  }
  if (
    creatureLootsToday(snapshot, creature.territoryId, tick) >=
    LOOT_RULES.perTerritoryPerDay
  ) {
    return { ok: false, reason: "daily_cap" };
  }
  const roll = rngInt(
    snapshot.world.seed,
    tick,
    "loot",
    creature.id,
    creature.territoryId,
    0,
    999,
  );
  if (roll >= LOOT_RULES.chancePerMille) return { ok: false, reason: "roll" };
  return { ok: true, resource, units };
}

/**
 * After a successful forage: maybe loot one unit. Appends the HARVEST row
 * and returns the ITEM/loot event (empty when nothing was looted).
 */
export function lootAfterForage(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  territories: ReadonlyMap<number, TerritoryTick>,
): WorldEvent[] {
  const territory = territories.get(creature.territoryId);
  if (!territory) return [];
  const check = lootCheck(snapshot, creature, tick, territory.slug);
  if (!check.ok) return [];
  const modifierId = snapshot.world.nextModifierId;
  snapshot.world.nextModifierId = modifierId + 1;
  const harvest: TerritoryModifierRow = {
    id: modifierId,
    worldId: snapshot.world.id,
    territoryId: creature.territoryId,
    kind: ModifierKind.HARVEST,
    amount: assertInteger(-check.units * GATHER_RULES.foodPerUnit, "loot"),
    startTick: tick,
    endTick: tick + GATHER_RULES.regrowDays * snapshot.ruleset.ticksPerDay,
    sourceInfluenceId: null,
  };
  snapshot.modifiers.push(harvest);
  return [
    {
      id: takeEventId(snapshot),
      worldId: snapshot.world.id,
      tick,
      kind: EventKind.ITEM,
      actorId: creature.id,
      subjectId: null,
      territoryId: creature.territoryId,
      lineageId: creature.lineageId,
      summary: `${creature.name} found ${check.units} ${itemName(check.resource)} in ${territory.name}.`,
      payload: {
        template: EventTemplate.ITEM_LOOT,
        creatureId: creature.id,
        item: check.resource,
        units: check.units,
        territoryId: creature.territoryId,
      },
    },
  ];
}

function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

/**
 * Apply a CREATURE_USE_ITEM: relief on the creature, or the item's catalog
 * territory effect in the creature's current territory (via `addModifier`).
 * A creature that died before the use lands gets nothing (no event).
 */
export function applyCreatureUse(
  snapshot: WorldSnapshot,
  input: { creatureId: number; item: string; influenceId: number },
  tick: number,
  addModifier: (
    territoryId: number,
    kind: ModifierKind,
    amount: number,
    durationTicks: number,
  ) => void,
): WorldEvent[] {
  const creature = snapshot.creatures.find(
    (row) => row.id === input.creatureId,
  );
  if (!creature || creature.status !== CreatureStatus.ALIVE) return [];
  const rule = creatureUseRule(input.item);
  const def = itemDef(input.item);
  if (!rule || !def) throw new Error(`creature use ${input.item}`);
  const territory = snapshot.territories.find(
    (row) => row.id === creature.territoryId,
  );
  let where = "";
  if (rule.relief != null) {
    const r = rule.relief;
    const need = (value: number, relief = 0) =>
      assertInteger(clamp(value - relief, 0, 1000), "need");
    creature.hunger = need(creature.hunger, r.hunger);
    creature.thirst = need(creature.thirst, r.thirst);
    creature.discomfort = need(creature.discomfort, r.discomfort);
    creature.unsafety = need(creature.unsafety, r.unsafety);
    creature.health = assertInteger(
      clamp(creature.health + (r.health ?? 0), 0, 1000),
      "health",
    );
  } else {
    const effect = def.effect;
    if (
      effect == null ||
      effect.kind === "FAVOR" ||
      effect.kind === "RELIEF" ||
      effect.kind === "GENE"
    ) {
      throw new Error(`creature use effect ${input.item}`);
    }
    addModifier(
      creature.territoryId,
      ModifierKind[effect.kind],
      effect.amount,
      effect.days * snapshot.ruleset.ticksPerDay,
    );
    where = territory != null ? ` in ${territory.name}` : "";
  }
  return [
    {
      id: takeEventId(snapshot),
      worldId: snapshot.world.id,
      tick,
      kind: EventKind.ITEM,
      actorId: creature.id,
      subjectId: null,
      territoryId: creature.territoryId,
      lineageId: creature.lineageId,
      summary: `${creature.name} ${rule.verb} ${article(def.displayName)} ${def.displayName}${where}.`,
      payload: {
        template: EventTemplate.ITEM_USE,
        creatureId: creature.id,
        item: def.slug,
        territoryId: creature.territoryId,
        influenceId: input.influenceId,
      },
    },
  ];
}

/** Apply a CREATURE_CRAFT: the bag changed at the host; log the activity. */
export function applyCreatureCraft(
  snapshot: WorldSnapshot,
  input: { creatureId: number; output: string; influenceId: number },
  tick: number,
): WorldEvent[] {
  const creature = snapshot.creatures.find(
    (row) => row.id === input.creatureId,
  );
  if (!creature || creature.status !== CreatureStatus.ALIVE) return [];
  const def = itemDef(input.output);
  if (!def) throw new Error(`creature craft ${input.output}`);
  return [
    {
      id: takeEventId(snapshot),
      worldId: snapshot.world.id,
      tick,
      kind: EventKind.ITEM,
      actorId: creature.id,
      subjectId: null,
      territoryId: creature.territoryId,
      lineageId: creature.lineageId,
      summary: `${creature.name} crafted ${article(def.displayName)} ${def.displayName}.`,
      payload: {
        template: EventTemplate.ITEM_CRAFT,
        creatureId: creature.id,
        output: def.slug,
        territoryId: creature.territoryId,
        influenceId: input.influenceId,
      },
    },
  ];
}

// -- Planner -----------------------------------------------------------------

/** Units one creature may draw on: its pouch or its keeper's unminted bag. */
export type AutonomyBag = {
  accountId: string;
  /** Live, unminted units by slug. The planner debits it as it plans. */
  units: Map<string, number>;
  autoCraft: boolean;
  autoUse: boolean;
  /** Uses this bag may still pay for today (pouches: Infinity). */
  usesLeft: number;
};

export type AutonomyIntent =
  | { kind: "CRAFT"; creatureId: number; accountId: string; output: ItemSlug }
  | {
      kind: "USE";
      creatureId: number;
      accountId: string;
      item: ItemSlug;
      territoryId: number;
    };

/**
 * Items the creature wants right now, most urgent first (see
 * CREATURE_USE_THRESHOLDS). Pure.
 */
export function wantedItems(
  creature: CreatureRow,
  territory: TerritoryTick | undefined,
): ItemSlug[] {
  const t = CREATURE_USE_THRESHOLDS;
  const out: ItemSlug[] = [];
  if (creature.health <= t.vitalityHealthAtMost) out.push("potion.vitality");
  if (creature.hunger >= t.rationsHungerAtLeast) out.push("item.rations");
  if (creature.unsafety >= t.calmUnsafetyAtLeast) out.push("potion.calm");
  if (
    territory != null &&
    creature.hunger >= t.seedHungerAtLeast &&
    territory.food < t.seedTerritoryFoodBelow
  ) {
    out.push("tool.seed-bundle");
  }
  if (
    territory != null &&
    (territory.comfort ?? 0) === 0 &&
    (creature.thirst >= t.saltThirstOrDiscomfortAtLeast ||
      creature.discomfort >= t.saltThirstOrDiscomfortAtLeast)
  ) {
    out.push("tool.salt-lick");
  }
  return out;
}

/**
 * Decide this pass's crafts and uses. Pure and deterministic: creatures in
 * ascending id, bags in the order `bagsFor` returns them (pouch first).
 *
 * - Craft: each bag that allows it crafts at most `maxCraftsPerBag` items,
 *   the first recipe (catalog order) whose inputs are all on hand, credited
 *   to the lowest-id living creature that draws on the bag.
 * - Use: each creature off cooldown uses at most one item, the most urgent
 *   it wants that one of its bags holds and allows (`usesLeft` > 0). A
 *   territory item (seed bundle, salt lick) is placed at most once per
 *   territory per pass.
 */
export function planCreatureAutonomy(input: {
  snapshot: WorldSnapshot;
  tick: number;
  /** Territory stats for `tick`; computed from the snapshot when omitted. */
  territories?: ReadonlyMap<number, TerritoryTick>;
  bagsFor: (creatureId: number) => readonly AutonomyBag[];
  /** Tick of each creature's last use (cooldown). */
  lastUseTick: ReadonlyMap<number, number>;
  useCooldownTicks: number;
  maxCraftsPerBag: number;
}): AutonomyIntent[] {
  const territories =
    input.territories ?? aggregateTerritories(input.snapshot, input.tick);
  const alive = input.snapshot.creatures
    .filter((row) => row.status === CreatureStatus.ALIVE)
    .sort((a, b) => a.id - b.id);
  const intents: AutonomyIntent[] = [];

  // Crafts, one bag at a time, by its first (lowest-id) creature.
  const crafter = new Map<AutonomyBag, number>();
  for (const creature of alive) {
    for (const bag of input.bagsFor(creature.id)) {
      if (!crafter.has(bag)) crafter.set(bag, creature.id);
    }
  }
  for (const [bag, creatureId] of crafter) {
    if (!bag.autoCraft) continue;
    for (let n = 0; n < input.maxCraftsPerBag; n += 1) {
      const recipe = RECIPES.find(
        (row) =>
          creatureCraftable(row.output) &&
          row.inputs.every(
            (need) => (bag.units.get(need.slug) ?? 0) >= need.count,
          ),
      );
      if (recipe == null) break;
      for (const need of recipe.inputs) {
        bag.units.set(need.slug, (bag.units.get(need.slug) ?? 0) - need.count);
      }
      bag.units.set(recipe.output, (bag.units.get(recipe.output) ?? 0) + 1);
      intents.push({
        kind: "CRAFT",
        creatureId,
        accountId: bag.accountId,
        output: recipe.output,
      });
    }
  }

  // Uses.
  const placed = new Set<string>();
  for (const creature of alive) {
    const last = input.lastUseTick.get(creature.id);
    if (last != null && input.tick - last < input.useCooldownTicks) continue;
    const territory = territories.get(creature.territoryId);
    const bags = input.bagsFor(creature.id);
    let used = false;
    for (const item of wantedItems(creature, territory)) {
      const territoryItem = creatureUseRule(item)?.relief == null;
      const placeKey = `${creature.territoryId}:${item}`;
      if (territoryItem && placed.has(placeKey)) continue;
      for (const bag of bags) {
        if (!bag.autoUse || bag.usesLeft <= 0) continue;
        const have = bag.units.get(item) ?? 0;
        if (have <= 0) continue;
        bag.units.set(item, have - 1);
        bag.usesLeft -= 1;
        if (territoryItem) placed.add(placeKey);
        intents.push({
          kind: "USE",
          creatureId: creature.id,
          accountId: bag.accountId,
          item,
          territoryId: creature.territoryId,
        });
        used = true;
        break;
      }
      if (used) break;
    }
  }
  return intents;
}
