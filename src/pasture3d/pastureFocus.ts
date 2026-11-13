/** Shared camera / pet focus so instanced trees can fade off the view ray. */

import { PASTURE_ZONE } from "../world/config/zones";
import type { Vec3 } from "./occluderFade";

export type PastureFocus = {
  camera: Vec3;
  look: Vec3;
  pet: Vec3 | null;
  nearby: Vec3 | null;
};

const DEFAULT_FOCUS: PastureFocus = {
  camera: { x: 0, y: 11, z: 16 },
  look: { x: 0, y: 1.2, z: 6 },
  pet: null,
  nearby: null,
};

let focus: PastureFocus = { ...DEFAULT_FOCUS };
let lookOverride: Vec3 | null = null;

export function setPastureFocus(next: Partial<PastureFocus>): PastureFocus {
  focus = {
    camera: next.camera ?? focus.camera,
    look: next.look ?? focus.look,
    pet: next.pet === undefined ? focus.pet : next.pet,
    nearby: next.nearby === undefined ? focus.nearby : next.nearby,
  };
  return getPastureFocus();
}

export function setPastureLookOverride(look: Vec3 | null): void {
  lookOverride = look;
}

export function getPastureFocus(): PastureFocus {
  if (!lookOverride) return focus;
  return { ...focus, look: lookOverride };
}

export function pastureFocusTargets(
  current: PastureFocus = getPastureFocus(),
): Vec3[] {
  const targets: Vec3[] = [current.look];
  if (current.pet) targets.push(current.pet);
  if (current.nearby) targets.push(current.nearby);
  return targets;
}

export function resetPastureFocus(): void {
  focus = { ...DEFAULT_FOCUS };
  lookOverride = null;
}

const NEARBY_FOCUS_RADIUS = 10;

/** Closest station or tall landmark the pet is approaching, if any. */
export function nearbyOcclusionPoint(
  pos: { x: number; z: number },
  y = 1.2,
  radius = NEARBY_FOCUS_RADIUS,
): Vec3 | null {
  let bestX = 0;
  let bestZ = 0;
  let bestD = radius;
  let found = false;
  const consider = (x: number, z: number) => {
    const d = Math.hypot(pos.x - x, pos.z - z);
    if (d >= bestD) return;
    bestX = x;
    bestZ = z;
    bestD = d;
    found = true;
  };
  for (const station of PASTURE_ZONE.stations) {
    consider(station.position.x, station.position.z);
  }
  for (const item of PASTURE_ZONE.landmarks) {
    if (item.height < 1) continue;
    consider(item.position.x, item.position.z);
  }
  return found ? { x: bestX, y, z: bestZ } : null;
}
