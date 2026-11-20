import assert from "node:assert/strict";
import { test } from "node:test";
import { Action, Goal } from "@boing-pets/contract";
import { behaviorFor, locomotionForSpecies } from "../src/view/motion/behavior";

test("every goal maps to a readable behavior", () => {
  for (const goal of Object.values(Goal)) {
    const behavior = behaviorFor(goal, null);
    assert.equal(typeof behavior, "string");
    assert.ok(behavior.length > 0);
  }
});

test("actions win over goals when both are set", () => {
  assert.equal(behaviorFor(Goal.IDLE, Action.FORAGE), "forage");
  assert.equal(behaviorFor(Goal.FIND_FOOD, Action.DRINK), "drink");
  assert.equal(behaviorFor(Goal.EXPLORE, Action.RELOCATE), "travel");
  assert.equal(behaviorFor(Goal.SEEK_SHELTER, Action.REST), "sleep");
  assert.equal(behaviorFor(Goal.IDLE, Action.REST), "rest");
});

test("species locomotion matches presentation skins", () => {
  assert.equal(locomotionForSpecies(1), "trot");
  assert.equal(locomotionForSpecies(2), "walk");
  assert.equal(locomotionForSpecies(3), "fly");
  assert.equal(locomotionForSpecies(4), "walk");
  assert.equal(locomotionForSpecies(5), "trot");
  assert.equal(locomotionForSpecies(6), "walk");
  assert.equal(locomotionForSpecies(7), "trot");
  assert.equal(locomotionForSpecies(99), "walk");
});
