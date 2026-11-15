import { describe, expect, it } from "vitest";
import {
  SHORTCUT_HELP,
  applyMoveKey,
  clearMoveKeys,
  combinedMoveStick,
  isEditableTarget,
  keyboardStick,
  shortcutFromEvent,
} from "../src/pasture3d/keyboardShortcuts";
import { stickWorldDelta } from "../src/pasture3d/mobileControls";
import { MANUAL_EMOTE_IDS } from "../src/world/lib/emotes";

function key(
  value: string,
  extra: Partial<Parameters<typeof shortcutFromEvent>[0]> = {},
) {
  return shortcutFromEvent({ key: value, ...extra });
}

describe("pasture keyboard shortcuts", () => {
  it("maps bag, map, settings, help, interact, and emote keys", () => {
    expect(key("b")).toEqual({ type: "toggleBag" });
    expect(key("M")).toEqual({ type: "toggleMap" });
    expect(key("o")).toEqual({ type: "toggleSettings" });
    expect(key("O")).toEqual({ type: "toggleSettings" });
    expect(key("s")).toBeNull();
    expect(key("E")).toEqual({ type: "interact" });
    expect(key("f")).toEqual({ type: "toggleFullscreen" });
    expect(key("?")).toEqual({ type: "toggleHelp" });
    expect(key("/", { shiftKey: true, code: "Slash" })).toEqual({
      type: "toggleHelp",
    });
    expect(key("Escape")).toEqual({ type: "dismiss" });
    expect(key("1")).toEqual({ type: "emote", id: "wave" });
    expect(key("2")).toEqual({ type: "emote", id: "hop" });
    expect(key("3")).toEqual({ type: "emote", id: "spin" });
    expect(key("4")).toEqual({ type: "emote", id: "heart" });
    expect(MANUAL_EMOTE_IDS).toEqual(["wave", "hop", "spin", "heart"]);
  });

  it("ignores typing, modifiers, and held-key repeats", () => {
    const input = { tagName: "INPUT" } as unknown as EventTarget;
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget({ tagName: "DIV" } as unknown as EventTarget)).toBe(
      false,
    );
    expect(key("b", { target: input })).toBeNull();
    expect(key("s", { ctrlKey: true })).toBeNull();
    expect(key("m", { metaKey: true })).toBeNull();
    expect(key("e", { altKey: true })).toBeNull();
    expect(key("1", { repeat: true })).toBeNull();
    expect(key("+")).toBeNull();
  });

  it("lists keyboard shortcuts with touch equivalents for the help overlay", () => {
    const keys = SHORTCUT_HELP.map((row) => row.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "W A S D",
        "Arrows",
        "B",
        "M",
        "O",
        "1",
        "2",
        "3",
        "4",
        "E",
        "F",
        "?",
      ]),
    );
    expect(keys).not.toContain("S");
    const move = SHORTCUT_HELP.find((row) => row.key === "W A S D");
    expect(move?.action.toLowerCase()).toMatch(/character/);
    expect(move?.action.toLowerCase()).toMatch(/camera/);
    for (const row of SHORTCUT_HELP) {
      expect(row.touch.length).toBeGreaterThan(0);
      expect(row.action.length).toBeGreaterThan(0);
    }
  });

  it("maps WASD and arrows to a camera-relative move stick and ignores chat", () => {
    const flags = { forward: false, back: false, left: false, right: false };
    expect(applyMoveKey(flags, { key: "w" }, true)).toBe(true);
    expect(flags.forward).toBe(true);
    expect(applyMoveKey(flags, { key: "ArrowLeft" }, true)).toBe(true);
    const stick = keyboardStick(flags);
    expect(stick.y).toBeGreaterThan(0);
    expect(stick.x).toBeLessThan(0);
    // W runs up the screen (toward the camera, +Z) and D strafes screen-left.
    const forward = stickWorldDelta(0, 1, 0);
    expect(forward.x).toBeCloseTo(0, 5);
    expect(forward.z).toBeCloseTo(1, 5);
    const right = stickWorldDelta(1, 0, 0);
    expect(right.x).toBeCloseTo(-1, 5);
    expect(right.z).toBeCloseTo(0, 5);
    const input = { tagName: "INPUT" } as unknown as EventTarget;
    const blocked = { forward: false, back: false, left: false, right: false };
    expect(applyMoveKey(blocked, { key: "w", target: input }, true)).toBe(
      false,
    );
    expect(blocked.forward).toBe(false);
    expect(applyMoveKey(flags, { key: "s", ctrlKey: true }, true)).toBe(false);
    clearMoveKeys(flags);
    expect(keyboardStick(flags)).toEqual({ x: 0, y: 0 });
    const merged = combinedMoveStick(
      { forward: true, back: false, left: false, right: false },
      0.2,
      0,
    );
    expect(merged.y).toBe(1);
    expect(merged.x).toBeCloseTo(0.2, 5);
  });
});
