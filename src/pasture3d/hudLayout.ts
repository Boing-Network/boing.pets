/** Shared HUD spacing so the pasture chat form stays clear of emotes and touch controls. */

export const PASTURE_CHAT_INSET_PX = 12;
export const PASTURE_CHAT_ROW_PX = 44;
export const PASTURE_HUD_GAP_PX = 12;

/** Bottom offset of the desktop chat form, from the canvas edge. */
export const PASTURE_CHAT_BOTTOM_PX = PASTURE_CHAT_INSET_PX;

/** Bottom offset for controls that must sit above the desktop chat strip. */
export const PASTURE_CHAT_CLEARANCE_PX =
  PASTURE_CHAT_BOTTOM_PX + PASTURE_CHAT_ROW_PX + PASTURE_HUD_GAP_PX;

export const PASTURE_TOUCH_JOYSTICK_SIZE_PX = 118;
export const PASTURE_TOUCH_CONTROLS_BOTTOM_PX = 16;
export const PASTURE_TOUCH_INTERACT_MIN_WIDTH_PX = 112;

/** Chat sits just above the joystick / Interact row (16 + 118 + 16). */
export const PASTURE_TOUCH_CHAT_BOTTOM_PX =
  PASTURE_TOUCH_CONTROLS_BOTTOM_PX + PASTURE_TOUCH_JOYSTICK_SIZE_PX + 16;

/** Bottom offset for the emote bar when touch controls are visible. */
export const PASTURE_TOUCH_CHAT_CLEARANCE_PX =
  PASTURE_TOUCH_CHAT_BOTTOM_PX + PASTURE_CHAT_ROW_PX + PASTURE_HUD_GAP_PX;

export type HudRect = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function contains(rect: HudRect, x: number, y: number): boolean {
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

export function rectsOverlap(a: HudRect, b: HudRect): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

export function hudRectCenter(rect: HudRect): { x: number; y: number } {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

export function pastureHudRects(opts: {
  width: number;
  height: number;
  touchControls: boolean;
}): {
  chat: HudRect;
  emote: HudRect;
  joystick: HudRect | null;
  interact: HudRect | null;
} {
  const { width, height, touchControls } = opts;
  const chatBottom = touchControls
    ? PASTURE_TOUCH_CHAT_BOTTOM_PX
    : PASTURE_CHAT_BOTTOM_PX;
  const emoteBottom = touchControls
    ? PASTURE_TOUCH_CHAT_CLEARANCE_PX
    : PASTURE_CHAT_CLEARANCE_PX;
  const chat: HudRect = {
    id: "chat",
    left: PASTURE_CHAT_INSET_PX,
    right: width - PASTURE_CHAT_INSET_PX,
    top: height - chatBottom - PASTURE_CHAT_ROW_PX,
    bottom: height - chatBottom,
  };
  const emoteWidth = Math.min(280, Math.max(0, width - 24));
  const emoteHeight = 42;
  const emote: HudRect = {
    id: "emote",
    left: (width - emoteWidth) / 2,
    right: (width + emoteWidth) / 2,
    top: height - emoteBottom - emoteHeight,
    bottom: height - emoteBottom,
  };
  if (!touchControls) {
    return { chat, emote, joystick: null, interact: null };
  }
  const joy = PASTURE_TOUCH_JOYSTICK_SIZE_PX;
  const joyBottom = PASTURE_TOUCH_CONTROLS_BOTTOM_PX;
  const joystick: HudRect = {
    id: "joystick",
    left: 16,
    right: 16 + joy,
    top: height - joyBottom - joy,
    bottom: height - joyBottom,
  };
  const interactHeight = 48;
  const interact: HudRect = {
    id: "interact",
    left: width - 16 - PASTURE_TOUCH_INTERACT_MIN_WIDTH_PX,
    right: width - 16,
    top: height - joyBottom - interactHeight,
    bottom: height - joyBottom,
  };
  return { chat, emote, joystick, interact };
}

/**
 * Models the live stacking rule: #pasture-chat-form is a sibling of
 * #pasture-3d and sits above the canvas, so it wins any overlapping pixel.
 */
export function hitHudTarget(
  rects: ReturnType<typeof pastureHudRects>,
  x: number,
  y: number,
): "chat" | "emote" | "joystick" | "interact" | null {
  if (contains(rects.chat, x, y)) return "chat";
  if (rects.interact && contains(rects.interact, x, y)) return "interact";
  if (rects.joystick && contains(rects.joystick, x, y)) return "joystick";
  if (contains(rects.emote, x, y)) return "emote";
  return null;
}

/** Approximate Wave button center: first of four equal slots in the emote bar. */
export function waveButtonCenter(emote: HudRect): { x: number; y: number } {
  const slot = (emote.right - emote.left) / 4;
  return { x: emote.left + slot / 2, y: (emote.top + emote.bottom) / 2 };
}
