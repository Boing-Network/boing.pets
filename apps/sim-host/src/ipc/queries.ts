/**
 * Host IPC query handlers for inspection.
 * Family and creature reads hit the durable store (Postgres in production,
 * DurableTables in tests) so dead parents absent from the hot snapshot still
 * appear. These handlers never call `step()`.
 */
import type {
  ClientToHost,
  CreatureQueryResult,
  CreatureView,
  FamilyQueryResult,
  LineageQueryResult,
  LineageView,
  QueryResult,
} from "@boing-pets/contract";
import {
  isLineageExtinct,
  queryAncestors,
  queryChildren,
  queryDescendants,
  queryLineageMembers,
  querySiblings,
  type FamilyCreatureNode,
} from "@boing-pets/db";
import type { CreatureRow } from "@boing-pets/sim";
import type { DurableTables } from "../persist/repository";
import {
  toCreatureView,
  toMemoryView,
  toRelationshipView,
} from "../view/world-view";

function asFamilyNode(creature: CreatureRow): FamilyCreatureNode {
  return {
    id: creature.id,
    motherId: creature.motherId,
    fatherId: creature.fatherId,
    birthTick: creature.birthTick,
    lineageId: creature.lineageId,
    status: creature.status,
    generation: creature.generation,
  };
}

function viewsForCreature(
  tables: DurableTables,
  creatureId: number,
): {
  creature: CreatureRow;
  view: CreatureView;
} | null {
  const creature = tables.creatures.find((row) => row.id === creatureId);
  if (!creature) return null;

  const tick = tables.world.lastTick;
  const relationships = tables.relationships
    .filter(
      (row) => row.creatureAId === creatureId || row.creatureBId === creatureId,
    )
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(toRelationshipView);

  const memories = tables.memories
    .filter((row) => row.creatureId === creatureId && !row.archived)
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((row) => toMemoryView(row, tick, tables.ruleset));

  return {
    creature,
    view: toCreatureView(
      creature,
      tick,
      tables.ruleset,
      relationships,
      memories,
    ),
  };
}

function requireCreatureView(
  tables: DurableTables,
  creatureId: number,
): CreatureView {
  const found = viewsForCreature(tables, creatureId);
  if (!found) {
    throw new Error(`creature ${creatureId} not found`);
  }
  return found.view;
}

/** Dead or alive. Reads durable rows — not the hot ALIVE-only snapshot. */
export function queryCreatureFromTables(
  tables: DurableTables,
  creatureId: number,
): CreatureQueryResult | null {
  return viewsForCreature(tables, creatureId)?.view ?? null;
}

/**
 * Family inspection including dead ancestors. Walkers match the Postgres CTEs
 * in `@boing-pets/db` family SQL.
 */
export function queryFamilyFromTables(
  tables: DurableTables,
  creatureId: number,
): FamilyQueryResult | null {
  if (!tables.creatures.some((row) => row.id === creatureId)) {
    return null;
  }
  const nodes = tables.creatures.map(asFamilyNode);
  const byId = new Map(tables.creatures.map((row) => [row.id, row]));

  const children = queryChildren(nodes, creatureId).map((node) =>
    requireCreatureView(tables, node.id),
  );
  const siblings = querySiblings(nodes, creatureId).map((node) =>
    requireCreatureView(tables, node.id),
  );

  const ancestors = queryAncestors(nodes, creatureId)
    .filter((row) => row.depth > 0)
    .map((row) => {
      const creature = byId.get(row.id);
      if (!creature) {
        throw new Error(`ancestor ${row.id} missing from durable store`);
      }
      return {
        creature: requireCreatureView(tables, row.id),
        depth: row.depth,
      };
    });

  const descendants = queryDescendants(nodes, creatureId)
    .filter((row) => row.depth > 0)
    .map((row) => ({
      creature: requireCreatureView(tables, row.id),
      depth: row.depth,
    }));

  return { children, siblings, ancestors, descendants };
}

export function queryLineageFromTables(
  tables: DurableTables,
  lineageId: number,
): LineageQueryResult | null {
  const lineage = tables.lineages.find((row) => row.id === lineageId);
  if (!lineage) return null;

  const nodes = tables.creatures.map(asFamilyNode);
  const extinct = isLineageExtinct(nodes, lineageId);
  const lineageView: LineageView = {
    id: lineage.id,
    name: lineage.name,
    speciesId: lineage.speciesId,
    founderCreatureId: lineage.founderCreatureId,
    foundedTick: lineage.foundedTick,
    playerFavor: lineage.playerFavor,
    extinct,
  };

  const members = queryLineageMembers(nodes, lineageId).map((node) =>
    requireCreatureView(tables, node.id),
  );

  return { lineage: lineageView, members, extinct };
}

export function queryEventsFromTables(
  tables: DurableTables,
  body: { worldId: number; fromTick: number; toTick: number; limit: number },
): QueryResult {
  const events = tables.events
    .filter(
      (event) =>
        event.worldId === body.worldId &&
        event.tick >= body.fromTick &&
        event.tick <= body.toTick,
    )
    .slice()
    .sort((a, b) => a.tick - b.tick || a.id - b.id)
    .slice(0, Math.max(0, body.limit))
    .map((event) => ({
      id: event.id,
      worldId: event.worldId,
      tick: event.tick,
      kind: event.kind,
      actorId: event.actorId,
      subjectId: event.subjectId,
      territoryId: event.territoryId,
      lineageId: event.lineageId,
      summary: event.summary,
      payload: event.payload,
    }));

  return { message: "query.events", body: { events } };
}

/**
 * Dispatch a client query against durable tables.
 * Clock / influence commands are not handled here.
 */
export function handleInspectionQuery(
  tables: DurableTables,
  message: ClientToHost,
): QueryResult {
  switch (message.message) {
    case "query.creature": {
      const body = queryCreatureFromTables(tables, message.body.creatureId);
      if (!body) {
        throw new Error(`creature ${message.body.creatureId} not found`);
      }
      return { message: "query.creature", body };
    }
    case "query.family": {
      const body = queryFamilyFromTables(tables, message.body.creatureId);
      if (!body) {
        throw new Error(`creature ${message.body.creatureId} not found`);
      }
      return { message: "query.family", body };
    }
    case "query.lineage": {
      const body = queryLineageFromTables(tables, message.body.lineageId);
      if (!body) {
        throw new Error(`lineage ${message.body.lineageId} not found`);
      }
      return { message: "query.lineage", body };
    }
    case "query.events":
      return queryEventsFromTables(tables, message.body);
    default:
      throw new Error(`not an inspection query: ${message.message}`);
  }
}
