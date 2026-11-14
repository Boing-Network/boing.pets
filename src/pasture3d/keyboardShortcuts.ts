/** Pasture keyboard shortcuts and the copy shown in the ? help overlay. */

import { MANUAL_EMOTE_IDS, type ManualEmoteId } from "../world/lib/emotes";

export type PastureShortcut =
  | { type: "toggleBag" }
  | { type: "toggleMap" }
  | { type: "toggleSettings" }
  | { type: "toggleHelp" }
  | { type: "emote"; id: ManualEmoteId }
  | { type: "interact" }
  | { type: "toggleFullscreen" }
  | { type: "dismiss" };

export type ShortcutHelpRow = {
  key: string;
  action: string;
  touch: string;
};

export const SHORTCUT_HELP: ShortcutHelpRow[] = [
  {
    key: "W A S D",
    action: "Move your character, relative to the camera",
    touch: "Joystick",
  },
  {
    key: "Arrows",
    action: "Move your character, relative to the camera",
    touch: "Joystick",
  },
  { key: "B", action: "Open or close the bag", touch: "Bag button" },
  { key: "M", action: "Show or hide the map", touch: "Map button" },
  { key: "O", action: "Open or close settings", touch: "Settings button" },
  { key: "1", action: "Wave emote", touch: "Wave" },
  { key: "2", action: "Hop emote", touch: "Hop" },
  { key: "3", action: "Spin emote", touch: "Spin" },
  { key: "4", action: "Heart emote", touch: "Heart" },
  {
    key: "E",
    action: "Interact with a nearby station",
    touch: "Interact button",
  },
  {
    key: "F",
    action: "Enter or exit full screen",
    touch: "Full-screen button",
  },
  { key: "?", action: "Open or close this help", touch: "Help (?) button" },
  {
    key: "Esc",
    action: "Close help, settings, bag, a station menu, or full screen",
    touch: "Close",
  },
];

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

export function shortcutFromEvent(event: {
  key: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  target?: EventTarget | null;
}): PastureShortcut | null {
  if (event.repeat) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isEditableTarget(event.target ?? null)) return null;
  const key = event.key;
  if (key === "Escape") return { type: "dismiss" };
  if (
    key === "?" ||
    (event.shiftKey && (key === "/" || event.code === "Slash"))
  ) {
    return { type: "toggleHelp" };
  }
  if (key === "b" || key === "B") return { type: "toggleBag" };
  if (key === "m" || key === "M") return { type: "toggleMap" };
  if (key === "o" || key === "O") return { type: "toggleSettings" };
  if (key === "e" || key === "E") return { type: "interact" };
  if (key === "f" || key === "F") return { type: "toggleFullscreen" };
  const emoteIndex =
    key === "1" || key === "2" || key === "3" || key === "4"
      ? Number(key) - 1
      : -1;
  if (emoteIndex >= 0) {
    return { type: "emote", id: MANUAL_EMOTE_IDS[emoteIndex]! };
  }
  return null;
}

export type MoveFlags = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
};

/** WASD and arrow keys, ignored while typing or with modifiers. */
export function applyMoveKey(
  flags: MoveFlags,
  event: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    target?: EventTarget | null;
  },
  down: boolean,
): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (isEditableTarget(event.target ?? null)) return false;
  const key = event.key;
  let handled = false;
  if (key === "w" || key === "W" || key === "ArrowUp") {
    flags.forward = down;
    handled = true;
  }
  if (key === "s" || key === "S" || key === "ArrowDown") {
    flags.back = down;
    handled = true;
  }
  if (key === "a" || key === "A" || key === "ArrowLeft") {
    flags.left = down;
    handled = true;
  }
  if (key === "d" || key === "D" || key === "ArrowRight") {
    flags.right = down;
    handled = true;
  }
  return handled;
}

export function clearMoveKeys(flags: MoveFlags): void {
  flags.forward = false;
  flags.back = false;
  flags.left = false;
  flags.right = false;
}

/** Keyboard vector in joystick space: +Y forward, +X right. */
export function keyboardStick(flags: MoveFlags): { x: number; y: number } {
  const x = (flags.right ? 1 : 0) - (flags.left ? 1 : 0);
  const y = (flags.forward ? 1 : 0) - (flags.back ? 1 : 0);
  const mag = Math.hypot(x, y);
  if (mag <= 0) return { x: 0, y: 0 };
  return { x: x / mag, y: y / mag };
}

export function combinedMoveStick(
  flags: MoveFlags,
  stickX: number,
  stickY: number,
): { x: number; y: number } {
  const key = keyboardStick(flags);
  return {
    x: Math.max(-1, Math.min(1, stickX + key.x)),
    y: Math.max(-1, Math.min(1, stickY + key.y)),
  };
}
