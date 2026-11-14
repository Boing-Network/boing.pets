import { describe, expect, it } from "vitest";
import {
  ADVENTURE_TUTORIAL_STEPS,
  advanceAdventureTutorial,
  defaultAdventureTutorialState,
  isAdventureTutorialVisible,
  parseAdventureTutorialState,
  skipAdventureTutorial,
} from "../src/onboarding/adventureTutorial";

describe("adventure tutorial", () => {
  it("has six short first-time steps and stays hidden after skip or finish", () => {
    expect(ADVENTURE_TUTORIAL_STEPS).toHaveLength(6);
    expect(ADVENTURE_TUTORIAL_STEPS.map((step) => step.id)).toEqual([
      "what",
      "choose",
      "equip",
      "luck",
      "claim",
      "rarity",
    ]);
    const bodies = ADVENTURE_TUTORIAL_STEPS.map((step) => step.body).join(" ");
    expect(bodies).toMatch(/Lost Drop/i);
    expect(bodies).toMatch(/Pop-Up/i);
    expect(bodies).toMatch(/Style Luck/i);
    expect(bodies).toMatch(/0\.01%/);

    let state = defaultAdventureTutorialState();
    expect(isAdventureTutorialVisible(state)).toBe(true);
    for (let i = 0; i < 6; i++) state = advanceAdventureTutorial(state);
    expect(state.completed).toBe(true);
    expect(isAdventureTutorialVisible(state)).toBe(false);

    const skipped = skipAdventureTutorial(defaultAdventureTutorialState());
    expect(skipped.skipped).toBe(true);
    expect(isAdventureTutorialVisible(skipped)).toBe(false);
    expect(parseAdventureTutorialState({ completed: true }).completed).toBe(
      true,
    );
  });
});
