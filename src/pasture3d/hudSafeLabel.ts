/** Screen-space rules so always-on-top pasture labels stay off the HUD. */

export type Rect = { left: number; top: number; right: number; bottom: number };

/** Extra padding around HUD chrome where labels begin to fade. */
export const HUD_LABEL_PAD = 16;
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
export function pastureHudSafeRects(width: number, height: number): Rect[] {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return [
    // Buddy chip + presence status, top-left.
    { left: 0, top: 0, right: Math.min(w, 188), bottom: Math.min(h, 108) },
    // Camera + audio controls, top-right (four 44px buttons + gaps).
    { left: Math.max(0, w - 108), top: 0, right: w, bottom: Math.min(h, 248) },
    // Chat form along the bottom, plus the chat log just above it.
    { left: 0, top: Math.max(0, h - 92), right: w, bottom: h },
    {
      left: 0,
      top: Math.max(0, h - 220),
      right: Math.min(w, 340),
      bottom: Math.max(0, h - 84),
    },
  ];
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
