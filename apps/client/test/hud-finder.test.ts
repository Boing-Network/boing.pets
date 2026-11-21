import assert from "node:assert/strict";
import { test } from "node:test";
import { CreatureStatus } from "@boing-pets/contract";
import { needLevel } from "../src/hud/needs";
import { groupCreatures, livingSpecies } from "../src/hud/creatureFinder";

const row = (
  id: number,
  name: string,
  speciesId: number,
  status = CreatureStatus.ALIVE,
) => ({
  id,
  name,
  speciesId,
  status,
  territoryId: 1,
});

const CREATURES = [
  row(1, "Torkaeith", 1),
  row(2, "Moswrennima", 1),
  row(3, "Ariquillkae", 2),
  row(4, "Quillnimapel", 22),
  row(5, "Dead one", 22, CreatureStatus.DEAD),
];

test("groups living creatures by species, sorted, skipping the dead", () => {
  const groups = groupCreatures(CREATURES, "", null);
  assert.deepEqual(
    groups.map((g) => [g.label, g.creatures.map((c) => c.name)]),
    [
      ["Clover Vole", ["Quillnimapel"]],
      ["Fire Fox", ["Moswrennima", "Torkaeith"]],
      ["Moss Stag", ["Ariquillkae"]],
    ],
  );
});

test("search matches a creature name or its species, case-insensitively", () => {
  assert.deepEqual(
    groupCreatures(CREATURES, "  QUILL ", null).map((g) => g.label),
    ["Clover Vole", "Moss Stag"],
  );
  assert.deepEqual(
    groupCreatures(CREATURES, "fox", null).flatMap((g) =>
      g.creatures.map((c) => c.id),
    ),
    [2, 1],
  );
  assert.equal(groupCreatures(CREATURES, "zzz", null).length, 0);
});

test("species filter narrows to one species; counts ignore the dead", () => {
  assert.deepEqual(
    groupCreatures(CREATURES, "", 1).map((g) => g.speciesId),
    [1],
  );
  assert.deepEqual(
    livingSpecies(CREATURES).map((s) => [s.label, s.count]),
    [
      ["Clover Vole", 1],
      ["Fire Fox", 2],
      ["Moss Stag", 1],
    ],
  );
});

test("needs read as words and a meter, clamped to 0–1000", () => {
  assert.deepEqual(needLevel("hunger", 0), {
    label: "well fed",
    tone: 0,
    percent: 0,
  });
  assert.equal(needLevel("hunger", 300).label, "peckish");
  assert.equal(needLevel("thirst", 600).label, "thirsty");
  assert.equal(needLevel("loneliness", 900).label, "isolated");
  assert.deepEqual(needLevel("fatigue", 5000), {
    label: "exhausted",
    tone: 3,
    percent: 100,
  });
  assert.equal(needLevel("unsafety", -40).tone, 0);
});
