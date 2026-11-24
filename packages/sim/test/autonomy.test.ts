/**
 * Creature autonomy: kernel loot after a forage, creature item uses and
 * crafts as recorded influences, and the pure planner. Determinism, scarcity
 * and replay checks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUTONOMY_RULES,
  EventKind,
  EventTemplate,
  GATHER_RULES,
  InfluenceKind,
  ItemSlug,
  resourceForTerritory,
  LOOT_RULES,
  ModifierKind,
  type InfluenceRecord,
  type ItemEventPayload,
} from "@boing-pets/contract";
import {
  aggregateTerritories,
  canonicalHash,
  createWorld,
  creatureLootsToday,
  lootCheck,
  planCreatureAutonomy,
  resourceStock,
  step,
  wantedItems,
  type AutonomyBag,
  type CreatureRow,
  type WorldEvent,
  type WorldSnapshot,
} from "../src/index";

function world(seed = 1): WorldSnapshot {
  return createWorld(seed).snapshot;
}

function territoryId(snapshot: WorldSnapshot, slug: string): number {
  const row = snapshot.territories.find((t) => t.slug === slug);
  assert.ok(row, slug);
  return row.id;
}

function pinAll(snapshot: WorldSnapshot): void {
  for (const creature of snapshot.creatures) {
    creature.currentAction = "REST";
    creature.currentGoal = "SEEK_SHELTER";
    creature.actionTargetKind = "NONE";
    creature.actionTargetId = null;
    creature.actionStartedTick = 0;
    creature.actionEndsTick = 1_000_000;
  }
}

function queue(snapshot: WorldSnapshot, record: InfluenceRecord): number {
  const id = snapshot.world.nextInfluenceId;
  snapshot.world.nextInfluenceId = id + 1;
  snapshot.pendingInfluences.push({
    id,
    worldId: snapshot.world.id,
    kind: record.kind,
    issuedAtTick: snapshot.world.lastTick + 1,
    payload: record.payload,
    applied: false,
  });
  return id;
}

function harvest(
  snapshot: WorldSnapshot,
  territory: number,
  startTick: number,
  sourceInfluenceId: number | null,
): void {
  const id = snapshot.world.nextModifierId;
  snapshot.world.nextModifierId = id + 1;
  snapshot.modifiers.push({
    id,
    worldId: snapshot.world.id,
    territoryId: territory,
    kind: ModifierKind.HARVEST,
    amount: -GATHER_RULES.foodPerUnit,
    startTick,
    endTick: startTick + GATHER_RULES.regrowDays * 144,
    sourceInfluenceId,
  });
}

function inMeadow(snapshot: WorldSnapshot): CreatureRow {
  const meadow = territoryId(snapshot, "meadow");
  const creature = snapshot.creatures.find((c) => c.territoryId === meadow);
  assert.ok(creature);
  return creature;
}

/** A tick at which the creature's loot roll passes (pure, so searchable). */
function passingTick(snapshot: WorldSnapshot, creature: CreatureRow): number {
  for (let tick = 1; tick < 5_000; tick += 1) {
    if (lootCheck(snapshot, creature, tick, "meadow").ok) return tick;
  }
  throw new Error("no passing tick");
}

test("lootCheck: no resource, reserve, daily cap and seeded roll", () => {
  const snapshot = world();
  const creature = inMeadow(snapshot);
  const meadow = creature.territoryId;
  const tick = passingTick(snapshot, creature);
  const ok = lootCheck(snapshot, creature, tick, "meadow");
  assert.deepEqual(ok, {
    ok: true,
    resource: ItemSlug.CLOVER,
    units: LOOT_RULES.units,
  });
  // Same inputs, same answer.
  assert.deepEqual(lootCheck(snapshot, creature, tick, "meadow"), ok);
  // A territory with no resource of its own (none today; a future one).
  assert.deepEqual(lootCheck(snapshot, creature, tick, "barrens"), {
    ok: false,
    reason: "no_resource",
  });

  // Creature loots in the last day hit the per-territory cap...
  const capped = world();
  const c2 = inMeadow(capped);
  for (let i = 0; i < LOOT_RULES.perTerritoryPerDay; i += 1) {
    harvest(capped, meadow, tick - i, null);
  }
  assert.equal(
    creatureLootsToday(capped, meadow, tick),
    LOOT_RULES.perTerritoryPerDay,
  );
  assert.deepEqual(lootCheck(capped, c2, tick, "meadow"), {
    ok: false,
    reason: "daily_cap",
  });
  // ...but player gathers (with a source influence) do not count toward it.
  const players = world();
  const c3 = inMeadow(players);
  harvest(players, meadow, tick, 900);
  assert.equal(creatureLootsToday(players, meadow, tick), 0);
  assert.ok(lootCheck(players, c3, tick, "meadow").ok);

  // Creatures leave the last `reserve` units for players.
  const low = world();
  const c4 = inMeadow(low);
  const keep = LOOT_RULES.reserve;
  for (let i = 0; i < GATHER_RULES.stockCap - keep; i += 1) {
    harvest(low, meadow, tick - 200 - i, 900 + i);
  }
  assert.equal(resourceStock(low, meadow, tick)?.free, keep);
  assert.deepEqual(lootCheck(low, c4, tick, "meadow"), {
    ok: false,
    reason: "reserve",
  });
});

function itemEvents(events: readonly WorldEvent[]): WorldEvent[] {
  return events.filter((event) => event.kind === EventKind.ITEM);
}

test("creatures loot on their own, within the stock, reserve and daily cap", () => {
  const snapshot = world();
  const events: WorldEvent[] = [];
  const days = 10;
  for (let t = 0; t < days * 144; t += 1) events.push(...step(snapshot).events);
  const loots = itemEvents(events).filter(
    (e) => (e.payload as ItemEventPayload).template === EventTemplate.ITEM_LOOT,
  );
  assert.ok(loots.length > 0, "some creature looted in ten days");
  const harvests = snapshot.modifiers.filter(
    (m) => m.kind === ModifierKind.HARVEST && m.sourceInfluenceId == null,
  );
  for (const loot of loots) {
    const payload = loot.payload as Extract<
      ItemEventPayload,
      { template: typeof EventTemplate.ITEM_LOOT }
    >;
    assert.equal(payload.units, LOOT_RULES.units);
    assert.equal(loot.actorId, payload.creatureId);
    assert.match(loot.summary, / found 1 /);
    // Rolling-day cap per territory, counted at each loot.
    const sameDay = loots.filter(
      (other) =>
        other.territoryId === loot.territoryId &&
        other.tick > loot.tick - 144 &&
        other.tick <= loot.tick,
    );
    assert.ok(sameDay.length <= LOOT_RULES.perTerritoryPerDay);
  }
  // Never more than cap - reserve creature units outstanding per territory.
  for (const territory of snapshot.territories) {
    for (let tick = 0; tick <= days * 144; tick += 36) {
      const outstanding = harvests.filter(
        (m) =>
          m.territoryId === territory.id &&
          m.startTick <= tick &&
          tick < m.endTick,
      ).length;
      assert.ok(
        outstanding <= GATHER_RULES.stockCap - LOOT_RULES.reserve,
        `${territory.slug} at ${tick}: ${outstanding}`,
      );
    }
  }
  // World supply ceiling: perTerritoryPerDay per resource territory per day.
  const resourceTerritories = snapshot.territories.filter(
    (t) => resourceForTerritory(t.slug) != null,
  ).length;
  assert.equal(resourceTerritories, snapshot.territories.length);
  assert.ok(
    loots.length <= days * resourceTerritories * LOOT_RULES.perTerritoryPerDay,
  );
});

test("loot is deterministic and replay-safe", () => {
  const run = () => {
    const snapshot = world(5);
    const events: WorldEvent[] = [];
    for (let t = 0; t < 720; t += 1) events.push(...step(snapshot).events);
    return {
      hash: canonicalHash(snapshot),
      loot: itemEvents(events).map((e) => `${e.id}:${e.tick}:${e.summary}`),
    };
  };
  assert.deepEqual(run(), run());
});

test("CREATURE_USE_ITEM relieves the creature and logs an activity line", () => {
  const snapshot = world();
  pinAll(snapshot);
  const creature = snapshot.creatures[0]!;
  creature.hunger = 800;
  creature.unsafety = 900;
  creature.health = 300;
  const rations = queue(snapshot, {
    kind: InfluenceKind.CREATURE_USE_ITEM,
    payload: { creatureId: creature.id, item: ItemSlug.RATIONS },
  });
  queue(snapshot, {
    kind: InfluenceKind.CREATURE_USE_ITEM,
    payload: { creatureId: creature.id, item: ItemSlug.POTION_CALM },
  });
  queue(snapshot, {
    kind: InfluenceKind.CREATURE_USE_ITEM,
    payload: { creatureId: creature.id, item: ItemSlug.POTION_VITALITY },
  });
  const hunger = creature.hunger;
  const { events } = step(snapshot);
  const uses = itemEvents(events);
  assert.equal(uses.length, 3);
  assert.equal(uses[0]!.summary, `${creature.name} ate a Rations Pack.`);
  assert.equal(uses[1]!.summary, `${creature.name} drank a Calm Potion.`);
  assert.equal(uses[2]!.summary, `${creature.name} drank a Vitality Potion.`);
  assert.equal(
    (uses[0]!.payload as { influenceId: number }).influenceId,
    rations,
  );
  // Relief applied before this tick's drift (+hungerPerTick and biology).
  assert.ok(creature.hunger <= hunger - 350 + 10);
  assert.ok(creature.unsafety < 900 - 300);
  assert.ok(creature.health > 300);
});

test("territory items from a creature land in its own territory", () => {
  const snapshot = world();
  pinAll(snapshot);
  const creature = inMeadow(snapshot);
  queue(snapshot, {
    kind: InfluenceKind.CREATURE_USE_ITEM,
    payload: {
      creatureId: creature.id,
      item: ItemSlug.SEED_BUNDLE,
      territoryId: creature.territoryId,
    },
  });
  const { events } = step(snapshot);
  const food = snapshot.modifiers.filter((m) => m.kind === ModifierKind.FOOD);
  assert.equal(food.length, 1);
  assert.equal(food[0]!.territoryId, creature.territoryId);
  assert.equal(food[0]!.amount, 100);
  assert.match(itemEvents(events)[0]!.summary, /planted a Seed bundle in /);
});

test("a dead creature's queued use and craft do nothing", () => {
  const snapshot = world();
  pinAll(snapshot);
  const creature = snapshot.creatures[0]!;
  creature.status = "DEAD";
  queue(snapshot, {
    kind: InfluenceKind.CREATURE_USE_ITEM,
    payload: { creatureId: creature.id, item: ItemSlug.RATIONS },
  });
  queue(snapshot, {
    kind: InfluenceKind.CREATURE_CRAFT,
    payload: { creatureId: creature.id, output: ItemSlug.SALT_LICK },
  });
  assert.equal(itemEvents(step(snapshot).events).length, 0);
});

test("CREATURE_CRAFT only logs the activity", () => {
  const snapshot = world();
  pinAll(snapshot);
  const creature = snapshot.creatures[2]!;
  queue(snapshot, {
    kind: InfluenceKind.CREATURE_CRAFT,
    payload: { creatureId: creature.id, output: ItemSlug.SALT_LICK },
  });
  const modifiers = snapshot.modifiers.length;
  const events = itemEvents(step(snapshot).events);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.summary, `${creature.name} crafted a Salt lick.`);
  assert.equal(snapshot.modifiers.length, modifiers);
});

test("creature influences replay to the same hash", () => {
  const run = () => {
    const snapshot = world(9);
    for (let t = 0; t < 300; t += 1) {
      if (t % 25 === 0) {
        const creature = snapshot.creatures.find((c) => c.status === "ALIVE")!;
        queue(snapshot, {
          kind: InfluenceKind.CREATURE_USE_ITEM,
          payload: { creatureId: creature.id, item: ItemSlug.RATIONS },
        });
        queue(snapshot, {
          kind: InfluenceKind.CREATURE_CRAFT,
          payload: { creatureId: creature.id, output: ItemSlug.SEED_BUNDLE },
        });
      }
      step(snapshot);
    }
    return canonicalHash(snapshot);
  };
  assert.equal(run(), run());
});

function bag(
  accountId: string,
  units: Record<string, number>,
  extra: Partial<AutonomyBag> = {},
): AutonomyBag {
  return {
    accountId,
    units: new Map(Object.entries(units)),
    autoCraft: true,
    autoUse: true,
    usesLeft: Number.POSITIVE_INFINITY,
    ...extra,
  };
}

function plan(
  snapshot: WorldSnapshot,
  bagsFor: (id: number) => AutonomyBag[],
  lastUseTick = new Map<number, number>(),
) {
  const tick = snapshot.world.lastTick + 1;
  return planCreatureAutonomy({
    snapshot,
    tick,
    territories: aggregateTerritories(snapshot, tick),
    bagsFor,
    lastUseTick,
    useCooldownTicks: AUTONOMY_RULES.useCooldownTicks,
    maxCraftsPerBag: AUTONOMY_RULES.maxCraftsPerBagPerPass,
  });
}

test("wantedItems follows the thresholds, most urgent first", () => {
  const snapshot = world();
  const creature = snapshot.creatures[0]!;
  const territory = aggregateTerritories(snapshot, 1).get(
    creature.territoryId,
  )!;
  creature.hunger = 100;
  creature.unsafety = 100;
  creature.health = 1000;
  creature.thirst = 0;
  creature.discomfort = 0;
  assert.deepEqual(wantedItems(creature, territory), []);
  creature.hunger = 700;
  creature.unsafety = 700;
  creature.health = 400;
  assert.deepEqual(wantedItems(creature, territory), [
    ItemSlug.POTION_VITALITY,
    ItemSlug.RATIONS,
    ItemSlug.POTION_CALM,
  ]);
  creature.thirst = 700;
  assert.deepEqual(wantedItems(creature, { ...territory, food: 100 }), [
    ItemSlug.POTION_VITALITY,
    ItemSlug.RATIONS,
    ItemSlug.POTION_CALM,
    ItemSlug.SEED_BUNDLE,
    ItemSlug.SALT_LICK,
  ]);
  // An active salt lick already helps: no second one.
  assert.ok(
    !wantedItems(creature, { ...territory, comfort: 2 }).includes(
      ItemSlug.SALT_LICK,
    ),
  );
});

test("planner: pouch first, one use per creature, cooldown, toggles, caps", () => {
  const snapshot = world();
  for (const c of snapshot.creatures) {
    c.hunger = 0;
    c.unsafety = 0;
    c.health = 1000;
    c.thirst = 0;
    c.discomfort = 0;
  }
  const [a, b, c] = snapshot.creatures;
  a!.hunger = 900;
  a!.unsafety = 900;
  b!.hunger = 900;
  c!.hunger = 900;
  const pouchA = bag("pouch:a", { [ItemSlug.RATIONS]: 1 });
  const keeper = bag(
    "w:keeper",
    { [ItemSlug.RATIONS]: 5, [ItemSlug.POTION_CALM]: 1 },
    { usesLeft: 1 },
  );
  const off = bag("w:off", { [ItemSlug.RATIONS]: 5 }, { autoUse: false });
  const intents = plan(snapshot, (id) =>
    id === a!.id
      ? [pouchA, keeper]
      : id === b!.id
        ? [keeper]
        : id === c!.id
          ? [off]
          : [],
  );
  const uses = intents.filter((i) => i.kind === "USE");
  // A eats from its pouch (once), B from the keeper (its one use today), C's
  // keeper turned auto-use off.
  assert.deepEqual(
    uses.map((u) => [u.creatureId, u.accountId, u.kind === "USE" && u.item]),
    [
      [a!.id, "pouch:a", ItemSlug.RATIONS],
      [b!.id, "w:keeper", ItemSlug.RATIONS],
    ],
  );
  assert.equal(pouchA.units.get(ItemSlug.RATIONS), 0);
  assert.equal(keeper.units.get(ItemSlug.RATIONS), 4);
  assert.equal(keeper.usesLeft, 0);

  // Cooldown: A used one 10 ticks ago.
  const again = plan(
    snapshot,
    (id) => (id === a!.id ? [bag("p", { [ItemSlug.RATIONS]: 3 })] : []),
    new Map([[a!.id, snapshot.world.lastTick + 1 - 10]]),
  );
  assert.equal(again.length, 0);
});

test("planner crafts once per bag per pass, then uses what it made", () => {
  const snapshot = world();
  for (const c of snapshot.creatures) {
    c.hunger = 0;
    c.unsafety = 0;
    c.health = 1000;
    c.thirst = 0;
    c.discomfort = 0;
  }
  const keeper = bag("w:k", {
    [ItemSlug.CLOVER]: 6,
    [ItemSlug.MOONPETAL]: 2,
    [ItemSlug.CRYSTAL_SHARD]: 2,
    [ItemSlug.GLOWMOSS]: 1,
  });
  const noCraft = bag(
    "w:n",
    { [ItemSlug.CLOVER]: 3, [ItemSlug.MOONPETAL]: 1 },
    { autoCraft: false },
  );
  const ids = snapshot.creatures.map((c) => c.id).sort((x, y) => x - y);
  const intents = plan(snapshot, (id) =>
    id === ids[3] || id === ids[1] ? [keeper] : id === ids[0] ? [noCraft] : [],
  );
  assert.deepEqual(intents, [
    {
      kind: "CRAFT",
      creatureId: ids[1],
      accountId: "w:k",
      output: ItemSlug.SEED_BUNDLE,
    },
  ]);
  assert.equal(keeper.units.get(ItemSlug.CLOVER), 3);
  assert.equal(keeper.units.get(ItemSlug.MOONPETAL), 1);
  assert.equal(keeper.units.get(ItemSlug.SEED_BUNDLE), 1);
  assert.equal(noCraft.units.get(ItemSlug.CLOVER), 3);
});

test("planner places a territory item once per territory per pass", () => {
  const snapshot = world();
  const meadow = territoryId(snapshot, "meadow");
  const here = snapshot.creatures.filter((c) => c.territoryId === meadow);
  assert.ok(here.length >= 2);
  for (const c of snapshot.creatures) {
    c.hunger = 0;
    c.unsafety = 0;
    c.health = 1000;
    c.thirst = 0;
    c.discomfort = 0;
  }
  for (const c of here) c.hunger = 600;
  // Starve the meadow so a seed bundle would help.
  snapshot.modifiers.push({
    id: snapshot.world.nextModifierId++,
    worldId: snapshot.world.id,
    territoryId: meadow,
    kind: ModifierKind.FOOD,
    amount: -900,
    startTick: 0,
    endTick: 10_000,
    sourceInfluenceId: null,
  });
  const shared = bag("w:k", { [ItemSlug.SEED_BUNDLE]: 5 });
  const intents = plan(snapshot, (id) =>
    here.some((c) => c.id === id) ? [shared] : [],
  );
  assert.equal(intents.length, 1);
  assert.equal(shared.units.get(ItemSlug.SEED_BUNDLE), 4);
});
