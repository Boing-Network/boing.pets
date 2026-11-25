/**
 * M12: a 1,440-tick gap equals 1,440 single steps (hash + event multiset).
 * CatchupReport counts match the events. Same step() as live play.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DeathCause,
  EventKind,
  EventTemplate,
  MigrationReason,
  type BirthEventPayload,
  type CatchupSummary,
} from "@boing-pets/contract";
import {
  buildCatchupSummary,
  canonicalHash,
  createWorld,
  owedTicks,
  runSteps,
  step,
  type WorldEvent,
  type WorldSnapshot,
} from "../src/index";

const SEED = 1;
/** One real day offline at msPerTick = 60_000. */
const GAP_TICKS = 1440;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function eventKey(event: WorldEvent): string {
  return [
    event.tick,
    event.id,
    event.kind,
    event.actorId ?? "",
    event.subjectId ?? "",
    event.territoryId ?? "",
    event.lineageId ?? "",
    event.summary,
  ].join("|");
}

function eventMultiset(events: readonly WorldEvent[]): string[] {
  return events.map(eventKey).sort();
}

function stepOneByOne(
  snapshot: WorldSnapshot,
  ticks: number,
): { events: WorldEvent[] } {
  const events: WorldEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(snapshot);
    for (const event of result.events) events.push(event);
  }
  return { events };
}

function assertSummaryMatchesEvents(
  summary: CatchupSummary,
  events: readonly WorldEvent[],
): void {
  assert.equal(
    summary.births,
    events.filter((e) => e.kind === EventKind.BIRTH).length,
  );
  assert.equal(
    summary.deaths,
    events.filter((e) => e.kind === EventKind.DEATH).length,
  );
  assert.equal(
    summary.matings,
    events.filter((e) => e.kind === EventKind.MATING).length,
  );
  assert.equal(
    summary.migrations,
    events.filter((e) => e.kind === EventKind.MIGRATION).length,
  );
  assert.equal(
    summary.discoveries,
    events.filter((e) => e.kind === EventKind.DISCOVERY).length,
  );
  assert.equal(
    summary.items,
    events.filter((e) => e.kind === EventKind.ITEM).length,
  );
  assert.ok(summary.notable.length <= 10);
  for (const notable of summary.notable) {
    const match = events.find((event) => event.id === notable.eventId);
    assert.ok(match, `notable event ${notable.eventId} missing`);
    assert.equal(match.tick, notable.tick);
    assert.equal(match.summary, notable.summary);
  }
}

test("1,440-tick catch-up equals 1,440 single steps (hash and event multiset)", () => {
  const { snapshot: world } = createWorld(SEED);
  assert.equal(world.world.lastTick, 0);

  const single = clone(world);
  const catchup = clone(world);

  const singleResult = stepOneByOne(single, GAP_TICKS);
  const catchupResult = runSteps(catchup, GAP_TICKS);

  assert.equal(single.world.lastTick, GAP_TICKS);
  assert.equal(catchup.world.lastTick, GAP_TICKS);
  assert.equal(canonicalHash(single), canonicalHash(catchup));
  assert.deepEqual(
    eventMultiset(singleResult.events),
    eventMultiset(catchupResult.events),
  );

  const summary = buildCatchupSummary(
    0,
    GAP_TICKS,
    catchupResult.events,
    catchup.lineages,
  );
  assert.equal(summary.fromTick, 0);
  assert.equal(summary.toTick, GAP_TICKS);
  assertSummaryMatchesEvents(summary, catchupResult.events);
});

test("CatchupSummary counts match gap events and notable stays at most 10", () => {
  const { snapshot } = createWorld(SEED);
  const { events } = runSteps(snapshot, 288);
  const summary = buildCatchupSummary(0, 288, events, snapshot.lineages);
  assertSummaryMatchesEvents(summary, events);
  assert.equal(
    summary.births +
      summary.deaths +
      summary.matings +
      summary.migrations +
      summary.discoveries +
      (summary.items ?? 0) +
      (summary.injuries ?? 0) +
      (summary.outbreaks ?? 0),
    events.length,
  );
});

test("notable prefers rare-mutation births over ordinary deaths", () => {
  const rareBirth: WorldEvent = {
    id: 10,
    worldId: 1,
    tick: 5,
    kind: EventKind.BIRTH,
    actorId: 100,
    subjectId: 1,
    territoryId: 1,
    lineageId: 1,
    summary: "rare birth",
    payload: {
      template: EventTemplate.BIRTH,
      motherId: 1,
      fatherId: 2,
      lineageId: 1,
      speciesId: 1,
      genes: {
        strength: 500,
        speed: 500,
        intelligence: 500,
        curiosity: 500,
        sociability: 500,
        extra: {},
      },
      mutations: [{ gene: "strength", delta: 90, rare: true }],
      territoryId: 1,
    } satisfies BirthEventPayload,
  };
  const death: WorldEvent = {
    id: 11,
    worldId: 1,
    tick: 50,
    kind: EventKind.DEATH,
    actorId: 3,
    subjectId: null,
    territoryId: 1,
    lineageId: 1,
    summary: "ordinary death",
    payload: {
      template: EventTemplate.DEATH,
      cause: DeathCause.OLD_AGE,
      ageDays: 10,
      territoryId: 1,
      gestationLost: false,
    },
  };
  const migration: WorldEvent = {
    id: 12,
    worldId: 1,
    tick: 60,
    kind: EventKind.MIGRATION,
    actorId: 4,
    subjectId: null,
    territoryId: 2,
    lineageId: 1,
    summary: "moved",
    payload: {
      template: EventTemplate.MIGRATION,
      creatureId: 4,
      fromTerritoryId: 1,
      toTerritoryId: 2,
      reason: MigrationReason.FLEE,
    },
  };
  const summary = buildCatchupSummary(
    0,
    60,
    [rareBirth, death, migration],
    [
      {
        id: 1,
        worldId: 1,
        founderCreatureId: 1,
        speciesId: 1,
        name: "line",
        foundedTick: 0,
        playerFavor: 0,
      },
    ],
  );
  assert.equal(summary.notable[0]?.eventId, 10);
  assert.equal(summary.notable[1]?.eventId, 11);
  assert.equal(summary.notable[2]?.eventId, 12);
});

test("owedTicks is floor((now - clockAt) / msPerTick) and never negative", () => {
  assert.equal(owedTicks(100_000, 100_000, 60_000), 0);
  assert.equal(owedTicks(99_999, 100_000, 60_000), 0);
  assert.equal(owedTicks(160_000, 100_000, 60_000), 1);
  assert.equal(owedTicks(100_000 + 1_440 * 60_000, 100_000, 60_000), 1_440);
  assert.equal(
    owedTicks(100_000 + 1_440 * 60_000 + 59_999, 100_000, 60_000),
    1_440,
  );
});
