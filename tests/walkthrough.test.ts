import { describe, expect, it } from "vitest";
import {
  WALKTHROUGH_STORAGE_KEY,
  advanceWalkthrough,
  careActionCompletesStep,
  completeWalkthroughStep,
  defaultWalkthroughState,
  isReturningVisitor,
  isWalkthroughVisible,
  loadWalkthrough,
  menuCompletesStep,
  parseWalkthroughState,
  saveWalkthrough,
  shouldAutoAdvanceOnPasture,
  skipWalkthrough,
  walkthroughStep,
} from "../src/onboarding/walkthrough";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => (key in data ? data[key]! : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    data,
  };
}

describe("guided walkthrough state", () => {
  it("parses invalid payloads as a fresh town welcome", () => {
    expect(parseWalkthroughState(null).step).toBe("welcome-town");
    expect(parseWalkthroughState({ step: "nope", completed: "yes" }).step).toBe(
      "welcome-town",
    );
    expect(parseWalkthroughState({}).completed).toBe(false);
  });

  it("is skippable and remembered", () => {
    const storage = memoryStorage();
    const skipped = skipWalkthrough(defaultWalkthroughState());
    expect(skipped.skipped).toBe(true);
    expect(skipped.completed).toBe(true);
    expect(isWalkthroughVisible(skipped, "starter-town")).toBe(false);
    expect(isWalkthroughVisible(skipped, "pasture")).toBe(false);
    saveWalkthrough(skipped, storage);
    expect(storage.data[WALKTHROUGH_STORAGE_KEY]).toContain("skipped");
    expect(storage.data["boing-pets-pasture-hint-v1"]).toBe("1");
    expect(loadWalkthrough(storage).skipped).toBe(true);
  });

  it("does not restart for people who already dismissed the old hint", () => {
    const storage = memoryStorage({ "boing-pets-pasture-hint-v1": "1" });
    expect(isReturningVisitor(storage)).toBe(true);
    const loaded = loadWalkthrough(storage);
    expect(loaded.completed).toBe(true);
    expect(isWalkthroughVisible(loaded, "pasture")).toBe(false);
  });

  it("walks from Starter Town into the pasture, then area, station, and care", () => {
    let state = defaultWalkthroughState();
    expect(walkthroughStep(state.step)?.scene).toBe("starter-town");
    expect(isWalkthroughVisible(state, "starter-town")).toBe(true);
    expect(isWalkthroughVisible(state, "pasture")).toBe(false);

    state = advanceWalkthrough(state);
    expect(state.step).toBe("enter-pasture");
    const arrived = shouldAutoAdvanceOnPasture(state);
    expect(arrived?.step).toBe("visit-area");
    state = arrived!;
    expect(isWalkthroughVisible(state, "pasture")).toBe(true);
    expect(isWalkthroughVisible(state, "starter-town")).toBe(false);

    expect(menuCompletesStep("visit-area", "mine")).toBe(true);
    expect(menuCompletesStep("visit-area", "craft")).toBe(false);
    state = completeWalkthroughStep(state, "visit-area");
    expect(state.step).toBe("visit-station");

    expect(menuCompletesStep("visit-station", "craft")).toBe(true);
    state = completeWalkthroughStep(state, "visit-station");
    expect(state.step).toBe("pet-care");

    expect(careActionCompletesStep("pet-care", "checkin")).toBe(true);
    expect(careActionCompletesStep("visit-station", "checkin")).toBe(false);
    state = completeWalkthroughStep(state, "pet-care");
    expect(state.step).toBe("done");
    expect(state.completed).toBe(false);
    expect(isWalkthroughVisible(state, "pasture")).toBe(true);

    state = advanceWalkthrough(state);
    expect(state.completed).toBe(true);
    expect(isWalkthroughVisible(state, "pasture")).toBe(false);
  });

  it("does not skip ahead when a later step is marked complete early", () => {
    const state = completeWalkthroughStep(
      defaultWalkthroughState(),
      "visit-area",
    );
    expect(state.step).toBe("welcome-town");
    expect(state.completedSteps).toEqual([]);
  });

  it("round-trips mid-tour progress through storage", () => {
    const storage = memoryStorage();
    let state = advanceWalkthrough(defaultWalkthroughState());
    state = shouldAutoAdvanceOnPasture(state)!;
    saveWalkthrough(state, storage);
    const loaded = loadWalkthrough(storage);
    expect(loaded.step).toBe("visit-area");
    expect(loaded.completed).toBe(false);
  });
});
