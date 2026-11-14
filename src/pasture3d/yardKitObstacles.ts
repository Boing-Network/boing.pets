/** Extra A* / camera solids for kit storefronts and the skate bowl.
 *  Colliders sit behind the interact spot so the approach path stays walkable.
 */

import { PASTURE_ZONE, type WorldZoneConfig } from "../world/config/zones";
import type { LandmarkBox } from "./camera";
import type { Obstacle } from "./pathing";
import { yardFacing } from "./yardFacing";

export type KitFootprint = {
  id: string;
  landmarkId?: string;
  x: number;
  z: number;
  back: number;
  halfW: number;
  halfD: number;
  height: number;
  /** Local offset from the landmark, rotated by yardFacing (skate bowl). */
  localX?: number;
  localZ?: number;
};

function landmarkAt(id: string): { x: number; z: number } {
  const land = PASTURE_ZONE.landmarks.find((item) => item.id === id);
  if (!land) throw new Error(`missing yard kit landmark: ${id}`);
  return { x: land.position.x, z: land.position.z };
}

function withLandmark(
  id: string,
  landmarkId: string,
  back: number,
  half: number,
  height: number,
  local?: { x: number; z: number },
): KitFootprint {
  const at = landmarkAt(landmarkId);
  return {
    id,
    landmarkId,
    x: at.x,
    z: at.z,
    back,
    halfW: half,
    halfD: half,
    height,
    localX: local?.x,
    localZ: local?.z,
  };
}

/** Storefronts and the skate bowl only — small props stay walkable. */
export const YARD_KIT_FOOTPRINTS: readonly KitFootprint[] = [
  withLandmark("kit-drop", "market-stall", 3.6, 2.3, 5.0),
  withLandmark("kit-print", "crafting-station", 3.3, 1.9, 5.0),
  withLandmark("kit-fitting", "customization-station", 3.3, 1.9, 5.0),
  withLandmark("kit-home", "home-plot", 3.6, 2.2, 5.0),
  withLandmark("kit-bowl", "race-gate", 0, 3.2, 1.8, { x: 2.55, z: -4.35 }),
];

function worldFootprint(foot: KitFootprint): { x: number; z: number } {
  const rotY = yardFacing(foot.x, foot.z);
  let x = foot.x;
  let z = foot.z;
  if (foot.localX || foot.localZ) {
    const lx = foot.localX ?? 0;
    const lz = foot.localZ ?? 0;
    x += lx * Math.cos(rotY) + lz * Math.sin(rotY);
    z += -lx * Math.sin(rotY) + lz * Math.cos(rotY);
  }
  if (foot.back === 0) return { x, z };
  return {
    x: x - Math.sin(rotY) * foot.back,
    z: z - Math.cos(rotY) * foot.back,
  };
}

export function yardKitObstacles(): Obstacle[] {
  return YARD_KIT_FOOTPRINTS.map((foot) => {
    const at = worldFootprint(foot);
    return {
      id: foot.id,
      x: at.x,
      z: at.z,
      halfW: foot.halfW,
      halfD: foot.halfD,
      shape: "circle" as const,
    };
  });
}

export function yardKitCameraOccluders(groundY = -1): LandmarkBox[] {
  return YARD_KIT_FOOTPRINTS.map((foot) => {
    const at = worldFootprint(foot);
    return {
      x: at.x,
      z: at.z,
      halfW: foot.halfW,
      halfD: foot.halfD,
      minY: groundY,
      maxY: foot.height + 0.4,
    };
  });
}

/** Station centers, spawn, and the approach pad must stay walkable. */
export function yardKitBlockedPoints(
  zone: WorldZoneConfig,
): { x: number; z: number }[] {
  return [
    zone.spawn,
    ...zone.landmarks.map((item) => item.position),
    ...zone.stations.map((item) => item.position),
  ];
}
