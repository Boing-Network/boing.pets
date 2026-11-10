import { describe, expect, it } from "vitest";
import {
  PASTURE_ZOOM_DEFAULT,
  PASTURE_ZOOM_MAX,
  PASTURE_ZOOM_MIN,
  cameraMinHeight,
  clampZoom,
  liftCameraAboveTerrain,
  pullCameraForOcclusion,
  resolveFollowCamera,
  zoomBySteps,
  zoomFromWheel,
  type LandmarkBox,
} from "../src/pasture3d/camera";

const barn: LandmarkBox = {
  x: 0,
  z: 0,
  halfW: 2.5,
  halfD: 2,
  minY: 0,
  maxY: 4.2,
};

describe("pasture camera", () => {
  it("clamps zoom to the configured min and max", () => {
    expect(clampZoom(0)).toBe(PASTURE_ZOOM_MIN);
    expect(clampZoom(99)).toBe(PASTURE_ZOOM_MAX);
    expect(clampZoom(Number.NaN)).toBe(PASTURE_ZOOM_DEFAULT);
    expect(clampZoom(12)).toBe(12);
  });

  it("zooms in and out from the wheel without leaving the range", () => {
    const out = zoomFromWheel(16, 400);
    const inward = zoomFromWheel(16, -400);
    expect(out).toBeGreaterThan(16);
    expect(inward).toBeLessThan(16);
    expect(zoomFromWheel(PASTURE_ZOOM_MIN, -800)).toBe(PASTURE_ZOOM_MIN);
    expect(zoomFromWheel(PASTURE_ZOOM_MAX, 800)).toBe(PASTURE_ZOOM_MAX);
    expect(zoomBySteps(16, -2)).toBeLessThan(16);
    expect(zoomBySteps(16, 2)).toBeGreaterThan(16);
  });

  it("keeps the camera at least a clearance above the terrain", () => {
    expect(cameraMinHeight(2, 1.25)).toBe(3.25);
    expect(liftCameraAboveTerrain(1, 2, 1.25)).toBe(3.25);
    expect(liftCameraAboveTerrain(8, 2, 1.25)).toBe(8);
  });

  it("pulls the camera in when a landmark blocks the look vector", () => {
    const look = { x: 0, y: 1, z: -6 };
    const cam = { x: 0, y: 2, z: 12 };
    const pulled = pullCameraForOcclusion(cam, look, [barn]);
    expect(pulled.z).toBeLessThan(cam.z);
    expect(Math.abs(pulled.x)).toBeLessThan(3);
  });

  it("resolves a follow camera that stays above ground and outside the barn", () => {
    const look = { x: 0, y: 1.15, z: 0 };
    const terrainAt = (x: number, z: number) =>
      Math.hypot(x, z) > 8 ? 3.5 : 0;
    const cam = resolveFollowCamera(look, 16, terrainAt, [barn]);
    expect(cam.y).toBeGreaterThanOrEqual(terrainAt(cam.x, cam.z) + 1.25);
    const inBarn =
      Math.abs(cam.x) < barn.halfW &&
      Math.abs(cam.z) < barn.halfD &&
      cam.y < barn.maxY;
    expect(inBarn).toBe(false);
  });
});
