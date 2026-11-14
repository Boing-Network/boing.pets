import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hitHudTarget,
  hudRectCenter,
  PASTURE_CHAT_BOTTOM_PX,
  PASTURE_CHAT_CLEARANCE_PX,
  PASTURE_CHAT_INSET_PX,
  PASTURE_EMOTE_HEIGHT_PX,
  PASTURE_EMOTE_Z_INDEX,
  PASTURE_STATION_PROMPT_GAP_PX,
  PASTURE_STATION_PROMPT_RAISE_PX,
  PASTURE_STATION_PROMPT_Z_INDEX,
  PASTURE_TOUCH_CHAT_BOTTOM_PX,
  PASTURE_TOUCH_CHAT_CLEARANCE_PX,
  pastureHudRects,
  pastureProgressChipBottom,
  PASTURE_MINIMAP_HEIGHT_PX,
  PASTURE_MINIMAP_LEFT_PX,
  PASTURE_MINIMAP_SIZE_PX,
  PASTURE_MINIMAP_TOP_PX,
  PASTURE_TX_TOAST_HEIGHT_PX,
  PASTURE_TX_TOAST_SIDE_CLEAR_PX,
  PASTURE_TX_TOAST_TOP_PX,
  PASTURE_PROGRESS_CHIP_GAP_PX,
  PASTURE_PROGRESS_CHIP_HEIGHT_PX,
  PASTURE_STATION_PROMPT_HEIGHT_PX,
  pastureStationPromptBottom,
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
    expect(PASTURE_EMOTE_HEIGHT_PX).toBe(52);
    expect(PASTURE_STATION_PROMPT_GAP_PX).toBe(12);
    expect(PASTURE_STATION_PROMPT_RAISE_PX).toBe(64);
    expect(pastureStationPromptBottom(false)).toBe(132);
    expect(pastureStationPromptBottom(true)).toBe(270);
    expect(css).toMatch(/--pasture-emote-height:\s*52px/);
    expect(css).toMatch(/--pasture-station-prompt-gap:\s*12px/);
    expect(css).toMatch(/\.pasture-station-prompt\s*\{[^}]*z-index:\s*18/s);
    expect(css).toMatch(/\.pasture-emote-bar\s*\{[^}]*z-index:\s*15/s);
    expect(PASTURE_STATION_PROMPT_Z_INDEX).toBeGreaterThan(
      PASTURE_EMOTE_Z_INDEX,
    );
    expect(css).toMatch(
      /\.pasture-station-prompt\s*\{[^}]*bottom:\s*calc\(\s*var\(--pasture-chat-clearance/s,
    );
    expect(PASTURE_STATION_PROMPT_HEIGHT_PX).toBe(86);
    expect(pastureProgressChipBottom(false)).toBe(230);
    expect(pastureProgressChipBottom(true)).toBe(368);
    expect(css).toMatch(/--pasture-station-prompt-height:\s*86px/);
    expect(css).toMatch(/--pasture-progress-chip-gap:\s*12px/);
    expect(css).toMatch(/\.pasture-dailies-chip\s*\{[^}]*bottom:\s*calc\(/s);
    expect(css).not.toMatch(
      /\.pasture-3d-stage\.is-touch-controls\s+\.pasture-dailies-chip\s*\{[^}]*top:\s*86px/s,
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

  it("keeps the station prompt fully above the emote bar with a gap", () => {
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
    for (const layout of [desktop, mobile]) {
      expect(rectsOverlap(layout.prompt, layout.emote)).toBe(false);
      expect(rectsOverlap(layout.prompt, layout.chat)).toBe(false);
      expect(layout.emote.top - layout.prompt.bottom).toBe(
        PASTURE_STATION_PROMPT_GAP_PX,
      );
      const promptBtn = hudRectCenter(layout.prompt);
      expect(hitHudTarget(layout, promptBtn.x, promptBtn.y)).toBe("prompt");
      const wave = waveButtonCenter(layout.emote);
      expect(hitHudTarget(layout, wave.x, wave.y)).toBe("emote");
    }
    expect(rectsOverlap(mobile.prompt, mobile.joystick!)).toBe(false);
    expect(rectsOverlap(mobile.prompt, mobile.interact!)).toBe(false);
    const joy = hudRectCenter(mobile.joystick!);
    expect(hitHudTarget(mobile, joy.x, joy.y)).toBe("joystick");
    const interact = hudRectCenter(mobile.interact!);
    expect(hitHudTarget(mobile, interact.x, interact.y)).toBe("interact");
    const chat = hudRectCenter(mobile.chat);
    expect(hitHudTarget(mobile, chat.x, chat.y)).toBe("chat");
  });

  it("keeps the daily progress chip above the prompt and clear of other HUD", () => {
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
    for (const layout of [desktop, mobile]) {
      expect(layout.progress.bottom - layout.progress.top).toBe(
        PASTURE_PROGRESS_CHIP_HEIGHT_PX,
      );
      expect(layout.progress.bottom).toBe(
        layout.prompt.top - PASTURE_PROGRESS_CHIP_GAP_PX,
      );
      for (const other of [layout.prompt, layout.emote, layout.chat]) {
        expect(rectsOverlap(layout.progress, other)).toBe(false);
      }
      const mid = hudRectCenter(layout.progress);
      expect(hitHudTarget(layout, mid.x, mid.y)).toBe("progress");
    }
    expect(rectsOverlap(mobile.progress, mobile.joystick!)).toBe(false);
    expect(rectsOverlap(mobile.progress, mobile.interact!)).toBe(false);
  });

  it("keeps the mini-map under the buddy chip and clear of other HUD", () => {
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
    expect(PASTURE_MINIMAP_TOP_PX).toBe(96);
    expect(PASTURE_MINIMAP_LEFT_PX).toBe(12);
    expect(PASTURE_MINIMAP_SIZE_PX).toBe(140);
    expect(css).toMatch(/\.pasture-minimap\s*\{[^}]*top:\s*96px/s);
    expect(css).toMatch(/\.pasture-minimap\s*\{[^}]*left:\s*12px/s);
    for (const layout of [desktop, mobile]) {
      expect(layout.minimap.top).toBe(PASTURE_MINIMAP_TOP_PX);
      expect(layout.minimap.left).toBe(PASTURE_MINIMAP_LEFT_PX);
      expect(layout.minimap.right - layout.minimap.left).toBe(
        PASTURE_MINIMAP_SIZE_PX,
      );
      expect(layout.minimap.bottom - layout.minimap.top).toBe(
        PASTURE_MINIMAP_HEIGHT_PX,
      );
      for (const other of [
        layout.prompt,
        layout.emote,
        layout.chat,
        layout.progress,
      ]) {
        expect(rectsOverlap(layout.minimap, other)).toBe(false);
      }
      const mid = hudRectCenter(layout.minimap);
      expect(hitHudTarget(layout, mid.x, mid.y)).toBe("minimap");
    }
    expect(rectsOverlap(mobile.minimap, mobile.joystick!)).toBe(false);
    expect(rectsOverlap(mobile.minimap, mobile.interact!)).toBe(false);
  });

  it("keeps the wallet toast clear of reserved HUD chrome", () => {
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
    expect(PASTURE_TX_TOAST_TOP_PX).toBe(12);
    expect(css).toMatch(/\.pasture-tx-toast\s*\{[^}]*top:\s*12px/s);
    for (const layout of [desktop, mobile]) {
      expect(layout.txToast.top).toBe(PASTURE_TX_TOAST_TOP_PX);
      expect(layout.txToast.bottom - layout.txToast.top).toBe(
        PASTURE_TX_TOAST_HEIGHT_PX,
      );
      expect(layout.txToast.left).toBeGreaterThanOrEqual(
        PASTURE_TX_TOAST_SIDE_CLEAR_PX - 0.01,
      );
      for (const other of [
        layout.minimap,
        layout.progress,
        layout.prompt,
        layout.emote,
        layout.chat,
      ]) {
        expect(rectsOverlap(layout.txToast, other)).toBe(false);
      }
      const mid = hudRectCenter(layout.txToast);
      expect(hitHudTarget(layout, mid.x, mid.y)).toBe("tx-toast");
    }
    expect(rectsOverlap(mobile.txToast, mobile.joystick!)).toBe(false);
    expect(rectsOverlap(mobile.txToast, mobile.interact!)).toBe(false);
  });
});
