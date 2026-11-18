/**
 * Persistence package. Prisma schema and migrations live in `prisma/`.
 * Family SQL for lineage inspection lives here until the host IPC lands.
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
