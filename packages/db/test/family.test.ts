import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANCESTORS_SQL,
  DESCENDANTS_SQL,
  LINEAGE_ALIVE_SQL,
  LINEAGE_MEMBERS_SQL,
  isLineageExtinct,
  queryAncestors,
  queryChildren,
  queryDescendants,
  queryLineageMembers,
  querySiblings,
  type FamilyCreatureNode,
} from "../src/index";

function node(
  partial: Omit<FamilyCreatureNode, "birthTick" | "status" | "generation"> &
    Partial<Pick<FamilyCreatureNode, "birthTick" | "status" | "generation">>,
): FamilyCreatureNode {
  return {
    birthTick: partial.birthTick ?? partial.id,
    status: partial.status ?? "ALIVE",
    generation: partial.generation ?? 0,
    ...partial,
  };
}

/**
 * Three generations on one maternal bloodline:
 * founders 1 (mother) + 2 (father) → child 10 → grandchild 20.
 * Father of the grandchild is outsider 3 on a different lineage.
 */
function threeGenerations(): FamilyCreatureNode[] {
  return [
    node({
      id: 1,
      motherId: null,
      fatherId: null,
      lineageId: 100,
      generation: 0,
    }),
    node({
      id: 2,
      motherId: null,
      fatherId: null,
      lineageId: 200,
      generation: 0,
    }),
    node({
      id: 3,
      motherId: null,
      fatherId: null,
      lineageId: 300,
      generation: 0,
    }),
    node({
      id: 10,
      motherId: 1,
      fatherId: 2,
      lineageId: 100,
      generation: 1,
    }),
    node({
      id: 20,
      motherId: 10,
      fatherId: 3,
      lineageId: 100,
      generation: 2,
    }),
  ];
}

test("ANCESTORS_SQL is a recursive CTE with a depth fuse", () => {
  assert.match(ANCESTORS_SQL, /WITH RECURSIVE ancestors/i);
  assert.match(ANCESTORS_SQL, /depth < 64/);
  assert.match(ANCESTORS_SQL, /ORDER BY depth, id/i);
  assert.match(DESCENDANTS_SQL, /WITH RECURSIVE descendants/i);
  assert.match(LINEAGE_MEMBERS_SQL, /lineage_id = \$1/i);
  assert.match(LINEAGE_ALIVE_SQL, /status = 'ALIVE'/);
});

test("recursive ancestor query returns founders from a grandchild", () => {
  const creatures = threeGenerations();
  const grandchild = creatures.find((row) => row.id === 20);
  assert.ok(grandchild);
  assert.equal(grandchild.lineageId, 100);
  assert.equal(
    creatures.find((row) => row.id === 10)?.lineageId,
    grandchild.lineageId,
  );

  const ancestors = queryAncestors(creatures, 20);
  const byDepth = new Map(ancestors.map((row) => [row.id, row.depth]));

  assert.equal(byDepth.get(20), 0);
  assert.equal(byDepth.get(10), 1);
  assert.equal(byDepth.get(3), 1);
  assert.equal(byDepth.get(1), 2);
  assert.equal(byDepth.get(2), 2);

  const founders = ancestors.filter(
    (row) => row.motherId == null && row.fatherId == null && row.depth > 0,
  );
  assert.deepEqual(
    founders.map((row) => row.id).sort((a, b) => a - b),
    [1, 2, 3],
  );
});

test("child lineage follows the mother across generations", () => {
  const creatures = threeGenerations();
  const mother = creatures.find((row) => row.id === 10)!;
  const child = creatures.find((row) => row.id === 20)!;
  const father = creatures.find((row) => row.id === 3)!;
  assert.equal(child.lineageId, mother.lineageId);
  assert.notEqual(child.lineageId, father.lineageId);
});

test("children, siblings, and descendants match parent pointers", () => {
  const creatures = threeGenerations();
  assert.deepEqual(
    queryChildren(creatures, 1).map((row) => row.id),
    [10],
  );
  assert.deepEqual(
    queryChildren(creatures, 10).map((row) => row.id),
    [20],
  );
  assert.deepEqual(
    querySiblings(creatures, 10).map((row) => row.id),
    [],
  );
  const descendants = queryDescendants(creatures, 1);
  assert.deepEqual(
    descendants.filter((row) => row.depth > 0).map((row) => row.id),
    [10, 20],
  );
  assert.deepEqual(
    queryLineageMembers(creatures, 100).map((row) => row.id),
    [1, 10, 20],
  );
});

test("extinction is computed from living members, not stored", () => {
  const schemaPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../prisma/schema.prisma",
  );
  const schema = readFileSync(schemaPath, "utf8");
  const lineageModel = schema.slice(
    schema.indexOf("model Lineage"),
    schema.indexOf("model Creature"),
  );
  assert.doesNotMatch(lineageModel, /\bextinct\b/i);

  const living = threeGenerations();
  assert.equal(isLineageExtinct(living, 100), false);

  const wiped = living.map((creature) =>
    creature.lineageId === 100
      ? { ...creature, status: "DEAD" as const }
      : creature,
  );
  assert.equal(isLineageExtinct(wiped, 100), true);
  assert.equal(isLineageExtinct(wiped, 300), false);
});
