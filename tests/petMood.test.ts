import { describe, expect, it } from "vitest";
import {
  ENERGY_LOW,
  HAPPINESS_HIGH,
  HUNGER_LOW,
  MOOD_BUBBLE,
  MOOD_SFX_GLOBAL_MS,
  MOOD_SFX_PER_PET_MS,
  moodMotion,
  moodSfxName,
  petMoodKind,
  shouldPlayMoodSfx,
} from "../src/pasture3d/petMood";

describe("pasture pet mood reactions", () => {
  it("maps low hunger, low energy, and high happiness to reaction kinds", () => {
    expect(
      petMoodKind({ hunger: HUNGER_LOW - 1, happiness: 90, energy: 90 }),
    ).toBe("hungry");
    expect(petMoodKind({ status: "peckish" })).toBe("hungry");
    expect(petMoodKind({ hunger: 80, energy: ENERGY_LOW - 1 })).toBe("sleepy");
    expect(petMoodKind({ hunger: 80, energy: 80, mood: "tired" })).toBe(
      "sleepy",
    );
    expect(
      petMoodKind({
        hunger: 80,
        energy: 80,
        happiness: HAPPINESS_HIGH,
        mood: "content",
      }),
    ).toBe("happy");
    expect(petMoodKind({ hunger: 80, energy: 80, mood: "playful" })).toBe(
      "happy",
    );
    expect(petMoodKind({ hunger: 80, energy: 80, mood: "lonely" })).toBe(
      "lonely",
    );
    expect(petMoodKind({ hunger: 80, energy: 80, mood: "curious" })).toBe(
      "curious",
    );
    expect(petMoodKind({ hunger: 80, energy: 80, happiness: 60 })).toBe(
      "content",
    );
  });

  it("keeps a short bubble icon and quiets motion when reduced motion is on", () => {
    expect(MOOD_BUBBLE.happy).toBe("✦");
    expect(MOOD_BUBBLE.hungry).toBeTruthy();
    expect(MOOD_BUBBLE.sleepy).toBeTruthy();
    const live = moodMotion("happy", false);
    expect(live.sparkle).toBe(true);
    expect(live.bounceAmp).toBeGreaterThan(0);
    const still = moodMotion("happy", true);
    expect(still.icon).toBe(live.icon);
    expect(still.bounceAmp).toBe(0);
    expect(still.droop).toBe(0);
    expect(still.sparkle).toBe(false);
    expect(moodMotion("hungry", false).droop).toBeGreaterThan(0);
    expect(moodMotion("sleepy", false).droop).toBeGreaterThan(0);
  });

  it("rate-limits mood sounds and skips them under reduced motion", () => {
    expect(moodSfxName("happy")).toBe("mood-happy");
    expect(moodSfxName("hungry")).toBe("mood-hungry");
    expect(moodSfxName("sleepy")).toBe("mood-sleepy");
    expect(moodSfxName("content")).toBeNull();
    expect(shouldPlayMoodSfx("happy", true, 10_000, 0, 0)).toBe(false);
    expect(shouldPlayMoodSfx("content", false, 10_000, 0, 0)).toBe(false);
    expect(shouldPlayMoodSfx("happy", false, 10_000, 0, 0)).toBe(true);
    expect(
      shouldPlayMoodSfx("happy", false, MOOD_SFX_PER_PET_MS - 1, 0, 0),
    ).toBe(false);
    expect(
      shouldPlayMoodSfx(
        "hungry",
        false,
        MOOD_SFX_GLOBAL_MS - 1,
        MOOD_SFX_PER_PET_MS,
        0,
      ),
    ).toBe(false);
  });
});
