import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import {
  ACTIVITY_STATION_KINDS,
  isWithinStationRadius,
  stationByKind,
} from "../src/pasture3d/stationInteract";
import {
  layoutMiniMapStations,
  mapToWorld,
  MINIMAP_ICON_MIN_DIST_PX,
  miniMapStations,
  pastureMiniMapBounds,
  spreadMiniMapMarkers,
  walkTargetFromMiniMapClick,
  worldToMap,
  miniMapStreets,
} from "../src/pasture3d/minimap";

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
    const sample = { x: PASTURE_ZONE.spawn.x, z: PASTURE_ZONE.spawn.z };
    const roundTrip = mapToWorld(
      worldToMap(sample, bounds, SIZE),
      bounds,
      SIZE,
    );
    expect(roundTrip.x).toBeCloseTo(sample.x);
    expect(roundTrip.z).toBeCloseTo(sample.z);
  });

  it("places a labeled icon for every pasture activity area", () => {
    const stations = miniMapStations();
    const kinds = new Set(stations.map((station) => station.kind));
    for (const kind of ACTIVITY_STATION_KINDS) {
      expect(kinds.has(kind)).toBe(true);
    }
    const kitchen = stations.find((station) => station.kind === "cook");
    const cook = stationByKind(PASTURE_ZONE, "cook")!;
    expect(kitchen?.title).toBe("STREET KITCHEN");
    expect(kitchen?.icon).toBe("K");
    expect(kitchen?.x).toBe(cook.position.x);
    expect(kitchen?.z).toBe(cook.position.z);
  });

  it("spreads clustered station icons so letters stay readable", () => {
    const clustered = [
      { x: 70, y: 70 },
      { x: 72, y: 71 },
      { x: 70, y: 70 },
    ];
    const spread = spreadMiniMapMarkers(clustered, SIZE);
    expect(spread).toHaveLength(3);
    for (const point of spread) {
      expect(point.x).toBeGreaterThanOrEqual(8);
      expect(point.x).toBeLessThanOrEqual(SIZE - 8);
      expect(point.y).toBeGreaterThanOrEqual(8);
      expect(point.y).toBeLessThanOrEqual(SIZE - 8);
    }
    const d01 = Math.hypot(
      spread[0]!.x - spread[1]!.x,
      spread[0]!.y - spread[1]!.y,
    );
    const d02 = Math.hypot(
      spread[0]!.x - spread[2]!.x,
      spread[0]!.y - spread[2]!.y,
    );
    const d12 = Math.hypot(
      spread[1]!.x - spread[2]!.x,
      spread[1]!.y - spread[2]!.y,
    );
    expect(d01).toBeGreaterThanOrEqual(MINIMAP_ICON_MIN_DIST_PX - 0.5);
    expect(d02).toBeGreaterThanOrEqual(MINIMAP_ICON_MIN_DIST_PX - 0.5);
    expect(d12).toBeGreaterThanOrEqual(MINIMAP_ICON_MIN_DIST_PX - 0.5);

    const stations = miniMapStations();
    const bounds = pastureMiniMapBounds();
    const mapped = stations.map((station) => worldToMap(station, bounds, SIZE));
    const laidOut = spreadMiniMapMarkers(mapped, SIZE);
    let minDist = Infinity;
    for (let i = 0; i < laidOut.length; i++) {
      for (let j = i + 1; j < laidOut.length; j++) {
        const dist = Math.hypot(
          laidOut[i]!.x - laidOut[j]!.x,
          laidOut[i]!.y - laidOut[j]!.y,
        );
        if (dist < minDist) minDist = dist;
      }
    }
    expect(minDist).toBeGreaterThanOrEqual(MINIMAP_ICON_MIN_DIST_PX - 0.5);
  });

  it("draws the city street grid on the map", () => {
    const streets = miniMapStreets(SIZE);
    expect(streets.length).toBe(6);
    const mid = SIZE / 2;
    const hasAvenue = streets.some(
      (s) => Math.abs(s.x1 - mid) < 1 && Math.abs(s.x2 - mid) < 1,
    );
    const hasStreet = streets.some(
      (s) => Math.abs(s.y1 - mid) < 1 && Math.abs(s.y2 - mid) < 1,
    );
    expect(hasAvenue).toBe(true);
    expect(hasStreet).toBe(true);
  });

  it("snaps a mini-map click to the station interact spot", () => {
    const bounds = pastureMiniMapBounds();
    const laidOut = layoutMiniMapStations(SIZE, bounds);
    const kitchenIcon = laidOut.find((station) => station.kind === "cook");
    expect(kitchenIcon).toBeTruthy();
    const kitchen = stationByKind(PASTURE_ZONE, "cook")!;
    const trueKitchen = worldToMap(kitchenIcon!, bounds, SIZE);
    const fromIcon = walkTargetFromMiniMapClick(
      { x: kitchenIcon!.mapX + 4, y: kitchenIcon!.mapY - 3 },
      SIZE,
      laidOut,
      bounds,
    );
    expect(fromIcon.station?.kind).toBe("cook");
    expect(fromIcon.x).toBe(kitchen.position.x);
    expect(fromIcon.z).toBe(kitchen.position.z);
    expect(isWithinStationRadius(fromIcon, kitchen)).toBe(true);

    const inside = walkTargetFromMiniMapClick(
      trueKitchen,
      SIZE,
      laidOut,
      bounds,
    );
    expect(inside.station?.kind).toBe("cook");
    expect(isWithinStationRadius(inside, kitchen)).toBe(true);

    const raw = walkTargetFromMiniMapClick(
      { x: 8, y: 8 },
      SIZE,
      laidOut,
      bounds,
    );
    expect(raw.station).toBeNull();
    expect(isWithinStationRadius(raw, kitchen)).toBe(false);
  });
});
