import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import {
  CITY_COURT,
  CITY_STREETS_X,
  CITY_STREETS_Z,
  cityBuildingCameraSolids,
  cityBuildingFootprints,
  cityDressingSolids,
  cityParkedCars,
  cityRoadTiles,
  cityStreetLights,
  cityStreetSegments,
  onCityStreet,
} from "../src/pasture3d/cityLayout";
import { cameraOccludersForZone } from "../src/pasture3d/camera";
import { blocked, obstaclesForZone } from "../src/pasture3d/pathing";

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

  it("fills leftover lots with dressing that stays off streets and spawn", () => {
    expect(cityParkedCars().length).toBeGreaterThan(4);
    expect(cityDressingSolids().length).toBeGreaterThan(8);
    expect(cityBuildingFootprints().length).toBeGreaterThan(8);
    for (const solid of cityDressingSolids()) {
      expect(onCityStreet(solid.x, solid.z, 2.4), solid.id).toBe(false);
      expect(
        Math.hypot(
          solid.x - PASTURE_ZONE.spawn.x,
          solid.z - PASTURE_ZONE.spawn.z,
        ),
      ).toBeGreaterThan(4);
    }
    expect(onCityStreet(CITY_COURT.x, CITY_COURT.z, 3)).toBe(false);
    const obstacles = obstaclesForZone(PASTURE_ZONE);
    expect(blocked({ x: CITY_COURT.x, z: CITY_COURT.z }, obstacles)).toBeNull();
    expect(blocked({ x: 0, z: 8 }, obstacles)).toBeNull();
    expect(blocked({ x: 22, z: 8 }, obstacles)).toBeNull();
  });

  it("registers city buildings as camera occluders so roofs can pull the camera in", () => {
    expect(cityBuildingCameraSolids().length).toBe(
      cityBuildingFootprints().length,
    );
    const boxes = cameraOccludersForZone(PASTURE_ZONE);
    expect(boxes.length).toBeGreaterThan(cityBuildingFootprints().length);
    const sample = cityBuildingCameraSolids()[0]!;
    expect(
      boxes.some(
        (box) =>
          Math.hypot(box.x - sample.x, box.z - sample.z) < 0.2 && box.maxY >= 6,
      ),
    ).toBe(true);
  });
});
