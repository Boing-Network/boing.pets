import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import {
  CITY_STREETS_X,
  CITY_STREETS_Z,
  cityBuildingFootprints,
  cityRoadTiles,
  cityStreetLights,
  cityStreetSegments,
  onCityStreet,
} from "../src/pasture3d/cityLayout";

describe("yard city grid", () => {
  it("builds a compact 2-by-2-block street grid", () => {
    expect(CITY_STREETS_X).toEqual([-18, 0, 18]);
    expect(CITY_STREETS_Z).toEqual([-18, 0, 18]);
    expect(cityStreetSegments()).toHaveLength(6);
    const tiles = cityRoadTiles();
    expect(tiles.some((item) => item.name === "road-crossroad")).toBe(true);
    expect(tiles.some((item) => item.name === "road-crossing")).toBe(true);
    expect(tiles.length).toBeGreaterThan(20);
    expect(cityStreetLights().length).toBeGreaterThan(8);
  });

  it("keeps stations near the streets and off the main intersection", () => {
    const stations = PASTURE_ZONE.stations.filter((s) => s.kind !== "info");
    for (const station of stations) {
      const nearStreet = onCityStreet(
        station.position.x,
        station.position.z,
        8,
      );
      expect(nearStreet, station.id).toBe(true);
      expect(
        Math.hypot(station.position.x, station.position.z),
        station.id,
      ).toBeGreaterThan(6);
    }
  });

  it("does not plant filler buildings on spawn or the intersection", () => {
    for (const b of cityBuildingFootprints()) {
      expect(Math.hypot(b.x, b.z)).toBeGreaterThan(6);
      expect(
        Math.hypot(b.x - PASTURE_ZONE.spawn.x, b.z - PASTURE_ZONE.spawn.z),
      ).toBeGreaterThan(4);
    }
  });
});
