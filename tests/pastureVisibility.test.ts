import { Matrix4, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import {
  closestPointOnSegment,
  OCCLUDER_FADE_MIN,
  occluderOpacity,
  occluderOpacityAgainstTargets,
} from "../src/pasture3d/occluderFade";
import {
  clampLabelToViewport,
  projectLocalBoxToScreen,
  edgeFade,
  LABEL_EDGE_PAD,
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

  it("clamps labels that would clip the canvas edge and hides ones that cannot fit", () => {
    const pond = labelScreenRect(-8, 420, 28, 9);
    expect(pond.left).toBeLessThan(0);
    const clamped = clampLabelToViewport(pond, viewport);
    expect(clamped).not.toBeNull();
    expect(clamped!.left).toBe(LABEL_EDGE_PAD);
    expect(clamped!.right).toBeLessThanOrEqual(viewport.width - LABEL_EDGE_PAD);
    expect(clamped!.top).toBeGreaterThanOrEqual(LABEL_EDGE_PAD);
    expect(clamped!.bottom).toBeLessThanOrEqual(
      viewport.height - LABEL_EDGE_PAD,
    );
    expect(clamped!.dx).toBeGreaterThan(0);

    const inside = labelScreenRect(700, 420, 24, 12);
    const untouched = clampLabelToViewport(inside, viewport);
    expect(untouched?.dx).toBe(0);
    expect(untouched?.dy).toBe(0);

    const tooWide = { left: -20, top: 40, right: 1600, bottom: 80 };
    expect(clampLabelToViewport(tooWide, viewport)).toBeNull();
  });

  it("projects a local text box to a screen-space rect around the anchor", () => {
    const cam = new PerspectiveCamera(
      50,
      viewport.width / viewport.height,
      0.1,
      1000,
    );
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const matrix = new Matrix4().setPosition(0, 0, 0);
    const rect = projectLocalBoxToScreen(
      matrix,
      -1.2,
      -0.4,
      1.2,
      0.4,
      cam,
      viewport,
    );
    expect(rect.left).toBeLessThan(viewport.width / 2);
    expect(rect.right).toBeGreaterThan(viewport.width / 2);
    expect(rect.top).toBeLessThan(viewport.height / 2);
    expect(rect.bottom).toBeGreaterThan(viewport.height / 2);
    expect(rect.right - rect.left).toBeGreaterThan(rect.bottom - rect.top);
    // A box that would sit past the left edge clamps in with padding.
    const shifted = new Matrix4().setPosition(-8, 0, 0);
    const overflow = projectLocalBoxToScreen(
      shifted,
      -1.2,
      -0.4,
      1.2,
      0.4,
      cam,
      viewport,
    );
    expect(overflow.left).toBeLessThan(0);
    const clamped = clampLabelToViewport(overflow, viewport);
    expect(clamped).not.toBeNull();
    expect(clamped!.left).toBe(LABEL_EDGE_PAD);
    expect(clamped!.dx).toBeGreaterThan(0);
  });

  it("reserves the daily chip, mini-map, bag, and wallet toast", () => {
    const desktop = { width: 1400, height: 900 };
    const rects = pastureHudSafeRects(desktop.width, desktop.height, false);
    const minimap = { left: 20, top: 110, right: 140, bottom: 230 };
    const bag = { left: 20, top: 270, right: 140, bottom: 300 };
    const toast = { left: 640, top: 16, right: 760, bottom: 70 };
    const progress = { left: 1220, top: 620, right: 1380, bottom: 670 };
    expect(rects.some((r) => rectsOverlap(r, minimap))).toBe(true);
    expect(rects.some((r) => rectsOverlap(r, bag))).toBe(true);
    expect(rects.some((r) => rectsOverlap(r, toast))).toBe(true);
    expect(rects.some((r) => rectsOverlap(r, progress))).toBe(true);
    expect(
      labelHudOpacity(labelScreenRect(80, 170, 24, 16), rects, desktop),
    ).toBe(0);
    expect(
      labelHudOpacity(labelScreenRect(1300, 640, 24, 16), rects, desktop),
    ).toBe(0);

    const touch = { width: 390, height: 844 };
    const touchRects = pastureHudSafeRects(touch.width, touch.height, true);
    const touchProgress = { left: 200, top: 430, right: 370, bottom: 490 };
    const touchMap = { left: 16, top: 100, right: 148, bottom: 240 };
    expect(touchRects.some((r) => rectsOverlap(r, touchProgress))).toBe(true);
    expect(touchRects.some((r) => rectsOverlap(r, touchMap))).toBe(true);
    expect(
      labelHudOpacity(labelScreenRect(300, 450, 22, 14), touchRects, touch),
    ).toBe(0);
  });
});
