import assert from "node:assert/strict";
import { test } from "node:test";
import {
  relocateProgress,
  splitmix64,
  tokenOffset,
} from "../src/view/presentation";

test("tokenOffset is stable for the same seed and creature", () => {
  const a = tokenOffset(1, 7, 2.4);
  const b = tokenOffset(1, 7, 2.4);
  assert.equal(a.x, b.x);
  assert.equal(a.z, b.z);
  assert.equal(a.slot, b.slot);
});

test("tokenOffset stays inside the territory visual radius", () => {
  for (let id = 1; id <= 12; id += 1) {
    const offset = tokenOffset(1, id, 2.4);
    const dist = Math.hypot(offset.x, offset.z);
    assert.ok(dist <= 2.4 + 1e-9);
  }
});

test("splitmix64 matches the presentation formula input", () => {
  const slot = splitmix64(1n ^ 3n);
  const offset = tokenOffset(1, 3, 1000);
  assert.equal(offset.slot, slot);
});

test("relocateProgress lerps across the action window", () => {
  assert.equal(relocateProgress(10, 10, 20), 0);
  assert.equal(relocateProgress(15, 10, 20), 0.5);
  assert.equal(relocateProgress(20, 10, 20), 1);
  assert.equal(relocateProgress(5, 10, 20), 0);
  assert.equal(relocateProgress(25, 10, 20), 1);
});
