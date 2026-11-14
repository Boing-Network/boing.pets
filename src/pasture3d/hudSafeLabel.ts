import { Vector3, type Camera, type Matrix4 } from "three";
import { pastureHudRects } from "./hudLayout";

/** Screen-space rules so always-on-top pasture labels stay off the HUD. */

export type Rect = { left: number; top: number; right: number; bottom: number };

/** Extra padding around HUD chrome where labels begin to fade. */
export const HUD_LABEL_PAD = 16;
/** Inset from the 3D canvas edge before a label is treated as clipped. */
export const LABEL_EDGE_PAD = 16;
/** Normalized-device fade band at the viewport edge. */
export const HUD_EDGE_FADE = 0.1;

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

export function inflateRect(rect: Rect, pad: number): Rect {
  return {
    left: rect.left - pad,
    top: rect.top - pad,
    right: rect.right + pad,
    bottom: rect.bottom + pad,
  };
}

/**
 * Reserved HUD regions in CSS pixels, matching the pasture chrome
 * (Buddy chip, presence line, zoom/reset/audio, chat).
 */
export function pastureHudSafeRects(
  width: number,
  height: number,
  touchControls = false,
): Rect[] {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const hud = pastureHudRects({ width: w, height: h, touchControls });
  const fromHud = (rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }): Rect =>
    inflateRect(
      {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
      HUD_LABEL_PAD,
    );
  const rects: Rect[] = [
    // Buddy chip + presence status, top-left.
    { left: 0, top: 0, right: Math.min(w, 188), bottom: Math.min(h, 108) },
    // Camera + Settings controls, top-right (four buttons; Settings is wider).
    { left: Math.max(0, w - 120), top: 0, right: w, bottom: Math.min(h, 248) },
    // Chat form along the bottom, plus the chat log just above it.
    { left: 0, top: Math.max(0, h - 92), right: w, bottom: h },
    {
      left: 0,
      top: Math.max(0, h - 220),
      right: Math.min(w, 340),
      bottom: Math.max(0, h - 84),
    },
    fromHud(hud.emote),
    fromHud(hud.prompt),
    fromHud(hud.progress),
    fromHud(hud.minimap),
    fromHud(hud.inventory),
    fromHud(hud.txToast),
  ];
  if (hud.joystick) rects.push(fromHud(hud.joystick));
  if (hud.interact) rects.push(fromHud(hud.interact));
  return rects;
}

/** Approximate screen-space box of a centered billboard label. */
export function labelScreenRect(
  centerX: number,
  centerY: number,
  fontPx: number,
  textLength: number,
): Rect {
  const width = Math.max(fontPx * 1.1, fontPx * 0.62 * Math.max(1, textLength));
  const height = fontPx * 1.6;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
  };
}

const _corner = new Vector3();

/**
 * Project a local-space XY box (e.g. Troika text blockBounds) to a
 * CSS-pixel screen rect using the mesh world matrix.
 */
export function projectLocalBoxToScreen(
  matrixWorld: Matrix4,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  camera: Camera,
  size: { width: number; height: number },
  z = 0,
): Rect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const x of [minX, maxX]) {
    for (const y of [minY, maxY]) {
      _corner.set(x, y, z).applyMatrix4(matrixWorld).project(camera);
      const sx = (_corner.x * 0.5 + 0.5) * size.width;
      const sy = (-_corner.y * 0.5 + 0.5) * size.height;
      left = Math.min(left, sx);
      right = Math.max(right, sx);
      top = Math.min(top, sy);
      bottom = Math.max(bottom, sy);
    }
  }
  return { left, top, right, bottom };
}

export type LabelClamp = Rect & { dx: number; dy: number };

/**
 * Shift a billboard so it stays fully inside the canvas with padding.
 * Returns null when the label cannot fit (caller should hide it).
 */
export function clampLabelToViewport(
  rect: Rect,
  viewport: { width: number; height: number },
  pad = LABEL_EDGE_PAD,
): LabelClamp | null {
  const maxW = Math.max(0, viewport.width - pad * 2);
  const maxH = Math.max(0, viewport.height - pad * 2);
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (width > maxW + 0.5 || height > maxH + 0.5) return null;

  let dx = 0;
  let dy = 0;
  if (rect.left < pad) dx += pad - rect.left;
  if (rect.right + dx > viewport.width - pad) {
    dx -= rect.right + dx - (viewport.width - pad);
  }
  if (rect.top < pad) dy += pad - rect.top;
  if (rect.bottom + dy > viewport.height - pad) {
    dy -= rect.bottom + dy - (viewport.height - pad);
  }
  return {
    left: rect.left + dx,
    top: rect.top + dy,
    right: rect.right + dx,
    bottom: rect.bottom + dy,
    dx,
    dy,
  };
}

export function edgeFade(
  ndcX: number,
  ndcY: number,
  band = HUD_EDGE_FADE,
): number {
  const ax = 1 - Math.abs(ndcX);
  const ay = 1 - Math.abs(ndcY);
  const t = Math.max(0, Math.min(ax, ay));
  if (t >= band) return 1;
  if (t <= 0) return 0;
  const u = t / band;
  return u * u * (3 - 2 * u);
}

/**
 * 1 = fully visible, 0 = hidden because the label sits on HUD chrome
 * or has left the viewport.
 */
export function labelHudOpacity(
  label: Rect,
  hudRects: readonly Rect[],
  viewport: { width: number; height: number },
  ndc?: { x: number; y: number },
): number {
  if (
    label.right < 0 ||
    label.left > viewport.width ||
    label.bottom < 0 ||
    label.top > viewport.height
  ) {
    return 0;
  }
  const labelArea = Math.max(
    1,
    (label.right - label.left) * (label.bottom - label.top),
  );
  let hud = 1;
  for (const raw of hudRects) {
    const core = overlapArea(label, raw);
    if (core / labelArea > 0.12) return 0;
    const padded = inflateRect(raw, HUD_LABEL_PAD);
    const around = overlapArea(label, padded);
    if (around > 0) {
      hud = Math.min(hud, 1 - Math.min(1, around / labelArea));
    }
  }
  const edge = ndc ? edgeFade(ndc.x, ndc.y) : 1;
  return Math.max(0, Math.min(1, hud * edge));
}

/** Shrink labels that are very close to the camera so they don't balloon over the HUD. */
export function labelDistanceScale(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 1;
  return Math.max(0.55, Math.min(1, distance / 14));
}
