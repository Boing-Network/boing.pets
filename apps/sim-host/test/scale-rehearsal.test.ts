/**
 * M17 scale rehearsal harness.
 * Full 5,000 × 144 measurement runs via `npm run scale-rehearsal` (recorded
 * in fixtures/). Default CI covers the harness path at a smaller living count.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import {
  SCALE_REHEARSAL_LIVING,
  SCALE_REHEARSAL_SEED,
  SCALE_REHEARSAL_TICKS,
  formatScaleRehearsalTiming,
  runScaleRehearsal,
  type ScaleRehearsalTiming,
} from "../src/scale-rehearsal";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

test("scale rehearsal harness steps and batch-commits a seeded living world", async () => {
  const livingCount = 50;
  const ticks = SCALE_REHEARSAL_TICKS;
  const store = new MemoryWorldRepository();
  const timing = await runScaleRehearsal({
    seed: SCALE_REHEARSAL_SEED,
    livingCount,
    ticks,
    repository: store,
  });

  assert.equal(timing.livingAtStart, livingCount);
  assert.equal(timing.ticks, ticks);
  assert.equal(timing.lastTick, ticks);
  assert.ok(timing.stepMs > 0);
  assert.ok(timing.commitMs > 0);
  assert.ok(timing.totalMs >= timing.stepMs + timing.commitMs - 0.001);

  const tables = await store.readTables();
  assert.ok(tables);
  assert.equal(tables.world.lastTick, ticks);
  assert.equal(tables.creatures.length, livingCount);
});

test("recorded M17 results document the 5,000 × 144 rehearsal", async () => {
  const raw = await readFile(
    path.join(fixturesDir, "scale-rehearsal-results.json"),
    "utf8",
  );
  const timing = JSON.parse(raw) as ScaleRehearsalTiming;
  assert.equal(timing.seed, SCALE_REHEARSAL_SEED);
  assert.equal(timing.livingAtStart, SCALE_REHEARSAL_LIVING);
  assert.equal(timing.ticks, SCALE_REHEARSAL_TICKS);
  assert.equal(timing.lastTick, SCALE_REHEARSAL_TICKS);
  assert.ok(Number.isFinite(timing.stepMs) && timing.stepMs > 0);
  assert.ok(Number.isFinite(timing.commitMs) && timing.commitMs > 0);
  assert.ok(Number.isFinite(timing.totalMs) && timing.totalMs > 0);
  assert.ok(
    typeof timing.recordedAt === "string" && timing.recordedAt.length > 0,
  );
  // Round-trip formatter keeps the committed document stable.
  assert.deepEqual(formatScaleRehearsalTiming(timing), timing);
});

test(
  "full M17 rehearsal: 5,000 living creatures, 144 steps, one commit",
  { skip: process.env.SCALE_REHEARSAL !== "1" },
  async () => {
    const timing = formatScaleRehearsalTiming(await runScaleRehearsal());
    assert.equal(timing.livingAtStart, SCALE_REHEARSAL_LIVING);
    assert.equal(timing.lastTick, SCALE_REHEARSAL_TICKS);
    console.log(JSON.stringify(timing, null, 2));
  },
);
