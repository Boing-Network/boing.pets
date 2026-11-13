/** Pure occlusion helpers so trees and props can fade off the camera-to-pet line. */

export type Vec3 = { x: number; y: number; z: number };

/** Lowest opacity used when something fully blocks the view. */
export const OCCLUDER_FADE_MIN = 0.18;

export function closestPointOnSegment(
  a: Vec3,
  b: Vec3,
  p: Vec3,
): { t: number; point: Vec3; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  const t =
    lenSq <= 1e-8
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / lenSq,
          ),
        );
  const point = { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t };
  const dist = Math.hypot(p.x - point.x, p.y - point.y, p.z - point.z);
  return { t, point, dist };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Opacity for an occluder near the camera→target segment. Returns 1 when the
 * point is not between them (or is well off to the side).
 */
export function occluderOpacity(
  camera: Vec3,
  target: Vec3,
  point: Vec3,
  radius: number,
  minOpacity = OCCLUDER_FADE_MIN,
): number {
  const span = Math.hypot(
    target.x - camera.x,
    target.y - camera.y,
    target.z - camera.z,
  );
  if (span < 0.4 || radius <= 0) return 1;
  // Treat occluders as vertical capsules: a tree still blocks the
  // view when the sight line passes through its trunk/canopy column.
  const { t, point: onLine } = closestPointOnSegment(camera, target, point);
  if (t < 0.08 || t > 0.94) return 1;
  const dist = Math.hypot(point.x - onLine.x, point.z - onLine.z);
  const inner = radius * 0.55;
  const outer = radius;
  if (dist >= outer) return 1;
  const clear = smoothstep(inner, outer, dist);
  return minOpacity + (1 - minOpacity) * clear;
}

/** Tightest fade against several focus points (pet, look, nearby station). */
export function occluderOpacityAgainstTargets(
  camera: Vec3,
  targets: readonly Vec3[],
  point: Vec3,
  radius: number,
  minOpacity = OCCLUDER_FADE_MIN,
): number {
  let opacity = 1;
  for (const target of targets) {
    opacity = Math.min(
      opacity,
      occluderOpacity(camera, target, point, radius, minOpacity),
    );
    if (opacity <= minOpacity) return minOpacity;
  }
  return opacity;
}
