import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatchupReport } from "@boing-pets/contract";
import {
  catchupKey,
  catchupLines,
  catchupSeen,
  formatWorldSpan,
  markCatchupSeen,
} from "../src/hud/catchup";

function report(
  overrides: Partial<CatchupReport["summary"]> = {},
): CatchupReport {
  return {
    id: 4,
    worldId: 1,
    fromTick: 100,
    toTick: 1900,
    createdAtMs: 0,
    summary: {
      fromTick: 100,
      toTick: 1900,
      births: 2,
      deaths: 1,
      matings: 0,
      migrations: 3,
      discoveries: 0,
      notable: [{ eventId: 9, tick: 500, summary: "Ash was born." }],
      ...overrides,
    },
  };
}

test("world span reads in days and hours", () => {
  assert.equal(formatWorldSpan(10), "1 hour");
  assert.equal(formatWorldSpan(120), "2 hours");
  assert.equal(formatWorldSpan(1440), "1 day");
  assert.equal(formatWorldSpan(1800), "1 day 6 hours");
  assert.equal(formatWorldSpan(4 * 1440 + 60), "4 days 1 hour");
});

test("tallies keep a fixed order and drop zeros", () => {
  assert.deepEqual(
    catchupLines(report()).map((l) => `${l.count} ${l.label}`),
    ["2 births", "1 deaths", "3 migrations"],
  );
  assert.deepEqual(
    catchupLines(
      report({
        births: 0,
        deaths: 0,
        migrations: 0,
        matings: 0,
        discoveries: 0,
      }),
    ),
    [],
  );
});

test("a report is shown once per world and report", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  const r = report();
  assert.equal(catchupSeen(r, storage), false);
  markCatchupSeen(r, storage);
  assert.equal(catchupSeen(r, storage), true);
  const other = { ...r, worldId: 2 };
  assert.notEqual(catchupKey(other), catchupKey(r));
  assert.equal(catchupSeen(other, storage), false);
  assert.equal(catchupSeen(r, null), false, "no storage: always show");
  const broken = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  assert.equal(catchupSeen(r, broken), false);
  markCatchupSeen(r, broken);
});
