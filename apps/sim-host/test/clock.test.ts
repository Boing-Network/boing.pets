/**
 * M13: pause freezes lastTick; quit+relaunch advances the closed gap; 4×
 * runs clockAt ahead of wall-now.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { owedTicks } from "@boing-pets/sim";
import {
  advanceClock,
  createHostClock,
  pauseClock,
  persistPauseSnap,
  quitAndPersist,
  resumeClock,
  setClockScale,
  tickWhilePaused,
  PAUSE_SNAP_INTERVAL_MS,
} from "../src/clock";
import { catchupOnLaunch } from "../src/catchup";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { bootSession, commitSession } from "../src/session";

const SEED = 1;

test("pause for a simulated hour does not advance lastTick", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const msPerTick = session.snapshot.ruleset.msPerTick;
  const start = 1_000_000;
  session.snapshot.world.clockAtMs = start;
  await commitSession(session);

  const clock = createHostClock();
  const lastTickBefore = session.snapshot.world.lastTick;
  pauseClock(clock);

  // One creature-hour at 1× is 6 ticks (60 min / 10 min per tick), but the
  // acceptance gap is a wall hour while paused — discard that wall gap.
  const wallHourMs = 60 * 60 * 1000;
  const end = start + wallHourMs;

  // First snap after the 10s interval, then jump to the end of the hour.
  const mid = start + PAUSE_SNAP_INTERVAL_MS;
  assert.deepEqual(tickWhilePaused(clock, session, mid), { snapped: true });
  await persistPauseSnap(session);
  assert.equal(session.snapshot.world.clockAtMs, mid);

  // Inside the interval: no second snap.
  assert.deepEqual(
    tickWhilePaused(clock, session, mid + PAUSE_SNAP_INTERVAL_MS / 2),
    { snapped: false },
  );

  assert.deepEqual(tickWhilePaused(clock, session, end), { snapped: true });
  await persistPauseSnap(session);

  assert.equal(session.snapshot.world.lastTick, lastTickBefore);
  assert.equal(session.snapshot.world.clockAtMs, end);

  // Resume must not owe the paused hour.
  resumeClock(clock);
  assert.equal(owedTicks(end, session.snapshot.world.clockAtMs, msPerTick), 0);
  const live = advanceClock(clock, session, 100);
  assert.equal(live.ticksStepped, 0);
  assert.equal(session.snapshot.world.lastTick, lastTickBefore);
});

test("quit and relaunch advances across the closed gap", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const msPerTick = session.snapshot.ruleset.msPerTick;
  const start = 2_000_000;
  session.snapshot.world.clockAtMs = start;
  await commitSession(session);

  const clock = createHostClock();
  // Live a little so quit has a real session, then leave a partial accumulator.
  const partial = advanceClock(clock, session, msPerTick / 2);
  assert.equal(partial.ticksStepped, 0);
  assert.equal(clock.accumulatorMs, msPerTick / 2);

  // Quit stamps clockAt to wall-now (discarding the partial tick) and persists.
  const quitAt = start + 5_000;
  await quitAndPersist(clock, session, quitAt);
  assert.equal(session.snapshot.world.clockAtMs, quitAt);
  assert.equal(clock.accumulatorMs, 0);
  assert.equal(session.snapshot.world.lastTick, 0);

  // Process exits. Wall advances one creature-day (1,440 ticks).
  const gapTicks = 1_440;
  const relaunchNow = quitAt + gapTicks * msPerTick;

  const relaunched = await bootSession(store, SEED);
  assert.equal(relaunched.snapshot.world.lastTick, 0);
  assert.equal(relaunched.snapshot.world.clockAtMs, quitAt);

  const report = await catchupOnLaunch(relaunched, relaunchNow, {
    createdAtMs: relaunchNow,
  });
  assert.ok(report);
  assert.equal(report.fromTick, 0);
  assert.equal(report.toTick, gapTicks);
  assert.equal(relaunched.snapshot.world.lastTick, gapTicks);
  assert.equal(relaunched.snapshot.world.clockAtMs, relaunchNow);
});

test("4× moves clockAt into the future", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const msPerTick = session.snapshot.ruleset.msPerTick;
  const wallNow = 3_000_000;
  session.snapshot.world.clockAtMs = wallNow;
  await commitSession(session);

  const clock = createHostClock();
  setClockScale(clock, 4);

  // Four ticks of wall time at 4× yield 16 ticks of sim / clockAt advance.
  // Wall advances only 4 * msPerTick, so clockAt runs ahead.
  const wallFrames = 4;
  let wallElapsed = 0;
  for (let i = 0; i < wallFrames; i += 1) {
    const result = advanceClock(clock, session, msPerTick);
    wallElapsed += msPerTick;
    assert.equal(result.ticksStepped, 4);
  }

  const expectedClockAt = wallNow + wallFrames * 4 * msPerTick;
  assert.equal(session.snapshot.world.clockAtMs, expectedClockAt);
  assert.equal(session.snapshot.world.lastTick, wallFrames * 4);
  assert.ok(session.snapshot.world.clockAtMs > wallNow + wallElapsed);

  // Next launch owes nothing until the wall catches up.
  assert.equal(
    owedTicks(
      wallNow + wallElapsed,
      session.snapshot.world.clockAtMs,
      msPerTick,
    ),
    0,
  );
});

test("quit leaves a fast-forwarded clockAt ahead of wall-now", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const msPerTick = session.snapshot.ruleset.msPerTick;
  const wallNow = 4_000_000;
  session.snapshot.world.clockAtMs = wallNow;
  await commitSession(session);

  const clock = createHostClock({ scale: 4 });
  advanceClock(clock, session, msPerTick);
  const ahead = session.snapshot.world.clockAtMs;
  assert.ok(ahead > wallNow);

  // Quit while wall is still at wallNow + msPerTick (one frame). Leave ahead.
  await quitAndPersist(clock, session, wallNow + msPerTick);
  assert.equal(session.snapshot.world.clockAtMs, ahead);
});

test("advance while paused throws; resume clears accumulator", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const clock = createHostClock();
  pauseClock(clock);
  assert.throws(() => advanceClock(clock, session, 1000));
  resumeClock(clock);
  assert.equal(clock.accumulatorMs, 0);
});
