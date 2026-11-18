/**
 * Lineage id assignment only. Ancestry SQL stays in the host / db package.
 * Assignment is pure pointer math — no RNG, no wall clock.
 */
import type { LineageRow } from "../types";

/** A child inherits the mother's bloodline. */
export function lineageIdForChild(mother: { lineageId: number }): number {
  return mother.lineageId;
}

/** Child generation is one past the older parent. */
export function generationForChild(
  mother: { generation: number },
  father: { generation: number },
): number {
  return Math.max(mother.generation, father.generation) + 1;
}

/** Founders allocate a new lineage named from the founder. */
export function createFounderLineage(input: {
  id: number;
  worldId: number;
  founderCreatureId: number;
  speciesId: number;
  founderName: string;
  foundedTick: number;
}): LineageRow {
  return {
    id: input.id,
    worldId: input.worldId,
    founderCreatureId: input.founderCreatureId,
    speciesId: input.speciesId,
    name: `${input.founderName} line`,
    foundedTick: input.foundedTick,
    playerFavor: 0,
  };
}
