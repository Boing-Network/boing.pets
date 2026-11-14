import { describe, expect, it } from "vitest";
import {
  PASTURE_FULLSCREEN_TARGET_ID,
  PASTURE_IMMERSIVE_CLASS,
  applyImmersiveFallback,
  elementFullscreenEnabled,
  isImmersiveFallback,
  isPastureFullscreen,
  requestPastureFullscreen,
  togglePastureFullscreen,
} from "../src/pasture3d/fullscreen";

function classList(el: { classes: Set<string> }) {
  return {
    contains: (name: string) => el.classes.has(name),
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !el.classes.has(name);
      if (on) el.classes.add(name);
      else el.classes.delete(name);
      return on;
    },
  };
}

function fakeDoc(opts: { fullscreenEnabled?: boolean } = {}) {
  const root = { classes: new Set<string>() };
  const body = { classes: new Set<string>() };
  const canvas = { id: PASTURE_FULLSCREEN_TARGET_ID };
  const resizes: string[] = [];
  const doc = {
    fullscreenEnabled: opts.fullscreenEnabled ?? false,
    fullscreenElement: null as Element | null,
    documentElement: { classList: classList(root) } as unknown as HTMLElement,
    body: { classList: classList(body) } as unknown as HTMLElement,
    getElementById: (id: string) =>
      id === PASTURE_FULLSCREEN_TARGET_ID
        ? (canvas as unknown as HTMLElement)
        : null,
    defaultView: {
      dispatchEvent: (event: Event) => {
        resizes.push(event.type);
        return true;
      },
    } as unknown as Window,
    _root: root,
    _body: body,
    _resizes: resizes,
  };
  return doc;
}

describe("pasture full screen", () => {
  it("detects when the element Fullscreen API is unavailable", () => {
    expect(
      elementFullscreenEnabled({ fullscreenEnabled: false } as Document),
    ).toBe(false);
    expect(
      elementFullscreenEnabled({
        fullscreenEnabled: false,
        webkitFullscreenEnabled: true,
      } as unknown as Document),
    ).toBe(true);
  });

  it("uses a CSS immersive fallback and resizes the canvas", async () => {
    const doc = fakeDoc({ fullscreenEnabled: false });
    expect(await requestPastureFullscreen(doc)).toBe("immersive");
    expect(isImmersiveFallback(doc)).toBe(true);
    expect(doc._root.classes.has(PASTURE_IMMERSIVE_CLASS)).toBe(true);
    expect(doc._body.classes.has(PASTURE_IMMERSIVE_CLASS)).toBe(true);
    expect(doc._resizes).toContain("resize");
    expect(isPastureFullscreen(doc)).toBe(true);
    expect(await togglePastureFullscreen(doc)).toBe(false);
    expect(isImmersiveFallback(doc)).toBe(false);
  });

  it("can toggle immersive off through applyImmersiveFallback", () => {
    const doc = fakeDoc();
    applyImmersiveFallback(true, doc);
    expect(isImmersiveFallback(doc)).toBe(true);
    applyImmersiveFallback(false, doc);
    expect(isImmersiveFallback(doc)).toBe(false);
  });
});
