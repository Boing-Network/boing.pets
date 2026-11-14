/** Camera-relative stick movement and mobile quality helpers for the pasture. */

import { getA11ySettings } from "../ui/a11ySettings";

export const STICK_DEADZONE = 0.12;

export function stickWorldDelta(
  stickX: number,
  stickY: number,
  cameraYaw: number,
): { x: number; z: number } {
  const forwardX = -Math.sin(cameraYaw);
  const forwardZ = -Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = -Math.sin(cameraYaw);
  return {
    x: stickX * rightX + stickY * forwardX,
    z: stickX * rightZ + stickY * forwardZ,
  };
}

export function stickMagnitude(stickX: number, stickY: number): number {
  return Math.hypot(stickX, stickY);
}

export function readPastureTouchPrefs(
  win: Window | undefined = typeof window === "undefined" ? undefined : window,
) {
  if (!win) {
    return { preferPerf: true, reducedMotion: false, touchControls: false };
  }
  const reducedMotion =
    win.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    getA11ySettings().reducedMotion;
  const coarse = win.matchMedia("(pointer: coarse)").matches;
  const narrow = win.matchMedia("(max-width: 900px)").matches;
  return {
    reducedMotion,
    preferPerf: reducedMotion || coarse || narrow,
    touchControls: coarse || narrow,
  };
}

export function pastureMobileDpr(preferPerf: boolean): [number, number] {
  return preferPerf ? [1, 1] : [1, 1.75];
}
