/**
 * M22 item slice in the kernel: gather stock, tool/consumable/relic effects,
 * relic triggers. Determinism, balance and replay checks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EventKind,
  EventTemplate,
  GATHER_RULES,
  InfluenceKind,
  ItemSlug,
  ModifierKind,
  type InfluenceSubmit,
} from "@boing-pets/contract";
import {
  aggregateTerritories,
  canonicalHash,
  createWorld,
  gatherYield,
  relicTriggers,
  resourceStock,
  step,
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

/** Queue an influence for the next tick, as the host does. */
function queue(snapshot: WorldSnapshot, submit: InfluenceSubmit): number {
  const id = snapshot.world.nextInfluenceId;
  snapshot.world.nextInfluenceId = id + 1;
  snapshot.pendingInfluences.push({
    id,
    worldId: snapshot.world.id,
    kind: submit.kind,
    issuedAtTick: snapshot.world.lastTick + 1,
    payload: submit.payload,
    applied: false,
  });
  return id;
}

/** Host-side gather: grant units with the pure yield, then queue. */
function gather(snapshot: WorldSnapshot, territory: number): number {
  const id = snapshot.world.nextInfluenceId;
  const tick = snapshot.world.lastTick + 1;
  const units = gatherYield(snapshot, territory, id, tick);
  queue(snapshot, {
    kind: InfluenceKind.GATHER_RESOURCE,
    payload: { territoryId: territory, resource: ItemSlug.CLOVER, units },
  });
  return units;
}

function food(snapshot: WorldSnapshot, territory: number): number {
  const stats = aggregateTerritories(snapshot, snapshot.world.lastTick + 1);
  const row = stats.get(territory);
  assert.ok(row);
  return row.food;
}

test("gatherYield is a pure function of seed, tick, territory and influence id", () => {
  const a = world(7);
  const b = world(7);
  const meadow = territoryId(a, "meadow");
  for (let id = 1; id <= 50; id += 1) {
    const ya = gatherYield(a, meadow, id, 10);
    assert.equal(ya, gatherYield(b, meadow, id, 10));
    assert.ok(ya >= GATHER_RULES.minYield && ya <= GATHER_RULES.maxYield);
  }
  // Nothing grows in the Thicket or the Elder Grove in this slice.
  assert.equal(gatherYield(a, territoryId(a, "thicket"), 1, 10), 0);
  assert.equal(resourceStock(a, territoryId(a, "grove"), 10), null);
  assert.equal(
    resourceStock(a, territoryId(a, "crags"), 10)?.resource,
    ItemSlug.CRYSTAL_SHARD,
  );
  assert.equal(
    resourceStock(a, territoryId(a, "ridge"), 10)?.resource,
    ItemSlug.CRYSTAL_SHARD,
  );
  assert.equal(
    resourceStock(a, territoryId(a, "fen"), 10)?.resource,
    ItemSlug.GLOWMOSS,
  );
  assert.equal(
    resourceStock(a, territoryId(a, "glade"), 10)?.resource,
    ItemSlug.MOONPETAL,
  );
});

test("gathering draws from the creature food pool, is capped, and regrows", () => {
  const snapshot = world();
  pinAll(snapshot);
  const meadow = territoryId(snapshot, "meadow");
  const base = food(snapshot, meadow);
  let granted = 0;
  // Far more gathers than the stock allows, several per tick.
  for (let round = 0; round < 10; round += 1) {
    granted += gather(snapshot, meadow);
    granted += gather(snapshot, meadow);
    step(snapshot);
  }
  assert.equal(granted, GATHER_RULES.stockCap);
  assert.equal(
    resourceStock(snapshot, meadow, snapshot.world.lastTick)?.free,
    0,
  );
  assert.equal(
    food(snapshot, meadow),
    base - GATHER_RULES.stockCap * GATHER_RULES.foodPerUnit,
  );
  assert.equal(
    snapshot.territories.find((t) => t.id === meadow)?.foodAbundance,
    base,
  );
  // Zero-unit gathers leave no modifier rows behind.
  const harvest = snapshot.modifiers.filter(
    (m) => m.kind === ModifierKind.HARVEST,
  );
  assert.ok(harvest.every((m) => m.amount < 0));

  const regrow = GATHER_RULES.regrowDays * snapshot.ruleset.ticksPerDay;
  for (let i = 0; i < regrow; i += 1) step(snapshot);
  assert.equal(food(snapshot, meadow), base);
  assert.equal(
    resourceStock(snapshot, meadow, snapshot.world.lastTick + 1)?.free,
    GATHER_RULES.stockCap,
  );
});

test("the kernel re-clamps an over-granted gather to free stock", () => {
  const snapshot = world();
  pinAll(snapshot);
  const fen = territoryId(snapshot, "fen");
  queue(snapshot, {
    kind: InfluenceKind.GATHER_RESOURCE,
    payload: { territoryId: fen, resource: ItemSlug.GLOWMOSS, units: 999 },
  });
  step(snapshot);
  const harvest = snapshot.modifiers.filter(
    (m) => m.kind === ModifierKind.HARVEST,
  );
  assert.equal(harvest.length, 1);
  assert.equal(
    harvest[0]?.amount,
    -GATHER_RULES.stockCap * GATHER_RULES.foodPerUnit,
  );
});

test("seed bundle, rations and calm potion add timed territory modifiers", () => {
  const snapshot = world();
  pinAll(snapshot);
  const meadow = territoryId(snapshot, "meadow");
  const ridge = territoryId(snapshot, "ridge");
  const days = snapshot.ruleset.ticksPerDay;
  queue(snapshot, {
    kind: InfluenceKind.USE_ITEM,
    payload: { item: ItemSlug.SEED_BUNDLE, territoryId: meadow },
  });
  queue(snapshot, {
    kind: InfluenceKind.USE_ITEM,
    payload: { item: ItemSlug.RATIONS, territoryId: meadow },
  });
  queue(snapshot, {
    kind: InfluenceKind.USE_ITEM,
    payload: { item: ItemSlug.POTION_CALM, territoryId: ridge },
  });
  step(snapshot);
  const rows = snapshot.modifiers.map((m) => ({
    kind: m.kind,
    amount: m.amount,
    span: m.endTick - m.startTick,
  }));
  assert.deepEqual(rows, [
    { kind: ModifierKind.FOOD, amount: 100, span: 7 * days },
    { kind: ModifierKind.FOOD, amount: 75, span: 3 * days },
    { kind: ModifierKind.DANGER, amount: -50, span: 3 * days },
  ]);
});

test("salt lick slows thirst and discomfort, capped per tick", () => {
  const lick = world();
  const plain = world();
  pinAll(lick);
  pinAll(plain);
  const crags = territoryId(lick, "crags");
  for (let i = 0; i < 4; i += 1) {
    queue(lick, {
      kind: InfluenceKind.USE_ITEM,
      payload: { item: ItemSlug.SALT_LICK, territoryId: crags },
    });
  }
  for (let i = 0; i < 20; i += 1) {
    step(lick);
    step(plain);
  }
  const inCrags = (s: WorldSnapshot): CreatureRow[] =>
    s.creatures.filter((c) => c.territoryId === crags && c.status === "ALIVE");
  const a = inCrags(lick);
  const b = inCrags(plain);
  assert.ok(a.length > 0);
  for (let i = 0; i < a.length; i += 1) {
    const withLick = a[i];
    const without = b[i];
    assert.ok(withLick && without);
    assert.ok(withLick.thirst < without.thirst);
    // 4 licks stack to the 3-per-tick cap, never more: 20 ticks * 3 = 60.
    assert.ok(without.thirst - withLick.thirst <= 60);
  }
});

test("vitality potion and relics raise lineage favor", () => {
  const snapshot = world();
  pinAll(snapshot);
  const lineage = snapshot.lineages[0];
  assert.ok(lineage);
  const before = lineage.playerFavor;
  queue(snapshot, {
    kind: InfluenceKind.USE_ITEM,
    payload: { item: ItemSlug.POTION_VITALITY, lineageId: lineage.id },
  });
  queue(snapshot, {
    kind: InfluenceKind.USE_ITEM,
    payload: { item: ItemSlug.RELIC_FIRST_CHILD, lineageId: lineage.id },
  });
  step(snapshot);
  assert.equal(lineage.playerFavor, before + 75);
});

test("raw resources cannot be used directly", () => {
  const snapshot = world();
  queue(snapshot, {
    kind: InfluenceKind.USE_ITEM,
    payload: {
      item: ItemSlug.CLOVER,
      territoryId: territoryId(snapshot, "meadow"),
    },
  });
  assert.throws(() => step(snapshot), /use item/);
});

test("item influences replay to the same canonical hash", () => {
  const run = (): string => {
    const snapshot = world(42);
    const meadow = territoryId(snapshot, "meadow");
    const glade = territoryId(snapshot, "glade");
    for (let t = 0; t < 300; t += 1) {
      if (t % 25 === 0) gather(snapshot, meadow);
      if (t % 40 === 0) gather(snapshot, glade);
      if (t === 60)
        queue(snapshot, {
          kind: InfluenceKind.USE_ITEM,
          payload: { item: ItemSlug.SEED_BUNDLE, territoryId: meadow },
        });
      if (t === 90)
        queue(snapshot, {
          kind: InfluenceKind.USE_ITEM,
          payload: { item: ItemSlug.SALT_LICK, territoryId: glade },
        });
      step(snapshot);
    }
    return canonicalHash(snapshot);
  };
  assert.equal(run(), run());
});

test("a world with no item influences is untouched by the item slice", () => {
  const a = world(3);
  const b = world(3);
  for (let t = 0; t < 200; t += 1) step(a);
  for (let t = 0; t < 200; t += 1) step(b);
  assert.equal(canonicalHash(a), canonicalHash(b));
  assert.equal(a.modifiers.length, 0);
});

test("relicTriggers maps non-founder births and deaths to relic candidates", () => {
  const base = { worldId: 1, territoryId: 1, summary: "" };
  const events = [
    {
      ...base,
      id: 3,
      tick: 5,
      kind: EventKind.DEATH,
      actorId: 9,
      subjectId: null,
      lineageId: 2,
      payload: {
        template: EventTemplate.DEATH,
        cause: "OLD_AGE",
        ageDays: 30,
        territoryId: 1,
        gestationLost: false,
      },
    },
    {
      ...base,
      id: 1,
      tick: 5,
      kind: EventKind.BIRTH,
      actorId: 50,
      subjectId: 7,
      lineageId: 2,
      payload: {
        template: EventTemplate.BIRTH,
        motherId: 7,
        fatherId: 8,
        lineageId: 2,
        speciesId: 1,
        genes: {},
        mutations: [],
        territoryId: 1,
      },
    },
    {
      ...base,
      id: 2,
      tick: 5,
      kind: EventKind.BIRTH,
      actorId: 1,
      subjectId: null,
      lineageId: 1,
      payload: {
        template: EventTemplate.BIRTH_FOUNDER,
        motherId: null,
        fatherId: null,
        lineageId: 1,
        speciesId: 1,
        genes: {},
        mutations: [],
        territoryId: 1,
      },
    },
  ] as unknown as WorldEvent[];
  assert.deepEqual(relicTriggers(events), [
    {
      relic: ItemSlug.RELIC_FIRST_CHILD,
      lineageId: 2,
      creatureId: 7,
      eventId: 1,
      tick: 5,
    },
    {
      relic: ItemSlug.RELIC_REMEMBRANCE,
      lineageId: 2,
      creatureId: 9,
      eventId: 3,
      tick: 5,
    },
  ]);
});
