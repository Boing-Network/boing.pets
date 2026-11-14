import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TIPS_STORAGE_KEY,
  activityTipFor,
  hasSeenActivityTip,
  loadSeenActivityTips,
  markActivityTipSeen,
  parseSeenActivityTips,
} from "../src/pasture3d/activityTips";

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

describe("first-play activity tips", () => {
  it("explains each pasture activity in a short tip", () => {
    expect(activityTipFor("cook").body).toMatch(/recipe flash/i);
    expect(activityTipFor("mine").body).toMatch(/vein/i);
    expect(activityTipFor("fish").body).toMatch(/sweet spot/i);
    expect(activityTipFor("treasure").body).toMatch(/glowing tile/i);
    expect(activityTipFor("garden").body).toMatch(/green zone/i);
    expect(activityTipFor("race").body).toMatch(/beats/i);
  });

  it("remembers a dismissed tip in localStorage without affecting other areas", () => {
    const storage = memoryStore();
    expect(hasSeenActivityTip("cook", storage)).toBe(false);
    markActivityTipSeen("cook", storage);
    expect(hasSeenActivityTip("cook", storage)).toBe(true);
    expect(hasSeenActivityTip("mine", storage)).toBe(false);
    expect(JSON.parse(storage.data[ACTIVITY_TIPS_STORAGE_KEY])).toEqual({
      cook: true,
    });
    expect(parseSeenActivityTips(loadSeenActivityTips(storage)).cook).toBe(
      true,
    );
  });
});
