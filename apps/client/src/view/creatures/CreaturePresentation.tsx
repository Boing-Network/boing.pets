import type { RefObject } from "react";
import type { CreaturePose } from "../motion/pose";
import { ProceduralCreature } from "./ProceduralCreature";

type Props = {
  speciesId: number;
  selected: boolean;
  pose: RefObject<CreaturePose>;
  /** Per-creature animation phase. */
  phase?: number;
};

/**
 * Draws a creature of any species: one procedural body plan per species
 * (see `anatomy/species.ts`), shared geometry and materials.
 */
export function CreaturePresentation({
  speciesId,
  selected,
  pose,
  phase,
}: Props) {
  return (
    <ProceduralCreature
      speciesId={speciesId}
      selected={selected}
      pose={pose}
      phase={phase}
    />
  );
}
