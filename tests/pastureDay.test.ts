import { describe, expect, it } from "vitest";
import {
  hourFromMs,
  PUBLIC_PASTURE_HOUR,
  publicPastureDay,
  samplePastureDay,
} from "../src/pasture3d/pastureDay";

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

it("locks the public pasture to late afternoon even at wall-clock night", () => {
  const locked = publicPastureDay();
  expect(PUBLIC_PASTURE_HOUR).toBeGreaterThanOrEqual(16.5);
  expect(PUBLIC_PASTURE_HOUR).toBeLessThanOrEqual(17.5);
  expect(locked.hour).toBe(PUBLIC_PASTURE_HOUR);
  expect(locked.showFireflies).toBe(false);
  expect(locked.isNight).toBe(false);
  expect(locked.sunIntensity).toBeGreaterThan(1.2);
  expect(locked.exposure).toBeGreaterThan(1.05);
  expect(locked.exposure).toBeLessThan(1.35);
  expect(locked.sunY).toBeGreaterThanOrEqual(16);

  const evening = new Date(2026, 10, 11, 21, 51, 0).getTime();
  const ifClockFollowed = samplePastureDay(evening);
  expect(hourFromMs(evening)).toBeCloseTo(21.85, 2);
  expect(ifClockFollowed.isNight).toBe(true);
  expect(ifClockFollowed.showFireflies).toBe(true);
  expect(ifClockFollowed.sunIntensity).toBeLessThan(locked.sunIntensity);
  expect(ifClockFollowed.exposure).toBeLessThan(locked.exposure);
});
