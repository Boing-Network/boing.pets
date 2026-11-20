/**
 * Far-LOD registry. A creature beyond the LOD distance hides its animated
 * parts and lists its root here; `CreatureCrowd` draws every listed
 * creature of a species with one instanced mesh. Only active while a crowd
 * is mounted, so stand-alone views (the bestiary) always draw full detail.
 */
import type { Object3D } from "three";

export const LOD_FAR = 60;
export const LOD_NEAR = 52;

export const crowd = {
  mounted: 0,
  bySpecies: new Map<number, Set<Object3D>>(),
};

export function joinCrowd(speciesId: number, root: Object3D): void {
  let set = crowd.bySpecies.get(speciesId);
  if (set == null) {
    set = new Set();
    crowd.bySpecies.set(speciesId, set);
  }
  set.add(root);
}

export function leaveCrowd(speciesId: number, root: Object3D): void {
  crowd.bySpecies.get(speciesId)?.delete(root);
}
