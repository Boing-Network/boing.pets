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

/** Padded height of `.pasture-emote-bar` (buttons + 6px padding). */
export const PASTURE_EMOTE_HEIGHT_PX = 52;
/** Gap between the top of the emote bar and the station prompt. */
export const PASTURE_STATION_PROMPT_GAP_PX = PASTURE_HUD_GAP_PX;
/** Extra bottom offset that lifts the prompt fully above the emote bar. */
export const PASTURE_STATION_PROMPT_RAISE_PX =
  PASTURE_EMOTE_HEIGHT_PX + PASTURE_STATION_PROMPT_GAP_PX;
export const PASTURE_STATION_PROMPT_Z_INDEX = 18;
export const PASTURE_EMOTE_Z_INDEX = 15;
export const PASTURE_STATION_PROMPT_MAX_WIDTH_PX = 420;
/** Typical prompt height with the action button and a progress line. */
export const PASTURE_STATION_PROMPT_HEIGHT_PX = 86;

/** Compact daily progress chip on the right, above the station prompt. */
export const PASTURE_PROGRESS_CHIP_WIDTH_PX = 180;
export const PASTURE_PROGRESS_CHIP_HEIGHT_PX = 58;
export const PASTURE_PROGRESS_CHIP_GAP_PX = PASTURE_HUD_GAP_PX;
export const PASTURE_PROGRESS_CHIP_Z_INDEX = 15;
export const PASTURE_PROGRESS_CHIP_RIGHT_PX = 16;

/** Compact pasture mini-map, top-left under the buddy chip and presence line. */
export const PASTURE_MINIMAP_LEFT_PX = 12;
export const PASTURE_MINIMAP_TOP_PX = 96;
export const PASTURE_MINIMAP_SIZE_PX = 140;
export const PASTURE_MINIMAP_TITLE_PX = 18;
export const PASTURE_MINIMAP_HEIGHT_PX =
  PASTURE_MINIMAP_TITLE_PX + PASTURE_MINIMAP_SIZE_PX;
export const PASTURE_MINIMAP_Z_INDEX = 15;

export function pastureProgressChipBottom(touchControls: boolean): number {
  return (
    pastureStationPromptBottom(touchControls) +
    PASTURE_STATION_PROMPT_HEIGHT_PX +
    PASTURE_PROGRESS_CHIP_GAP_PX
  );
}

export function pastureStationPromptBottom(touchControls: boolean): number {
  const emoteBottom = touchControls
    ? PASTURE_TOUCH_CHAT_CLEARANCE_PX
    : PASTURE_CHAT_CLEARANCE_PX;
  return emoteBottom + PASTURE_STATION_PROMPT_RAISE_PX;
}

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
  prompt: HudRect;
  progress: HudRect;
  minimap: HudRect;
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
  const emote: HudRect = {
    id: "emote",
    left: (width - emoteWidth) / 2,
    right: (width + emoteWidth) / 2,
    top: height - emoteBottom - PASTURE_EMOTE_HEIGHT_PX,
    bottom: height - emoteBottom,
  };
  const promptBottom = emoteBottom + PASTURE_STATION_PROMPT_RAISE_PX;
  const promptWidth = Math.min(
    PASTURE_STATION_PROMPT_MAX_WIDTH_PX,
    Math.max(0, width - 24),
  );
  const prompt: HudRect = {
    id: "prompt",
    left: (width - promptWidth) / 2,
    right: (width + promptWidth) / 2,
    top: height - promptBottom - PASTURE_STATION_PROMPT_HEIGHT_PX,
    bottom: height - promptBottom,
  };
  const progressBottom = pastureProgressChipBottom(touchControls);
  const progressWidth = Math.min(
    PASTURE_PROGRESS_CHIP_WIDTH_PX,
    Math.max(0, width - PASTURE_PROGRESS_CHIP_RIGHT_PX * 2),
  );
  const progress: HudRect = {
    id: "progress",
    left: width - PASTURE_PROGRESS_CHIP_RIGHT_PX - progressWidth,
    right: width - PASTURE_PROGRESS_CHIP_RIGHT_PX,
    top: height - progressBottom - PASTURE_PROGRESS_CHIP_HEIGHT_PX,
    bottom: height - progressBottom,
  };
  const minimap: HudRect = {
    id: "minimap",
    left: PASTURE_MINIMAP_LEFT_PX,
    right: PASTURE_MINIMAP_LEFT_PX + PASTURE_MINIMAP_SIZE_PX,
    top: PASTURE_MINIMAP_TOP_PX,
    bottom: PASTURE_MINIMAP_TOP_PX + PASTURE_MINIMAP_HEIGHT_PX,
  };
  if (!touchControls) {
    return {
      chat,
      emote,
      prompt,
      progress,
      minimap,
      joystick: null,
      interact: null,
    };
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
  return { chat, emote, prompt, progress, minimap, joystick, interact };
}

/**
 * Models the live stacking rule: #pasture-chat-form is a sibling of
 * #pasture-3d and sits above the canvas, so it wins any overlapping pixel.
 */
export function hitHudTarget(
  rects: ReturnType<typeof pastureHudRects>,
  x: number,
  y: number,
):
  | "chat"
  | "prompt"
  | "progress"
  | "minimap"
  | "emote"
  | "joystick"
  | "interact"
  | null {
  // Chat is a sibling of #pasture-3d and paints above the stage if they overlap.
  if (contains(rects.chat, x, y)) return "chat";
  // Inside the stage, the station prompt stacks above the emote bar.
  if (contains(rects.prompt, x, y)) return "prompt";
  if (contains(rects.progress, x, y)) return "progress";
  if (contains(rects.minimap, x, y)) return "minimap";
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
