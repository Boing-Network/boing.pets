/**
 * M12 host: offline catch-up closes a wall gap with the same step() as live
 * play, batch-commits, and writes a CatchupReport whose counts match events.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { EventKind } from "@boing-pets/contract";
import {
  buildCatchupSummary,
  canonicalHash,
  createWorld,
  owedTicks,
  runSteps,
  step,
} from "@boing-pets/sim";
import { runCatchup } from "../src/catchup";
import { pruneHotSnapshot } from "../src/persist/dirty";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { bootSession, commitSession, stepSession } from "../src/session";

const SEED = 1;
const GAP_TICKS = 1440;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("host catch-up of 1,440 ticks matches 1,440 single steps and report counts", async () => {
  const { snapshot: goldWorld } = createWorld(SEED);
  const gold = clone(goldWorld);
  const goldEvents = [];
  for (let i = 0; i < GAP_TICKS; i += 1) {
    const { events } = step(gold);
    for (const event of events) goldEvents.push(event);
  }
  // Host commits prune DEAD rows from the hot snapshot; match that view.
  pruneHotSnapshot(gold);
  const goldHash = canonicalHash(gold);
  const goldSummary = buildCatchupSummary(
    0,
    GAP_TICKS,
    goldEvents,
    gold.lineages,
  );

  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  // Stamp clockAt so a 1,440-tick wall gap is owed.
  const msPerTick = session.snapshot.ruleset.msPerTick;
  session.snapshot.world.clockAtMs = 1_000_000;
  await commitSession(session);

  const nowMs = 1_000_000 + GAP_TICKS * msPerTick;
  assert.equal(
    owedTicks(nowMs, session.snapshot.world.clockAtMs, msPerTick),
    GAP_TICKS,
  );

  const batches: number[] = [];
  const report = await runCatchup(session, nowMs, {
    createdAtMs: nowMs,
    onProgress: (progress) => {
      batches.push(progress.doneTicks);
    },
  });

  assert.ok(report);
  assert.equal(report.fromTick, 0);
  assert.equal(report.toTick, GAP_TICKS);
  assert.equal(session.snapshot.world.lastTick, GAP_TICKS);
  assert.equal(session.snapshot.world.clockAtMs, nowMs);
  assert.equal(canonicalHash(session.snapshot), goldHash);

  assert.equal(report.summary.births, goldSummary.births);
  assert.equal(report.summary.deaths, goldSummary.deaths);
  assert.equal(report.summary.matings, goldSummary.matings);
  assert.equal(report.summary.migrations, goldSummary.migrations);
  assert.equal(report.summary.discoveries, goldSummary.discoveries);
  assert.deepEqual(report.summary.notable, goldSummary.notable);

  const kindTotal =
    report.summary.births +
    report.summary.deaths +
    report.summary.matings +
    report.summary.migrations +
    report.summary.discoveries;
  assert.equal(kindTotal, goldEvents.length);

  // Batch commits every catchupBatchTicks (500) plus the final commit.
  assert.deepEqual(batches, [500, 1000, 1440]);

  const tables = await store.readTables();
  assert.ok(tables);
  assert.equal(tables.catchups.length, 1);
  assert.equal(tables.catchups[0]?.id, report.id);
  assert.equal(tables.world.lastTick, GAP_TICKS);
  assert.equal(tables.world.clockAtMs, nowMs);
});

test("catch-up with mid-gap commits still matches a continuous runSteps path", async () => {
  const ticks = 600;
  const { snapshot: continuousWorld } = createWorld(SEED);
  const continuous = clone(continuousWorld);
  const { events: continuousEvents } = runSteps(continuous, ticks);
  pruneHotSnapshot(continuous);

  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const msPerTick = session.snapshot.ruleset.msPerTick;
  session.snapshot.world.clockAtMs = 0;
  await commitSession(session);

  const report = await runCatchup(session, ticks * msPerTick, {
    createdAtMs: ticks * msPerTick,
  });
  assert.ok(report);
  assert.equal(canonicalHash(session.snapshot), canonicalHash(continuous));
  assert.equal(
    report.summary.births,
    continuousEvents.filter((e) => e.kind === EventKind.BIRTH).length,
  );
  assert.equal(
    report.summary.deaths,
    continuousEvents.filter((e) => e.kind === EventKind.DEATH).length,
  );
});

test("no catch-up when clockAt is already at or ahead of wall-now", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  session.snapshot.world.clockAtMs = 5_000_000;
  await commitSession(session);

  const report = await runCatchup(session, 4_000_000);
  assert.equal(report, null);
  assert.equal(session.snapshot.world.lastTick, 0);

  for (let i = 0; i < 3; i += 1) stepSession(session);
  await commitSession(session);
  assert.equal(session.snapshot.world.lastTick, 3);
});
