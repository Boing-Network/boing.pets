/**
 * Built creature rigs, cached per species: detailed parts for close
 * creatures (animated) and one merged low-detail body for the far,
 * instanced crowd. Geometry is shared by every creature of a species.
 */
import type { BufferGeometry } from "three";
import { skinIdForSpecies } from "../../species-skins";
import { CreatureBuilder, type BuiltPart } from "./builder";
import type { RigInfo } from "./plans";
import { ANATOMY } from "./species";

export type CreatureRig = {
  info: RigInfo;
  parts: BuiltPart[];
};

const near = new Map<number, CreatureRig>();
const far = new Map<number, BufferGeometry>();

function anatomyFor(speciesId: number) {
  return ANATOMY[skinIdForSpecies(speciesId)];
}

/** Fliers hover, so they get no ground occlusion. */
function groundHeight(info: { gait: string; height: number }): number {
  return info.gait === "fly" ? 0 : info.height;
}

export function rigForSpecies(speciesId: number): CreatureRig {
  let rig = near.get(speciesId);
  if (rig == null) {
    const anatomy = anatomyFor(speciesId);
    const b = new CreatureBuilder(
      anatomy.coat,
      1,
      anatomy.pattern ?? null,
      groundHeight(anatomy.info),
    );
    anatomy.build(b);
    rig = { info: anatomy.info, parts: b.build() };
    near.set(speciesId, rig);
  }
  return rig;
}

/** One low-detail geometry of the whole body in its rest pose. */
export function farBodyForSpecies(speciesId: number): BufferGeometry {
  let geometry = far.get(speciesId);
  if (geometry == null) {
    const anatomy = anatomyFor(speciesId);
    const b = new CreatureBuilder(
      anatomy.coat,
      0.45,
      anatomy.pattern ?? null,
      groundHeight(anatomy.info),
    );
    anatomy.build(b);
    geometry = b.buildMerged();
    far.set(speciesId, geometry);
  }
  return geometry;
}

/** Triangle count of a species' detailed rig (for budgets and tests). */
export function rigTriangles(speciesId: number): number {
  let total = 0;
  for (const part of rigForSpecies(speciesId).parts) {
    total += (part.geometry.index?.count ?? 0) / 3;
  }
  return total;
}
