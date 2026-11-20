import assert from "node:assert/strict";
import { test } from "node:test";
import { Goal } from "@boing-pets/contract";
import {
  beginFlee,
  beginRelocate,
  fleeDestination,
  travelDuration,
} from "../src/ai/actions";
import { aggregateTerritories } from "../src/kernel/territories";
import { divRound } from "../src/math";
import {
  canonicalHash,
  createWorld,
  step,
  type CreatureRow,
  type WorldEvent,
  type WorldSnapshot,
} from "../src/index";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function world(): WorldSnapshot {
  return createWorld(1).snapshot;
}

function byId(snapshot: WorldSnapshot, id: number): CreatureRow {
  const row = snapshot.creatures.find((creature) => creature.id === id);
  assert.ok(row);
  return row;
}

/** Keep utility from starting new travel while a relocate fixture runs. */
function pinOthers(snapshot: WorldSnapshot, exceptId: number): void {
  for (const creature of snapshot.creatures) {
    if (creature.id === exceptId) continue;
    creature.currentGoal = Goal.SEEK_SHELTER;
    creature.currentAction = "REST";
    creature.actionTargetKind = "NONE";
    creature.actionTargetId = null;
    creature.actionStartedTick = 0;
    creature.actionEndsTick = 1_000_000;
  }
}

function territory(snapshot: WorldSnapshot, slug: string) {
  const row = snapshot.territories.find((item) => item.slug === slug);
  assert.ok(row);
  return row;
}

function reverseArrays(snapshot: WorldSnapshot): WorldSnapshot {
  const copy = clone(snapshot);
  copy.species.reverse();
  copy.compatibility.reverse();
  copy.territories.reverse();
  copy.links.reverse();
  copy.discoveries.reverse();
  copy.modifiers.reverse();
  copy.lineages.reverse();
  copy.creatures.reverse();
  copy.relationships.reverse();
  copy.memories.reverse();
  copy.pendingInfluences.reverse();
  return copy;
}

function openMeadowPath(snapshot: WorldSnapshot): void {
  snapshot.links.push({
    worldId: snapshot.world.id,
    fromId: territory(snapshot, "ridge").id,
    toId: territory(snapshot, "meadow").id,
    travelTicks: 6,
  });
}

function chosenFlee(snapshot: WorldSnapshot, tick: number): number {
  const hare = byId(snapshot, 5);
  const destination = fleeDestination(
    snapshot,
    hare.territoryId,
    aggregateTerritories(snapshot, tick),
  );
  assert.ok(destination);
  return destination.territoryId;
}

test("travel duration scales with gene speed", () => {
  assert.equal(travelDuration(8, 0), 16);
  assert.equal(travelDuration(8, 500), 8);
  assert.equal(travelDuration(8, 1000), 5);
  assert.equal(travelDuration(8, 0), Math.max(1, divRound(8000, 500)));
  assert.equal(travelDuration(8, 500), Math.max(1, divRound(8000, 1000)));
  assert.equal(travelDuration(8, 1000), Math.max(1, divRound(8000, 1500)));
  assert.equal(travelDuration(1, 1000), 1);
});

test("a flee from ridge arrives in thicket and a second visit is not a discovery", () => {
  const snapshot = world();
  const ridge = territory(snapshot, "ridge");
  const thicket = territory(snapshot, "thicket");
  const hare = byId(snapshot, 5);
  const lineage = snapshot.lineages.find((row) => row.id === hare.lineageId);
  assert.ok(lineage);
  assert.equal(hare.territoryId, ridge.id);
  assert.equal(
    snapshot.links.find(
      (link) => link.fromId === ridge.id && link.toId === thicket.id,
    )?.travelTicks,
    8,
  );
  hare.geneSpeed = 0;
  pinOthers(snapshot, hare.id);

  const duration = beginFlee(
    snapshot,
    hare,
    0,
    aggregateTerritories(snapshot, 0),
  );
  assert.equal(duration, 16);
  assert.equal(hare.currentGoal, "SEEK_SHELTER");
  assert.equal(hare.currentAction, "RELOCATE");
  assert.equal(hare.actionTargetKind, "TERRITORY");
  assert.equal(hare.actionTargetId, thicket.id);
  assert.equal(hare.actionStartedTick, 0);
  assert.equal(hare.actionEndsTick, 16);

  for (let tick = 1; tick < duration; tick += 1) {
    const passed = step(snapshot);
    assert.equal(snapshot.world.lastTick, tick);
    assert.equal(hare.territoryId, ridge.id);
    assert.equal(hare.currentAction, "RELOCATE");
    assert.deepEqual(passed.events, []);
  }

  const arrived = step(snapshot);
  assert.equal(snapshot.world.lastTick, 16);
  assert.equal(hare.territoryId, thicket.id);
  assert.ok(hare.currentAction);
  assert.equal(hare.actionStartedTick, 16);
  assert.ok(hare.actionEndsTick != null && hare.actionEndsTick > 16);
  assert.equal(arrived.events.length, 2);
  const migration = arrived.events[0];
  const discovery = arrived.events[1];
  assert.ok(migration);
  assert.ok(discovery);
  assert.equal(migration.kind, "MIGRATION");
  assert.equal(migration.id, 85);
  assert.equal(migration.tick, 16);
  assert.equal(migration.actorId, hare.id);
  assert.equal(migration.subjectId, null);
  assert.equal(migration.territoryId, thicket.id);
  assert.equal(migration.lineageId, hare.lineageId);
  assert.equal(migration.summary, `${hare.name} moved from Ridge to Thicket.`);
  assert.deepEqual(migration.payload, {
    template: "migration.v1",
    creatureId: hare.id,
    fromTerritoryId: ridge.id,
    toTerritoryId: thicket.id,
    reason: "FLEE",
  });
  assert.equal(discovery.kind, "DISCOVERY");
  assert.equal(discovery.id, 86);
  assert.equal(discovery.tick, 16);
  assert.equal(discovery.actorId, hare.id);
  assert.equal(discovery.territoryId, thicket.id);
  assert.equal(discovery.lineageId, hare.lineageId);
  assert.equal(
    discovery.summary,
    `${hare.name} of ${lineage.name} discovered Thicket.`,
  );
  assert.deepEqual(discovery.payload, {
    template: "discovery.v1",
    creatureId: hare.id,
    territoryId: thicket.id,
    lineageId: hare.lineageId,
  });
  assert.equal(snapshot.world.nextEventId, 87);
  assert.equal(snapshot.memories.length, 2);
  const migrationMemory = snapshot.memories[0];
  const discoveryMemory = snapshot.memories[1];
  assert.ok(migrationMemory);
  assert.ok(discoveryMemory);
  assert.equal(migrationMemory.kind, "MIGRATION");
  assert.equal(migrationMemory.creatureId, hare.id);
  assert.equal(migrationMemory.territoryId, thicket.id);
  assert.equal(migrationMemory.importance, 4);
  assert.equal(migrationMemory.emotionalValue, 50);
  assert.equal(
    migrationMemory.initialStrength,
    4 * snapshot.ruleset.memoryStrengthPerImportance,
  );
  assert.deepEqual(migrationMemory.payload, {
    tags: ["migration"],
    template: "migration.v1",
  });
  assert.equal(discoveryMemory.kind, "DISCOVERY");
  assert.equal(discoveryMemory.creatureId, hare.id);
  assert.equal(discoveryMemory.territoryId, thicket.id);
  assert.equal(discoveryMemory.importance, 10);
  assert.equal(discoveryMemory.emotionalValue, 300);
  assert.equal(
    discoveryMemory.initialStrength,
    10 * snapshot.ruleset.memoryStrengthPerImportance,
  );
  assert.deepEqual(discoveryMemory.payload, {
    tags: ["discovery"],
    template: "discovery.v1",
  });
  assert.equal(
    snapshot.discoveries.filter(
      (row) =>
        row.lineageId === hare.lineageId && row.territoryId === thicket.id,
    ).length,
    1,
  );
  snapshot.memories.length = 0;
  pinOthers(snapshot, hare.id);

  const back = beginRelocate(
    snapshot,
    hare,
    snapshot.world.lastTick,
    ridge.id,
    Goal.EXPLORE,
  );
  assert.equal(back, 16);
  const returned: WorldEvent[] = [];
  for (let i = 0; i < back; i += 1) returned.push(...step(snapshot).events);
  assert.equal(hare.territoryId, ridge.id);
  assert.deepEqual(
    returned.map((event) => event.kind),
    ["MIGRATION"],
  );
  assert.equal(returned[0]?.payload.template, "migration.v1");
  if (returned[0]?.payload.template !== "migration.v1") throw new Error("move");
  assert.equal(returned[0].payload.reason, "SETTLE");
  assert.equal(returned[0].payload.fromTerritoryId, thicket.id);
  assert.equal(returned[0].payload.toTerritoryId, ridge.id);
  assert.equal(snapshot.memories.length, 1);
  assert.equal(snapshot.memories[0]?.kind, "MIGRATION");
  pinOthers(snapshot, hare.id);

  const again = beginFlee(
    snapshot,
    hare,
    snapshot.world.lastTick,
    aggregateTerritories(snapshot, snapshot.world.lastTick),
  );
  assert.equal(again, 16);
  const revisit: WorldEvent[] = [];
  for (let i = 0; i < again; i += 1) revisit.push(...step(snapshot).events);
  assert.equal(hare.territoryId, thicket.id);
  assert.deepEqual(
    revisit.map((event) => event.kind),
    ["MIGRATION"],
  );
  assert.equal(revisit[0]?.payload.template, "migration.v1");
  if (revisit[0]?.payload.template !== "migration.v1") throw new Error("move");
  assert.equal(revisit[0].payload.reason, "FLEE");
  assert.equal(revisit[0].payload.toTerritoryId, thicket.id);
  // Return-trip MIGRATION memory is still hot, so the revisit is throttled.
  assert.equal(snapshot.memories.length, 1);
  assert.equal(snapshot.world.nextMemoryId, 4);
  assert.equal(snapshot.world.nextEventId, 89);
  assert.equal(
    snapshot.discoveries.filter(
      (row) =>
        row.lineageId === hare.lineageId && row.territoryId === thicket.id,
    ).length,
    1,
  );
  assert.equal(ridge.danger, 700);
  assert.equal(thicket.foodAbundance, 500);
});

test("a faster hare arrives on the shortened travel", () => {
  const snapshot = world();
  const hare = byId(snapshot, 5);
  const thicket = territory(snapshot, "thicket");
  hare.geneSpeed = 1000;
  pinOthers(snapshot, hare.id);
  const duration = beginFlee(
    snapshot,
    hare,
    0,
    aggregateTerritories(snapshot, 0),
  );
  assert.equal(duration, 5);
  for (let tick = 1; tick < 5; tick += 1) {
    step(snapshot);
    assert.equal(hare.territoryId, territory(snapshot, "ridge").id);
  }
  const arrived = step(snapshot);
  assert.equal(snapshot.world.lastTick, 5);
  assert.equal(hare.territoryId, thicket.id);
  assert.deepEqual(
    arrived.events.map((event) => event.kind),
    ["MIGRATION", "DISCOVERY"],
  );
});

test("death during travel writes no migration and stays on the origin", () => {
  const snapshot = world();
  const ridge = territory(snapshot, "ridge");
  const hare = byId(snapshot, 5);
  hare.geneSpeed = 1000;
  pinOthers(snapshot, hare.id);
  assert.equal(
    beginFlee(snapshot, hare, 0, aggregateTerritories(snapshot, 0)),
    5,
  );
  for (let tick = 0; tick < 4; tick += 1) step(snapshot);
  assert.equal(hare.territoryId, ridge.id);
  hare.hunger = 999;
  const result = step(snapshot);
  assert.equal(hare.status, "DEAD");
  assert.equal(hare.deathCause, "STARVATION");
  assert.equal(hare.deathTick, 5);
  assert.equal(hare.territoryId, ridge.id);
  assert.equal(hare.currentAction, null);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.kind, "DEATH");
  assert.equal(result.events[0]?.territoryId, ridge.id);
  assert.equal(snapshot.discoveries.length, 42);
  assert.equal(snapshot.memories.length, 0);
  assert.equal(snapshot.world.nextEventId, 86);
});

test("a traveler still counts toward the origin", () => {
  const snapshot = world();
  const ridge = territory(snapshot, "ridge");
  ridge.capacity = 1;
  const hare = byId(snapshot, 5);
  const neighbor = byId(snapshot, 6);
  hare.geneSpeed = 0;
  pinOthers(snapshot, hare.id);
  // Awake pin so overcrowding drift matches the capacity=1 fixture.
  neighbor.currentAction = "FORAGE";
  neighbor.currentGoal = Goal.FIND_FOOD;
  neighbor.actionEndsTick = 1_000_000;
  assert.equal(
    beginFlee(snapshot, hare, 0, aggregateTerritories(snapshot, 0)),
    16,
  );
  step(snapshot);
  assert.equal(hare.territoryId, ridge.id);
  assert.equal(hare.currentAction, "RELOCATE");
  assert.equal(neighbor.territoryId, ridge.id);
  // 100 + base 1 + 5 over capacity × 2 (ridge holds 6 founders now: moth,
  // marmot, bat). Ridge is moth habitat, so its danger reads 350: no
  // danger discomfort.
  assert.equal(hare.discomfort, 111);
  assert.equal(neighbor.discomfort, 111);
});

test("flee uses effective danger, then settle, then territory id", () => {
  const plain = world();
  openMeadowPath(plain);
  assert.equal(chosenFlee(plain, 0), territory(plain, "meadow").id);

  const calmed = world();
  openMeadowPath(calmed);
  const meadow = territory(calmed, "meadow");
  calmed.modifiers.push({
    id: 1,
    worldId: 1,
    territoryId: meadow.id,
    kind: "DANGER",
    amount: 300,
    startTick: 0,
    endTick: 10,
    sourceInfluenceId: null,
  });
  assert.equal(chosenFlee(calmed, 0), territory(calmed, "thicket").id);
  assert.equal(meadow.danger, 200);
  assert.equal(meadow.foodAbundance, 700);

  const later = world();
  openMeadowPath(later);
  later.modifiers.push({
    id: 1,
    worldId: 1,
    territoryId: territory(later, "meadow").id,
    kind: "DANGER",
    amount: 1000,
    startTick: 1,
    endTick: 4,
    sourceInfluenceId: null,
  });
  assert.equal(chosenFlee(later, 0), territory(later, "meadow").id);
  assert.equal(chosenFlee(later, 1), territory(later, "thicket").id);

  const settled = world();
  openMeadowPath(settled);
  settled.modifiers.push({
    id: 1,
    worldId: 1,
    territoryId: territory(settled, "meadow").id,
    kind: "DANGER",
    amount: 250,
    startTick: 0,
    endTick: 2,
    sourceInfluenceId: null,
  });
  assert.equal(chosenFlee(settled, 0), territory(settled, "meadow").id);

  const tied = world();
  openMeadowPath(tied);
  tied.modifiers.push(
    {
      id: 1,
      worldId: 1,
      territoryId: territory(tied, "meadow").id,
      kind: "DANGER",
      amount: 250,
      startTick: 0,
      endTick: 2,
      sourceInfluenceId: null,
    },
    {
      id: 2,
      worldId: 1,
      territoryId: territory(tied, "meadow").id,
      kind: "FOOD",
      amount: -200,
      startTick: 0,
      endTick: 2,
      sourceInfluenceId: null,
    },
  );
  assert.equal(chosenFlee(tied, 0), territory(tied, "meadow").id);

  const crowded = world();
  openMeadowPath(crowded);
  territory(crowded, "meadow").capacity = 0;
  crowded.modifiers.push(
    {
      id: 1,
      worldId: 1,
      territoryId: territory(crowded, "meadow").id,
      kind: "DANGER",
      amount: 250,
      startTick: 0,
      endTick: 2,
      sourceInfluenceId: null,
    },
    {
      id: 2,
      worldId: 1,
      territoryId: territory(crowded, "meadow").id,
      kind: "FOOD",
      amount: -200,
      startTick: 0,
      endTick: 2,
      sourceInfluenceId: null,
    },
  );
  assert.equal(chosenFlee(crowded, 0), territory(crowded, "thicket").id);

  const blocked = world();
  blocked.links = blocked.links.filter(
    (link) => link.fromId !== territory(blocked, "ridge").id,
  );
  assert.equal(
    beginFlee(blocked, byId(blocked, 5), 0, aggregateTerritories(blocked, 0)),
    null,
  );
  assert.equal(byId(blocked, 5).currentAction, null);
});

test("two arrivals in one tick write one discovery for the lineage", () => {
  const snapshot = world();
  const thicket = territory(snapshot, "thicket");
  const leader = byId(snapshot, 5);
  const follower = byId(snapshot, 6);
  follower.lineageId = leader.lineageId;
  leader.geneSpeed = 500;
  follower.geneSpeed = 500;
  for (const creature of snapshot.creatures) {
    if (creature.id === leader.id || creature.id === follower.id) continue;
    creature.currentGoal = Goal.SEEK_SHELTER;
    creature.currentAction = "REST";
    creature.actionEndsTick = 1_000_000;
    creature.actionStartedTick = 0;
  }
  const stats = aggregateTerritories(snapshot, 0);
  assert.equal(beginFlee(snapshot, leader, 0, stats), 8);
  assert.equal(beginFlee(snapshot, follower, 0, stats), 8);

  let events: WorldEvent[] = [];
  for (let tick = 0; tick < 8; tick += 1) events = step(snapshot).events;
  assert.equal(leader.territoryId, thicket.id);
  assert.equal(follower.territoryId, thicket.id);
  assert.deepEqual(
    events.map((event) => [event.actorId, event.kind]),
    [
      [5, "MIGRATION"],
      [5, "DISCOVERY"],
      [6, "MIGRATION"],
    ],
  );
  assert.deepEqual(
    snapshot.memories.map((memory) => [memory.creatureId, memory.kind]),
    [
      [5, "MIGRATION"],
      [5, "DISCOVERY"],
      [6, "MIGRATION"],
    ],
  );
  assert.equal(
    snapshot.discoveries.filter(
      (row) =>
        row.lineageId === leader.lineageId && row.territoryId === thicket.id,
    ).length,
    1,
  );
});

test("reversed rows flee to the same hash", () => {
  const forward = world();
  const backward = reverseArrays(world());
  pinOthers(forward, 5);
  pinOthers(backward, 5);
  const duration = beginFlee(
    forward,
    byId(forward, 5),
    0,
    aggregateTerritories(forward, 0),
  );
  assert.equal(
    beginFlee(
      backward,
      byId(backward, 5),
      0,
      aggregateTerritories(backward, 0),
    ),
    duration,
  );
  assert.ok(duration);
  let left: WorldEvent[] = [];
  let right: WorldEvent[] = [];
  for (let tick = 0; tick < duration; tick += 1) {
    left = step(forward).events;
    right = step(backward).events;
  }
  assert.deepEqual(left, right);
  assert.equal(canonicalHash(forward), canonicalHash(backward));
  assert.equal(byId(forward, 5).territoryId, territory(forward, "thicket").id);
});

test("a finished forage clears so utility can choose again", () => {
  const snapshot = world();
  const founder = byId(snapshot, 1);
  pinOthers(snapshot, founder.id);
  founder.currentAction = "FORAGE";
  founder.currentGoal = Goal.FIND_FOOD;
  founder.actionEndsTick = 1;
  founder.actionStartedTick = 0;
  founder.hunger = 500;
  founder.thirst = 100;
  founder.fatigue = 50;
  founder.discomfort = 20;
  founder.unsafety = 20;
  founder.loneliness = 20;
  founder.traitAggression = 800;
  const result = step(snapshot);
  // Drift +4 then forage relief (success 350 or fail 80) leaves hunger below 504.
  assert.ok(founder.hunger < 504);
  assert.equal(founder.territoryId, 1);
  // Slot cleared and utility started a fresh action for the next window.
  assert.ok(founder.currentAction != null);
  assert.ok(founder.actionEndsTick != null && founder.actionEndsTick > 1);
  assert.deepEqual(result.events, []);
  assert.equal(snapshot.discoveries.length, 42);
});
