import { describe, expect, it } from "vitest";
import {
  A11Y_STORAGE_KEY,
  COOK_HINT_SHAPES,
  TEXT_SIZE_SCALE,
  loadA11ySettings,
  parseA11ySettings,
  saveA11ySettings,
} from "../src/ui/a11ySettings";
import { zoomFromWheel, zoomBySteps } from "../src/pasture3d/camera";

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem(key: string) {
      return key in data ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    data,
  };
}

describe("pasture accessibility settings", () => {
  it("persists camera, text, motion, and cook-hint preferences", () => {
    const storage = memoryStore();
    const saved = saveA11ySettings(
      {
        cameraSensitivity: 1.5,
        textSize: "large",
        reducedMotion: true,
        cookHintPalette: "colorblind",
      },
      storage,
    );
    expect(saved.cameraSensitivity).toBe(1.5);
    expect(JSON.parse(storage.data[A11Y_STORAGE_KEY]).textSize).toBe("large");
    expect(loadA11ySettings(storage)).toEqual(saved);
    expect(parseA11ySettings({ cameraSensitivity: 9 }).cameraSensitivity).toBe(
      2,
    );
    expect(TEXT_SIZE_SCALE.large).toBeGreaterThan(1);
    expect(COOK_HINT_SHAPES).toEqual({
      correct: "●",
      present: "▲",
      absent: "■",
    });
  });

  it("scales wheel zoom by camera sensitivity", () => {
    const base = zoomFromWheel(18, 100, 0, 1);
    const fast = zoomFromWheel(18, 100, 0, 2);
    const slow = zoomFromWheel(18, 100, 0, 0.4);
    expect(Math.abs(fast - 18)).toBeGreaterThan(Math.abs(base - 18));
    expect(Math.abs(slow - 18)).toBeLessThan(Math.abs(base - 18));
    expect(zoomBySteps(18, 1, 1.18, 1)).toBeCloseTo(18 * 1.18);
  });
});
