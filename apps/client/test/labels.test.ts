import assert from "node:assert/strict";
import { test } from "node:test";
import { Action, Goal, MemoryKind } from "@boing-pets/contract";
import {
  ACTION_LABELS,
  actionLabel,
  GOAL_LABELS,
  goalLabel,
  MEMORY_LABELS,
  memoryLabel,
  memoryStrength,
  titleCase,
} from "../src/hud/labels";

/** A label a player can read: words, not an enum constant. */
function assertReadable(label: string, value: string) {
  assert.ok(label.length > 0, `${value} has an empty label`);
  assert.doesNotMatch(label, /_/, `${value} label still has an underscore`);
  assert.notEqual(label, label.toUpperCase(), `${value} label is all caps`);
  assert.match(label, /^[A-Z]/, `${value} label starts with a capital`);
}

test("every goal, action and memory kind has its own phrase", () => {
  const cases: Array<
    [Record<string, string>, Record<string, string>, (v: string) => string]
  > = [
    [Goal, GOAL_LABELS, goalLabel],
    [Action, ACTION_LABELS, actionLabel],
    [MemoryKind, MEMORY_LABELS, memoryLabel],
  ];
  for (const [values, table, label] of cases) {
    for (const value of Object.values(values)) {
      assert.ok(Object.hasOwn(table, value), `${value} has no label`);
      assertReadable(label(value), value);
    }
    // No stale entries for values the contract no longer has.
    assert.deepEqual(Object.keys(table).sort(), Object.values(values).sort());
    // Distinct phrases, so two states never read the same.
    const phrases = Object.values(table);
    assert.equal(new Set(phrases).size, phrases.length);
  }
});

test("labels read as plain phrases", () => {
  assert.equal(goalLabel(Goal.SEEK_SHELTER), "Looking for shelter");
  assert.equal(actionLabel(Action.COOPERATE_FORAGE), "Foraging together");
  assert.equal(memoryLabel(MemoryKind.FIRST_CHILD), "First child");
});

test("an unknown value falls back to title case, never throws", () => {
  assert.equal(goalLabel("BUILD_NEST"), "Build Nest");
  assert.equal(actionLabel("SWIM"), "Swim");
  assert.equal(memoryLabel("LONG_HARD_WINTER"), "Long Hard Winter");
  assert.equal(titleCase(""), "");
  // Object.prototype keys are not labels.
  assert.equal(goalLabel("constructor"), "Constructor");
});

test("memory strength becomes a word and a meter", () => {
  assert.deepEqual(memoryStrength(960), { label: "vivid", percent: 96 });
  assert.deepEqual(memoryStrength(300), { label: "vivid", percent: 30 });
  assert.deepEqual(memoryStrength(299), { label: "clear", percent: 30 });
  // A fresh everyday memory (importance 15) must not read as fading.
  assert.deepEqual(memoryStrength(180), { label: "clear", percent: 18 });
  assert.deepEqual(memoryStrength(100), { label: "clear", percent: 10 });
  assert.deepEqual(memoryStrength(99), { label: "fading", percent: 10 });
  assert.deepEqual(memoryStrength(0), { label: "fading", percent: 0 });
  // Out-of-range and broken values clamp instead of drawing a broken meter.
  assert.deepEqual(memoryStrength(5000), { label: "vivid", percent: 100 });
  assert.deepEqual(memoryStrength(-3), { label: "fading", percent: 0 });
  assert.deepEqual(memoryStrength(Number.NaN), {
    label: "fading",
    percent: 0,
  });
});
