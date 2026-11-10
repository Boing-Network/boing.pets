import { describe, expect, it } from "vitest";
import { hourFromMs, samplePastureDay } from "../src/pasture3d/pastureDay";

describe("pasture day cycle", () => {
  it("makes noon brighter than night", () => {
    const noon = samplePastureDay(12, true);
    const night = samplePastureDay(23, true);
    expect(noon.sunIntensity).toBeGreaterThan(night.sunIntensity);
    expect(noon.exposure).toBeGreaterThan(night.exposure);
    expect(noon.showFireflies).toBe(false);
    expect(noon.isNight).toBe(false);
    expect(night.showFireflies).toBe(true);
    expect(night.isNight).toBe(true);
    expect(night.sunY).toBeGreaterThan(0);
  });

  it("shows fireflies at dusk and hides them mid-morning", () => {
    expect(samplePastureDay(20, true).showFireflies).toBe(true);
    expect(samplePastureDay(4, true).showFireflies).toBe(true);
    expect(samplePastureDay(10.5, true).showFireflies).toBe(false);
    expect(samplePastureDay(10.5, true).sunIntensity).toBeGreaterThan(0.8);
  });

  it("reads the hour from a local timestamp", () => {
    const when = new Date(2026, 5, 1, 15, 30, 0).getTime();
    expect(hourFromMs(when)).toBeCloseTo(15.5, 5);
    expect(samplePastureDay(when).hour).toBeCloseTo(15.5, 5);
  });
});
