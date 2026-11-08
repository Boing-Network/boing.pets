import { describe, expect, it } from "vitest";
import { STARTER_TOWN, WORLD_CONFIG } from "../src/world/config/zones";

describe("Starter Town world config", () => {
  it("exposes a coherent default zone for the API and client", () => {
    expect(WORLD_CONFIG.version).toBe(1);
    expect(WORLD_CONFIG.defaultZone).toBe(STARTER_TOWN.id);
    expect(WORLD_CONFIG.zones.map((z) => z.id)).toEqual(
      expect.arrayContaining([
        "starter-town",
        "forest",
        "beach",
        "mountains",
        "city",
        "academy",
      ]),
    );
  });

  it("keeps landmarks and care stations inside walk bounds", () => {
    const { bounds } = STARTER_TOWN;
    for (const item of [...STARTER_TOWN.landmarks, ...STARTER_TOWN.stations]) {
      expect(item.position.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(item.position.x).toBeLessThanOrEqual(bounds.maxX);
      expect(item.position.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(item.position.z).toBeLessThanOrEqual(bounds.maxZ);
    }
  });

  it("offers care deep-links back to the pasture desk", () => {
    const care = STARTER_TOWN.stations.filter((s) => s.kind === "care");
    expect(care.length).toBeGreaterThanOrEqual(3);
    for (const station of care) {
      expect(station.careHref).toMatch(/^\/#/);
      expect(station.radius).toBeGreaterThan(1);
    }
  });

  it("includes tutorial and marketplace hooks for later phases", () => {
    const ids = STARTER_TOWN.stations.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "station-tutorial",
        "station-market",
        "station-hatch",
      ]),
    );
  });
});
