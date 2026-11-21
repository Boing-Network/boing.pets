/**
 * Database outages (timeouts, dropped connections) must never crash the
 * host: saves retry with backoff while the world keeps ticking in memory,
 * a retried window is saved exactly once, and /healthz degrades.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { InfluenceKind } from "@boing-pets/contract";
import { createSharedWorldHost, listenSharedWorldWs } from "../src/index";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import type { CommitBatch, DurableTables } from "../src/persist/repository";
import {
  SAVES_BLOCKED_DETAIL,
  createHostRuntime,
  type HostRuntime,
} from "../src/runtime/host-runtime";
import { createSaveTracker, describeError } from "../src/runtime/save-tracker";

const MINUTE = 60_000;

/** Memory store whose commits can fail like a Postgres outage. */
class FlakyRepository extends MemoryWorldRepository {
  /** Next N commits throw before writing (connection refused / timeout). */
  failNext = 0;
  /** Next N commits write, then throw (timeout after COMMIT landed). */
  landThenFailNext = 0;
  /** Next N readTables calls throw (boot against a restarting database). */
  failReads = 0;
  attempts = 0;
  replays = 0;

  override async commit(batch: CommitBatch): Promise<void> {
    this.attempts += 1;
    if (batch.replay === true) this.replays += 1;
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error("Connection terminated due to connection timeout");
    }
    await super.commit(batch);
    if (this.landThenFailNext > 0) {
      this.landThenFailNext -= 1;
      throw new Error(
        "Transaction API error: Unable to start a transaction in the given time.",
      );
    }
  }

  override async readTables(): Promise<DurableTables | null> {
    if (this.failReads > 0) {
      this.failReads -= 1;
      throw new Error("Can't reach database server");
    }
    return super.readTables();
  }
}

function makeRuntime(
  repository: MemoryWorldRepository,
  clock: { now: number },
  extra: Partial<Parameters<typeof createHostRuntime>[0]> = {},
): { runtime: HostRuntime; logs: string[] } {
  const logs: string[] = [];
  const runtime = createHostRuntime({
    repository,
    seed: 1,
    nowMs: () => clock.now,
    autoFrame: false,
    creatureAutonomy: false,
    emit: () => {},
    saveRetry: {
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
      downAfterMs: 5 * MINUTE,
    },
    log: (line) => logs.push(line),
    ...extra,
  });
  return { runtime, logs };
}

/** One live minute: steps one tick, and (cadence permitting) saves. */
async function liveMinute(runtime: HostRuntime, clock: { now: number }) {
  clock.now += MINUTE;
  await runtime.tickFrame(MINUTE);
}

function durableWithoutHostMeta(tables: DurableTables | null) {
  assert.ok(tables);
  // Host meta (clock preference, accept-time logs) is not world history.
  const rest: Partial<DurableTables> = { ...tables };
  delete rest.hostClock;
  delete rest.influenceAcceptedAtMs;
  delete rest.influenceAcceptedByAccount;
  return rest;
}

test("save tracker: exponential backoff, capped, and 'down' after the threshold", () => {
  const tracker = createSaveTracker(10, 0, {
    baseDelayMs: 1_000,
    maxDelayMs: 8_000,
    downAfterMs: 60_000,
  });
  assert.equal(tracker.status(10, 0).db, "ok");
  assert.equal(tracker.due(0), true);
  const delays: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    tracker.failed(new Error("timeout"), 0);
    delays.push(tracker.retryDelayMs());
  }
  assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
  assert.equal(tracker.due(7_999), false);
  assert.equal(tracker.due(8_000), true);
  const retrying = tracker.status(14, 30_000);
  assert.equal(retrying.db, "retrying");
  assert.equal(retrying.unsavedTicks, 4);
  assert.equal(retrying.saveFailures, 6);
  assert.equal(retrying.lastError, "timeout");
  assert.equal(tracker.status(14, 60_000).db, "down");
  tracker.succeeded(14, 61_000);
  const ok = tracker.status(14, 61_000);
  assert.equal(ok.db, "ok");
  assert.equal(ok.unsavedTicks, 0);
  assert.equal(ok.saveFailures, 0);
  assert.equal(ok.totalSaveFailures, 6);
});

test("error text for logs and /healthz never carries a connection string", () => {
  const text = describeError(
    new Error(
      "connect failed: postgres://user:s3cret@db.internal:5432/app?sslmode=x",
    ),
  );
  assert.ok(!text.includes("s3cret"));
  assert.match(text, /<url>/);
});

test("replay commits are idempotent: landed rows are refreshed, never duplicated", async () => {
  const repository = new MemoryWorldRepository();
  const clock = { now: 5_000_000 };
  const { runtime } = makeRuntime(repository, clock);
  await runtime.start();
  const tables = await repository.readTables();
  assert.ok(tables);
  const creature = { ...tables.creatures[0], id: 9_001, name: "Replay" };
  const event = { ...tables.events[0], id: 9_002 };
  const batch: CommitBatch = {
    world: tables.world,
    ruleset: tables.ruleset,
    insertCreatures: [creature],
    updateCreatures: [],
    insertRelationships: [],
    updateRelationships: [],
    insertMemories: [],
    archiveMemoryIds: [],
    insertModifiers: [],
    upsertLineages: [],
    insertEvents: [event],
    insertInfluences: [],
    appliedInfluenceIds: [],
    influenceAcceptedAtMs: null,
    influenceAcceptedByAccount: null,
    insertCatchup: null,
  };
  await repository.commit(batch);
  // A plain re-send is a duplicate and must be refused...
  await assert.rejects(repository.commit(batch), /already exists/);
  // ...while a replay with newer values for the same rows succeeds once.
  await repository.commit({
    ...batch,
    insertCreatures: [{ ...creature, name: "Replay (newer)" }],
    replay: true,
  });
  const after = await repository.readTables();
  assert.ok(after);
  const rows = after.creatures.filter((row) => row.id === 9_001);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Replay (newer)");
  assert.equal(after.events.filter((row) => row.id === 9_002).length, 1);
  await runtime.quit();
});

test("a save that fails (or lands then errors) keeps ticking in memory; the retry saves every tick exactly once", async () => {
  // Control: the same minutes with a healthy database.
  const controlRepo = new MemoryWorldRepository();
  const controlClock = { now: 5_000_000 };
  const control = makeRuntime(controlRepo, controlClock).runtime;
  await control.start();

  const repository = new FlakyRepository();
  const clock = { now: 5_000_000 };
  const { runtime, logs } = makeRuntime(repository, clock);
  await runtime.start();
  const startTick = runtime.session.snapshot.world.lastTick;

  // Healthy minute.
  await liveMinute(runtime, clock);
  await liveMinute(control, controlClock);
  assert.equal(runtime.persistenceStatus().db, "ok");

  // The database commits the next window but the client times out, then
  // refuses connections for a few minutes.
  repository.landThenFailNext = 1;
  repository.failNext = 3;
  for (let minute = 0; minute < 4; minute += 1) {
    await liveMinute(runtime, clock);
    await liveMinute(control, controlClock);
  }
  const degraded = runtime.persistenceStatus();
  assert.equal(degraded.db, "retrying");
  assert.equal(degraded.saveFailures, 4);
  assert.equal(degraded.lastSavedTick, startTick + 1);
  assert.equal(degraded.unsavedTicks, 4);
  // The world kept ticking in memory.
  assert.equal(runtime.session.snapshot.world.lastTick, startTick + 5);
  assert.ok(logs.some((line) => line.includes("world save failed")));

  // Database back: the next save replays the whole window.
  await liveMinute(runtime, clock);
  await liveMinute(control, controlClock);
  const healthy = runtime.persistenceStatus();
  assert.equal(healthy.db, "ok");
  assert.equal(healthy.unsavedTicks, 0);
  assert.equal(healthy.totalSaveFailures, 4);
  assert.ok(repository.replays >= 1);
  assert.ok(logs.some((line) => line.includes("world save recovered")));

  // Nothing lost, nothing duplicated: identical to the healthy run.
  assert.deepEqual(
    durableWithoutHostMeta(await repository.readTables()),
    durableWithoutHostMeta(await controlRepo.readTables()),
  );
  await runtime.quit();
  await control.quit();
});

test("retries back off instead of hammering the database", async () => {
  const repository = new FlakyRepository();
  const clock = { now: 5_000_000 };
  const { runtime } = makeRuntime(repository, clock);
  await runtime.start();
  repository.failNext = 100;
  await liveMinute(runtime, clock); // attempt 1 fails; next in 1 s
  const afterFirst = repository.attempts;
  for (let i = 0; i < 9; i += 1) {
    clock.now += 100;
    await runtime.tickFrame(100);
  }
  assert.equal(repository.attempts, afterFirst, "no retry inside the backoff");
  clock.now += 200;
  await runtime.tickFrame(200);
  assert.equal(repository.attempts, afterFirst + 1, "retry once it is due");
  repository.failNext = 0;
  clock.now += 2_000;
  await runtime.tickFrame(2_000);
  assert.equal(runtime.persistenceStatus().db, "ok");
  await runtime.quit();
});

test("influences are refused (and rolled back) while saves fail", async () => {
  const repository = new FlakyRepository();
  const clock = { now: 5_000_000 };
  const { runtime } = makeRuntime(repository, clock);
  await runtime.start();
  const territoryId = runtime.session.snapshot.territories[0].id;
  const submit = {
    message: "influence.submit" as const,
    body: {
      kind: InfluenceKind.ENRICH_TERRITORY,
      payload: { territoryId },
    },
  };

  // The influence's own commit fails: rejected, nothing applies from memory.
  const pendingBefore = runtime.session.snapshot.pendingInfluences.length;
  repository.failNext = 1;
  const failed = await runtime.handleCommand(submit);
  assert.deepEqual(failed, {
    ok: false,
    code: "influence_rejected",
    detail: SAVES_BLOCKED_DETAIL,
  });
  assert.equal(
    runtime.session.snapshot.pendingInfluences.length,
    pendingBefore,
  );
  assert.equal(runtime.persistenceStatus().db, "retrying");

  // Still failing: refused up front, the database is not touched.
  const attempts = repository.attempts;
  const refused = await runtime.handleCommand(submit);
  assert.equal(refused.ok, false);
  assert.equal(repository.attempts, attempts);

  // Recovered: accepted again.
  await liveMinute(runtime, clock);
  assert.equal(runtime.persistenceStatus().db, "ok");
  assert.deepEqual(await runtime.handleCommand(submit), { ok: true });
  await runtime.quit();
});

test("tickFrame never rejects and the frame timer raises no unhandled rejection", async () => {
  const repository = new FlakyRepository();
  const clock = { now: 5_000_000 };
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const { runtime } = makeRuntime(repository, clock, {
      // Real frame timer; every clock read is a "minute" so each frame saves.
      autoFrame: true,
      nowMs: () => (clock.now += MINUTE),
      saveRetry: { baseDelayMs: 1, maxDelayMs: 1, downAfterMs: 1e12 },
    });
    await runtime.start();
    try {
      repository.failNext = 1_000;
      await new Promise((resolve) => setTimeout(resolve, 800));
      assert.ok(repository.attempts >= 2);
      assert.equal(runtime.persistenceStatus().db, "retrying");
      await assert.doesNotReject(runtime.tickFrame(MINUTE));
    } finally {
      repository.failNext = 0;
      await runtime.quit();
    }
    assert.equal(runtime.persistenceStatus().db, "ok");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

test("quit retries the final save, and says so honestly when it cannot", async () => {
  const repository = new FlakyRepository();
  const clock = { now: 5_000_000 };
  const { runtime } = makeRuntime(repository, clock, {
    saveRetry: { baseDelayMs: 20, maxDelayMs: 40 },
    quitSaveBudgetMs: 2_000,
  });
  await runtime.start();
  await liveMinute(runtime, clock);
  repository.failNext = 2;
  clock.now += 30_000;
  await runtime.quit();
  const saved = await repository.readTables();
  assert.ok(saved);
  assert.equal(saved.world.clockAtMs, clock.now);

  const repository2 = new FlakyRepository();
  const clock2 = { now: 5_000_000 };
  const second = makeRuntime(repository2, clock2, {
    saveRetry: { baseDelayMs: 20, maxDelayMs: 40 },
    quitSaveBudgetMs: 200,
  }).runtime;
  await second.start();
  const durableTick = second.session.snapshot.world.lastTick;
  await liveMinute(second, clock2);
  repository2.failNext = 1_000;
  await liveMinute(second, clock2);
  await assert.rejects(
    second.quit(),
    new RegExp(
      `world not saved on quit .*last durable tick ${durableTick + 1}`,
    ),
  );
});

test("boot can be retried after the database refused the first attempt", async () => {
  const repository = new FlakyRepository();
  const clock = { now: 5_000_000 };
  const { runtime } = makeRuntime(repository, clock);
  repository.failReads = 1;
  await assert.rejects(runtime.start(), /Can't reach database server/);
  await runtime.start();
  assert.equal(runtime.persistenceStatus().db, "ok");
  await liveMinute(runtime, clock);
  await runtime.quit();
});

test("/healthz stays 200 while retrying and turns 503 once saves are down", async () => {
  const repository = new FlakyRepository();
  const clock = { now: 7_000_000 };
  const host = createSharedWorldHost({
    repository,
    seed: 1,
    nowMs: () => clock.now,
    autoFrame: false,
    saveRetry: {
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
      downAfterMs: 5 * MINUTE,
    },
    log: () => {},
  });
  await host.start();
  const server = await listenSharedWorldWs({
    host,
    port: 0,
    tokenSecret: randomBytes(32),
    ownerKey: "test-owner-key-123",
    heartbeatMs: 0,
    health: () => {
      const save = host.runtime.persistenceStatus();
      return {
        db: save.db,
        save,
        ...(save.db === "down" ? { ok: false } : {}),
      };
    },
  });
  const healthUrl = `${server.url.replace(/^ws/, "http")}/healthz`;
  const read = async () => {
    const res = await fetch(healthUrl);
    return {
      status: res.status,
      body: (await res.json()) as Record<string, unknown>,
    };
  };
  try {
    assert.deepEqual(((r) => [r.status, r.body.ok, r.body.db])(await read()), [
      200,
      true,
      "ok",
    ]);
    repository.failNext = 1_000;
    await liveMinute(host.runtime, clock);
    const retrying = await read();
    assert.equal(retrying.status, 200);
    assert.equal(retrying.body.ok, true);
    assert.equal(retrying.body.db, "retrying");
    for (let i = 0; i < 6; i += 1) await liveMinute(host.runtime, clock);
    const down = await read();
    assert.equal(down.status, 503);
    assert.equal(down.body.ok, false);
    assert.equal(down.body.db, "down");
    repository.failNext = 0;
    clock.now += 10_000;
    await host.runtime.tickFrame(10_000);
    const back = await read();
    assert.equal(back.status, 200);
    assert.equal(back.body.db, "ok");
  } finally {
    await server.close();
    await host.quit();
  }
});
