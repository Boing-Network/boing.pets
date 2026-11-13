import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hitHudTarget,
  hudRectCenter,
  PASTURE_CHAT_BOTTOM_PX,
  PASTURE_CHAT_CLEARANCE_PX,
  PASTURE_CHAT_INSET_PX,
  PASTURE_TOUCH_CHAT_BOTTOM_PX,
  PASTURE_TOUCH_CHAT_CLEARANCE_PX,
  pastureHudRects,
  rectsOverlap,
  waveButtonCenter,
} from "../src/pasture3d/hudLayout";

const css = readFileSync(resolve(process.cwd(), "src/style.css"), "utf8");

describe("pasture chat stays clear of emotes and touch controls", () => {
  it("keeps CSS custom properties in sync with the layout contract", () => {
    expect(PASTURE_CHAT_INSET_PX).toBe(12);
    expect(PASTURE_CHAT_BOTTOM_PX).toBe(12);
    expect(PASTURE_CHAT_CLEARANCE_PX).toBe(68);
    expect(PASTURE_TOUCH_CHAT_BOTTOM_PX).toBe(150);
    expect(PASTURE_TOUCH_CHAT_CLEARANCE_PX).toBe(206);
    expect(css).toMatch(/--pasture-chat-bottom:\s*12px/);
    expect(css).toMatch(/--pasture-chat-clearance:\s*68px/);
    expect(css).toMatch(
      /#pasture-canvas\.is-touch-controls\s*\{[^}]*--pasture-chat-bottom:\s*150px/s,
    );
    expect(css).toMatch(
      /#pasture-canvas\.is-touch-controls\s*\{[^}]*--pasture-chat-clearance:\s*206px/s,
    );
    expect(css).toMatch(
      /\.pasture-chat-form\s*\{[^}]*bottom:\s*var\(--pasture-chat-bottom/s,
    );
    expect(css).toMatch(
      /\.pasture-emote-bar\s*\{[^}]*bottom:\s*var\(--pasture-chat-clearance/s,
    );
    expect(css).not.toMatch(
      /\.pasture-3d-stage\.is-touch-controls\s+\.pasture-emote-bar\s*\{[^}]*bottom:\s*150px/s,
    );
  });

  it("keeps Wave clear of the chat form on desktop and 390x844", () => {
    const desktop = pastureHudRects({
      width: 1280,
      height: 800,
      touchControls: false,
    });
    const mobile = pastureHudRects({
      width: 390,
      height: 844,
      touchControls: true,
    });
    expect(rectsOverlap(desktop.chat, desktop.emote)).toBe(false);
    expect(rectsOverlap(mobile.chat, mobile.emote)).toBe(false);
    expect(mobile.joystick).toBeTruthy();
    expect(mobile.interact).toBeTruthy();
    expect(rectsOverlap(mobile.chat, mobile.joystick!)).toBe(false);
    expect(rectsOverlap(mobile.chat, mobile.interact!)).toBe(false);

    const desktopWave = waveButtonCenter(desktop.emote);
    expect(hitHudTarget(desktop, desktopWave.x, desktopWave.y)).toBe("emote");
    const mobileWave = waveButtonCenter(mobile.emote);
    expect(hitHudTarget(mobile, mobileWave.x, mobileWave.y)).toBe("emote");
    const interact = hudRectCenter(mobile.interact!);
    expect(hitHudTarget(mobile, interact.x, interact.y)).toBe("interact");
  });
});
