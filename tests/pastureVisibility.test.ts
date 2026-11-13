import { describe, expect, it } from "vitest";
import {
  closestPointOnSegment,
  OCCLUDER_FADE_MIN,
  occluderOpacity,
  occluderOpacityAgainstTargets,
} from "../src/pasture3d/occluderFade";
import {
  edgeFade,
  labelDistanceScale,
  labelHudOpacity,
  labelScreenRect,
  pastureHudSafeRects,
  rectsOverlap,
} from "../src/pasture3d/hudSafeLabel";

describe("occluder fade", () => {
  const camera = { x: 0, y: 8, z: 16 };
  const pet = { x: 0, y: 1, z: 0 };

  it("places the closest point on the camera-to-pet segment", () => {
    const mid = closestPointOnSegment(camera, pet, { x: 0, y: 4.5, z: 8 });
    expect(mid.t).toBeGreaterThan(0.3);
    expect(mid.t).toBeLessThan(0.7);
    expect(mid.dist).toBeLessThan(0.2);

    const beside = closestPointOnSegment(camera, pet, { x: 10, y: 4, z: 8 });
    expect(beside.dist).toBeGreaterThan(9);

    const behind = closestPointOnSegment(camera, pet, { x: 0, y: 12, z: 24 });
    expect(behind.t).toBe(0);
  });

  it("fades a tree on the line of sight and leaves side trees solid", () => {
    const blocking = occluderOpacity(camera, pet, { x: 0, y: 3, z: 8 }, 1.4);
    expect(blocking).toBeLessThan(0.35);
    expect(blocking).toBeGreaterThanOrEqual(OCCLUDER_FADE_MIN);

    const side = occluderOpacity(camera, pet, { x: 12, y: 2, z: 8 }, 1.4);
    expect(side).toBe(1);

    const behindCamera = occluderOpacity(
      camera,
      pet,
      { x: 0, y: 10, z: 22 },
      1.4,
    );
    expect(behindCamera).toBe(1);

    const pastPet = occluderOpacity(camera, pet, { x: 0, y: 1, z: -4 }, 1.4);
    expect(pastPet).toBe(1);
  });

  it("uses the tightest fade against the pet and a nearby station", () => {
    const station = { x: 6, y: 1, z: 0 };
    const byStation = occluderOpacityAgainstTargets(
      camera,
      [pet, station],
      { x: 4, y: 3, z: 6 },
      1.6,
    );
    const petOnly = occluderOpacity(camera, pet, { x: 4, y: 3, z: 6 }, 1.6);
    const stationOnly = occluderOpacity(
      camera,
      station,
      { x: 4, y: 3, z: 6 },
      1.6,
    );
    expect(byStation).toBeCloseTo(Math.min(petOnly, stationOnly), 8);
  });
});

describe("HUD-safe labels", () => {
  const viewport = { width: 1400, height: 900 };

  it("reserves the Buddy chip, camera controls, and chat bar", () => {
    const rects = pastureHudSafeRects(viewport.width, viewport.height);
    const buddy = { left: 12, top: 12, right: 90, bottom: 52 };
    const reset = { left: 1340, top: 110, right: 1390, bottom: 154 };
    const audio = { left: 1340, top: 164, right: 1390, bottom: 208 };
    const chat = { left: 20, top: 850, right: 400, bottom: 890 };
    expect(rects.some((r) => rectsOverlap(r, buddy))).toBe(true);
    expect(rects.some((r) => rectsOverlap(r, reset))).toBe(true);
    expect(rects.some((r) => rectsOverlap(r, audio))).toBe(true);
    expect(rects.some((r) => rectsOverlap(r, chat))).toBe(true);
  });

  it("hides labels that cover HUD buttons and fades those near the edge", () => {
    const rects = pastureHudSafeRects(viewport.width, viewport.height);
    const overReset = labelScreenRect(1360, 130, 28, 22);
    expect(labelHudOpacity(overReset, rects, viewport)).toBe(0);

    const mid = labelScreenRect(700, 420, 24, 12);
    expect(labelHudOpacity(mid, rects, viewport, { x: 0, y: 0 })).toBeCloseTo(
      1,
    );

    const edge = labelHudOpacity(mid, rects, viewport, { x: 0.98, y: 0 });
    expect(edge).toBeLessThan(0.2);
    expect(edgeFade(0, 0)).toBe(1);
    expect(edgeFade(1, 0)).toBe(0);
  });

  it("scales down labels that sit very close to the camera", () => {
    expect(labelDistanceScale(40)).toBe(1);
    expect(labelDistanceScale(8)).toBeLessThan(1);
    expect(labelDistanceScale(8)).toBeGreaterThanOrEqual(0.55);
  });
});
