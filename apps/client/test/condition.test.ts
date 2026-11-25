/**
 * Which creatures need help, and what the Inspector says about it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  creatureCondition,
  creaturesInNeed,
  healthLevel,
} from "../src/hud/condition";
import { groupCreatures } from "../src/hud/finderGroups";

const well = { hunger: 100, thirst: 100 };

test("a healthy, fed creature needs nothing", () => {
  const fine = creatureCondition({ status: "ALIVE", health: 900, needs: well });
  assert.deepEqual(fine, { level: 0, reasons: [], advice: "" });
  // An older server sends no health: nothing is flagged.
  assert.equal(creatureCondition({ status: "ALIVE", needs: well }).level, 0);
  // The dead are past helping.
  assert.equal(
    creatureCondition({ status: "DEAD", health: 0, needs: well }).level,
    0,
  );
});

test("wounds and starvation are named with what helps", () => {
  const wounded = creatureCondition({
    status: "ALIVE",
    health: 420,
    needs: well,
  });
  assert.equal(wounded.level, 1);
  assert.deepEqual(wounded.reasons, ["wounded"]);
  assert.match(wounded.advice, /Mending Potion/);

  const dying = creatureCondition({
    status: "ALIVE",
    health: 120,
    needs: { hunger: 900, thirst: 100 },
  });
  assert.equal(dying.level, 2);
  assert.deepEqual(dying.reasons, ["badly wounded", "starving"]);
  assert.match(dying.advice, /Mending Potion.*Hearty Stew/);

  const parched = creatureCondition({
    status: "ALIVE",
    health: 900,
    needs: { hunger: 100, thirst: 900 },
  });
  assert.equal(parched.level, 2);
  assert.deepEqual(parched.reasons, ["parched"]);
});

test("the list of creatures in need puts the most urgent first", () => {
  const rows = [
    { id: 1, status: "ALIVE", health: 950, needs: well },
    { id: 2, status: "ALIVE", health: 450, needs: well },
    { id: 3, status: "ALIVE", health: 90, needs: well },
    { id: 4, status: "ALIVE", health: 400, needs: well },
    { id: 5, status: "DEAD", health: 0, needs: well },
  ];
  assert.deepEqual(
    creaturesInNeed(rows).map((row) => row.id),
    [3, 4, 2],
  );
});

test("health reads as a word and a fuller-is-better meter", () => {
  assert.deepEqual(healthLevel(1000), {
    label: "healthy",
    tone: 0,
    percent: 100,
  });
  assert.equal(healthLevel(600).label, "hurt");
  assert.equal(healthLevel(499).label, "wounded");
  assert.equal(healthLevel(100).label, "badly wounded");
  assert.equal(healthLevel(-5).percent, 0);
});

test("the finder can list only the creatures in need", () => {
  const rows = [
    { id: 1, name: "Ada", speciesId: 1, status: "ALIVE", territoryId: 1 },
    { id: 2, name: "Bo", speciesId: 1, status: "ALIVE", territoryId: 1 },
    { id: 3, name: "Cy", speciesId: 2, status: "ALIVE", territoryId: 1 },
  ];
  const all = groupCreatures(rows, "", null);
  assert.equal(
    all.reduce((n, group) => n + group.creatures.length, 0),
    3,
  );
  const only = groupCreatures(rows, "", null, new Set([2]));
  assert.deepEqual(
    only.flatMap((group) => group.creatures.map((row) => row.name)),
    ["Bo"],
  );
});
