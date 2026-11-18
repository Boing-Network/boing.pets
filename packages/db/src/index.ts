/**
 * Persistence package. Prisma schema and migrations live in `prisma/`.
 * Family SQL for lineage inspection lives here until the host IPC lands.
 * Mappers convert BigInt rows to the number-shaped objects the host loads.
 */
export {
  ANCESTORS_SQL,
  CHILDREN_SQL,
  DESCENDANTS_SQL,
  LINEAGE_ALIVE_SQL,
  LINEAGE_MEMBERS_SQL,
  SIBLINGS_SQL,
  isLineageExtinct,
  queryAncestors,
  queryChildren,
  queryDescendants,
  queryLineageMembers,
  querySiblings,
  type AncestorRow,
  type DescendantRow,
  type FamilyCreatureNode,
} from "./family";

export { createDbClient, type DbClient } from "./client";
export { CURRENT_SCHEMA_VERSION } from "./schema-version";

export {
  creatureToDb,
  discoveriesFromEvents,
  mapCompatibility,
  mapCreature,
  mapInfluence,
  mapLineage,
  mapMemory,
  mapRelationship,
  mapRuleset,
  mapSpecies,
  mapTerritory,
  mapTerritoryLink,
  mapTerritoryModifier,
  mapWorldEvent,
  mapWorldHeader,
  toBigInt,
  toBigIntOrNull,
  toNumber,
  toNumberOrNull,
  worldHeaderToDb,
  type MappedCompatibility,
  type MappedCreature,
  type MappedDiscovery,
  type MappedInfluence,
  type MappedLineage,
  type MappedMemory,
  type MappedRelationship,
  type MappedSpecies,
  type MappedTerritory,
  type MappedTerritoryLink,
  type MappedTerritoryModifier,
  type MappedWorldEvent,
  type MappedWorldHeader,
} from "./mappers";
