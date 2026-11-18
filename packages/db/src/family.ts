/**
 * Family tree SQL and in-memory equivalents.
 *
 * The recursive CTEs are the Postgres contract for `query.family` /
 * `query.lineage`. The TypeScript walkers mirror that shape so M10 can be
 * proven without a host process. Extinction is derived — never a column.
 */

/** Parent pointers for ancestry walks. Extra fields are ignored. */
export type FamilyCreatureNode = {
  id: number;
  motherId: number | null;
  fatherId: number | null;
  birthTick: number;
  lineageId: number;
  status: "ALIVE" | "DEAD" | string;
  generation: number;
};

export type AncestorRow = {
  id: number;
  motherId: number | null;
  fatherId: number | null;
  depth: number;
};

export type DescendantRow = AncestorRow;

export const CHILDREN_SQL = `
SELECT *
FROM creature
WHERE mother_id = $1 OR father_id = $1
ORDER BY birth_tick, id;
`.trim();

export const SIBLINGS_SQL = `
SELECT s.*
FROM creature c
JOIN creature s ON s.id <> c.id
 AND (
      (c.mother_id IS NOT NULL AND s.mother_id = c.mother_id)
   OR (c.father_id IS NOT NULL AND s.father_id = c.father_id)
 )
WHERE c.id = $1
ORDER BY s.birth_tick, s.id;
`.trim();

export const ANCESTORS_SQL = `
WITH RECURSIVE ancestors AS (
  SELECT id, mother_id, father_id, 0 AS depth
  FROM creature
  WHERE id = $1
  UNION
  SELECT p.id, p.mother_id, p.father_id, a.depth + 1
  FROM ancestors a
  JOIN creature p ON p.id = a.mother_id OR p.id = a.father_id
  WHERE a.depth < 64
)
SELECT * FROM ancestors ORDER BY depth, id;
`.trim();

export const DESCENDANTS_SQL = `
WITH RECURSIVE descendants AS (
  SELECT id, mother_id, father_id, 0 AS depth
  FROM creature
  WHERE id = $1
  UNION
  SELECT c.id, c.mother_id, c.father_id, d.depth + 1
  FROM descendants d
  JOIN creature c ON c.mother_id = d.id OR c.father_id = d.id
  WHERE d.depth < 64
)
SELECT * FROM descendants ORDER BY depth, id;
`.trim();

export const LINEAGE_MEMBERS_SQL = `
SELECT * FROM creature WHERE lineage_id = $1 ORDER BY birth_tick, id;
`.trim();

/** Alive members — extinction is the empty case of this query. */
export const LINEAGE_ALIVE_SQL = `
SELECT * FROM creature
WHERE lineage_id = $1 AND status = 'ALIVE'
ORDER BY birth_tick, id;
`.trim();

function byIdMap(
  creatures: ReadonlyArray<FamilyCreatureNode>,
): Map<number, FamilyCreatureNode> {
  return new Map(creatures.map((creature) => [creature.id, creature]));
}

function rowKey(row: AncestorRow): string {
  return `${row.id}:${row.motherId ?? "n"}:${row.fatherId ?? "n"}:${row.depth}`;
}

/**
 * In-memory recursive ancestor walk matching `ANCESTORS_SQL` (UNION, depth
 * cap 64). Depth 0 is the subject; founders have null parents.
 */
export function queryAncestors(
  creatures: ReadonlyArray<FamilyCreatureNode>,
  creatureId: number,
): AncestorRow[] {
  const byId = byIdMap(creatures);
  const start = byId.get(creatureId);
  if (!start) return [];

  const seen = new Set<string>();
  const results: AncestorRow[] = [];
  const frontier: AncestorRow[] = [
    {
      id: start.id,
      motherId: start.motherId,
      fatherId: start.fatherId,
      depth: 0,
    },
  ];
  seen.add(rowKey(frontier[0]!));

  while (frontier.length > 0) {
    const current = frontier.shift()!;
    results.push(current);
    if (current.depth >= 64) continue;
    for (const parentId of [current.motherId, current.fatherId]) {
      if (parentId == null) continue;
      const parent = byId.get(parentId);
      if (!parent) continue;
      const next: AncestorRow = {
        id: parent.id,
        motherId: parent.motherId,
        fatherId: parent.fatherId,
        depth: current.depth + 1,
      };
      const key = rowKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      frontier.push(next);
    }
  }

  return results.sort((a, b) => a.depth - b.depth || a.id - b.id);
}

/**
 * In-memory recursive descendant walk matching `DESCENDANTS_SQL`.
 */
export function queryDescendants(
  creatures: ReadonlyArray<FamilyCreatureNode>,
  creatureId: number,
): DescendantRow[] {
  const byId = byIdMap(creatures);
  const start = byId.get(creatureId);
  if (!start) return [];

  const childrenOf = new Map<number, FamilyCreatureNode[]>();
  for (const creature of creatures) {
    for (const parentId of [creature.motherId, creature.fatherId]) {
      if (parentId == null) continue;
      const list = childrenOf.get(parentId);
      if (list) list.push(creature);
      else childrenOf.set(parentId, [creature]);
    }
  }

  const seen = new Set<string>();
  const results: DescendantRow[] = [];
  const frontier: DescendantRow[] = [
    {
      id: start.id,
      motherId: start.motherId,
      fatherId: start.fatherId,
      depth: 0,
    },
  ];
  seen.add(rowKey(frontier[0]!));

  while (frontier.length > 0) {
    const current = frontier.shift()!;
    results.push(current);
    if (current.depth >= 64) continue;
    const kids = childrenOf.get(current.id) ?? [];
    for (const child of kids) {
      const next: DescendantRow = {
        id: child.id,
        motherId: child.motherId,
        fatherId: child.fatherId,
        depth: current.depth + 1,
      };
      const key = rowKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      frontier.push(next);
    }
  }

  return results.sort((a, b) => a.depth - b.depth || a.id - b.id);
}

export function queryChildren(
  creatures: ReadonlyArray<FamilyCreatureNode>,
  creatureId: number,
): FamilyCreatureNode[] {
  return creatures
    .filter(
      (creature) =>
        creature.motherId === creatureId || creature.fatherId === creatureId,
    )
    .slice()
    .sort((a, b) => a.birthTick - b.birthTick || a.id - b.id);
}

export function querySiblings(
  creatures: ReadonlyArray<FamilyCreatureNode>,
  creatureId: number,
): FamilyCreatureNode[] {
  const self = creatures.find((creature) => creature.id === creatureId);
  if (!self) return [];
  return creatures
    .filter((sibling) => {
      if (sibling.id === self.id) return false;
      const shareMother =
        self.motherId != null && sibling.motherId === self.motherId;
      const shareFather =
        self.fatherId != null && sibling.fatherId === self.fatherId;
      return shareMother || shareFather;
    })
    .slice()
    .sort((a, b) => a.birthTick - b.birthTick || a.id - b.id);
}

export function queryLineageMembers(
  creatures: ReadonlyArray<FamilyCreatureNode>,
  lineageId: number,
): FamilyCreatureNode[] {
  return creatures
    .filter((creature) => creature.lineageId === lineageId)
    .slice()
    .sort((a, b) => a.birthTick - b.birthTick || a.id - b.id);
}

/**
 * Extinction is computed: no ALIVE member of the lineage.
 * There is no `extinct` column on `lineage`.
 */
export function isLineageExtinct(
  creatures: ReadonlyArray<FamilyCreatureNode>,
  lineageId: number,
): boolean {
  return !creatures.some(
    (creature) =>
      creature.lineageId === lineageId && creature.status === "ALIVE",
  );
}
