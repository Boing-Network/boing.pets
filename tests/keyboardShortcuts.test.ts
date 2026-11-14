import { describe, expect, it } from "vitest";
import {
  SHORTCUT_HELP,
  isEditableTarget,
  shortcutFromEvent,
} from "../src/pasture3d/keyboardShortcuts";
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
    expect(key("s")).toEqual({ type: "toggleSettings" });
    expect(key("E")).toEqual({ type: "interact" });
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
      expect.arrayContaining(["B", "M", "S", "1", "2", "3", "4", "E", "?"]),
    );
    for (const row of SHORTCUT_HELP) {
      expect(row.touch.length).toBeGreaterThan(0);
      expect(row.action.length).toBeGreaterThan(0);
    }
  });
});
