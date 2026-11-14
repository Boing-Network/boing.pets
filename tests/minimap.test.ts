import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import {
  mapToWorld,
  miniMapStations,
  pastureMiniMapBounds,
  worldToMap,
} from "../src/pasture3d/minimap";
import { ACTIVITY_STATION_KINDS } from "../src/pasture3d/stationInteract";

const SIZE = 140;

describe("pasture mini-map projection", () => {
  it("uses the public pasture bounds and maps corners both ways", () => {
    const bounds = pastureMiniMapBounds();
    expect(bounds).toEqual(PASTURE_ZONE.bounds);
    const topLeft = worldToMap(
      { x: bounds.minX, z: bounds.minZ },
      bounds,
      SIZE,
    );
    expect(topLeft).toEqual({ x: 0, y: 0 });
    const bottomRight = worldToMap(
      { x: bounds.maxX, z: bounds.maxZ },
      bounds,
      SIZE,
    );
    expect(bottomRight).toEqual({ x: SIZE, y: SIZE });
    const mid = mapToWorld({ x: SIZE / 2, y: SIZE / 2 }, bounds, SIZE);
    expect(mid.x).toBeCloseTo((bounds.minX + bounds.maxX) / 2);
    expect(mid.z).toBeCloseTo((bounds.minZ + bounds.maxZ) / 2);
    const roundTrip = mapToWorld(
      worldToMap({ x: -22, z: 26 }, bounds, SIZE),
      bounds,
      SIZE,
    );
    expect(roundTrip.x).toBeCloseTo(-22);
    expect(roundTrip.z).toBeCloseTo(26);
  });

  it("places a labeled icon for every pasture activity area", () => {
    const stations = miniMapStations();
    const kinds = new Set(stations.map((station) => station.kind));
    for (const kind of ACTIVITY_STATION_KINDS) {
      expect(kinds.has(kind)).toBe(true);
    }
    const kitchen = stations.find((station) => station.kind === "cook");
    expect(kitchen?.title).toBe("Pasture Kitchen");
    expect(kitchen?.icon).toBe("K");
    expect(kitchen?.x).toBe(-22);
    expect(kitchen?.z).toBe(26);
  });
});
