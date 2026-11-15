import { describe, expect, it } from "vitest";
import {
  PASTURE_CAM_PITCH_MAX,
  PASTURE_CAM_PITCH_MIN,
  PASTURE_ZOOM_DEFAULT,
  PASTURE_ZOOM_MAX,
  PASTURE_ZOOM_MIN,
  applyPointerLook,
  cameraMinHeight,
  isCanvasLookTarget,
  clampZoom,
  liftCameraAboveTerrain,
  dampFollowPoint,
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

  it("orbits with the pointer and clamps pitch", () => {
    const right = applyPointerLook(0, 0.52, 100, 0, 1);
    expect(right.yaw).toBeCloseTo(0.3, 5);
    expect(right.pitch).toBeCloseTo(0.52, 5);
    const down = applyPointerLook(0, 0.52, 0, 40, 1);
    expect(down.pitch).toBeGreaterThan(0.52);
    expect(applyPointerLook(0, 0.2, 0, -5000, 1).pitch).toBe(
      PASTURE_CAM_PITCH_MIN,
    );
    expect(applyPointerLook(0, 1, 0, 5000, 2).pitch).toBe(
      PASTURE_CAM_PITCH_MAX,
    );
    const spiked = applyPointerLook(0, 0.52, 0, 5000, 1);
    expect(spiked.pitch - 0.52).toBeGreaterThan(0.2);
    expect(spiked.pitch - 0.52).toBeLessThan(0.35);
    expect(applyPointerLook(1, 0.4, 0, 0, 1)).toEqual({ yaw: 1, pitch: 0.4 });
  });

  it("captures look only from a click on the view", () => {
    const view = {
      tagName: "CANVAS",
      closest(selector: string) {
        return selector === "canvas" ? view : null;
      },
    };
    const button = {
      tagName: "BUTTON",
      closest(selector: string) {
        if (selector.includes("button")) return button;
        return null;
      },
    };
    expect(isCanvasLookTarget(view as unknown as EventTarget)).toBe(true);
    expect(isCanvasLookTarget(button as unknown as EventTarget)).toBe(false);
    expect(isCanvasLookTarget(null)).toBe(false);
  });

  it("follows a straight run without yawing or stretching the view", () => {
    const look = { x: 0, y: 1.2, z: 0 };
    const cam = { x: 0, y: 8, z: 12 };
    let lookPos = { ...look };
    let camPos = { ...cam };
    let lookVel = { x: 0, y: 0, z: 0 };
    let camVel = { x: 0, y: 0, z: 0 };
    const speed = 5.2;
    const dt = 1 / 60;
    for (let t = 0; t < 2; t += dt) {
      lookPos = { ...lookPos, z: lookPos.z - speed * dt };
      camPos = { x: lookPos.x, y: lookPos.y + 6.8, z: lookPos.z + 12 };
      const nextLook = dampFollowPoint(look, lookVel, lookPos, dt);
      const nextCam = dampFollowPoint(cam, camVel, camPos, dt);
      Object.assign(look, nextLook.position);
      Object.assign(cam, nextCam.position);
      lookVel = nextLook.velocity;
      camVel = nextCam.velocity;
    }
    const offsetX = cam.x - look.x;
    const offsetZ = cam.z - look.z;
    expect(Math.abs(offsetX)).toBeLessThan(0.05);
    expect(offsetZ).toBeGreaterThan(11);
    expect(offsetZ).toBeLessThan(13);
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
