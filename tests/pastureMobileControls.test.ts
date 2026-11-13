import { describe, expect, it } from "vitest";
import {
  pastureMobileDpr,
  readPastureTouchPrefs,
  stickMagnitude,
  stickWorldDelta,
  STICK_DEADZONE,
} from "../src/pasture3d/mobileControls";

describe("pasture mobile stick", () => {
  it("walks into the scene when the stick is pushed up at default yaw", () => {
    const delta = stickWorldDelta(0, 1, 0);
    expect(delta.x).toBeCloseTo(0, 5);
    expect(delta.z).toBeLessThan(0);
    expect(stickMagnitude(delta.x, delta.z)).toBeCloseTo(1, 5);
  });

  it("walks right on a default south-facing camera", () => {
    const delta = stickWorldDelta(1, 0, 0);
    expect(delta.x).toBeGreaterThan(0);
    expect(delta.z).toBeCloseTo(0, 5);
  });

  it("rotates with the follow camera yaw", () => {
    const yaw = Math.PI / 2;
    const forward = stickWorldDelta(0, 1, yaw);
    expect(forward.x).toBeCloseTo(-1, 5);
    expect(forward.z).toBeCloseTo(0, 5);
  });

  it("keeps a deadzone and a 1x cap for the mobile pixel ratio", () => {
    expect(STICK_DEADZONE).toBeGreaterThan(0);
    expect(pastureMobileDpr(true)).toEqual([1, 1]);
    expect(pastureMobileDpr(false)[1]).toBeGreaterThan(1);
  });

  it("shows touch controls on coarse or narrow viewports", () => {
    const listeners: Array<() => void> = [];
    const makeMedia = (matches: boolean) => ({
      matches,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: () => undefined,
    });
    const win = {
      matchMedia: (query: string) =>
        makeMedia(
          query.includes("pointer: coarse") ||
            query.includes("max-width: 900px"),
        ),
    } as unknown as Window;
    const prefs = readPastureTouchPrefs(win);
    expect(prefs.touchControls).toBe(true);
    expect(prefs.preferPerf).toBe(true);
  });
});
