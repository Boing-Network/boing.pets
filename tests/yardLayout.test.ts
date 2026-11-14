import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import { lilyPondEllipse } from "../src/pasture3d/meadowFootprints";
import { stationByKind } from "../src/pasture3d/stationInteract";

function xz(
  point: { x: number; z: number } | { position: { x: number; z: number } },
): { x: number; z: number } {
  return "position" in point ? point.position : point;
}

function dist(
  a: { x: number; z: number } | { position: { x: number; z: number } },
  b: { x: number; z: number } | { position: { x: number; z: number } },
): number {
  const pa = xz(a);
  const pb = xz(b);
  return Math.hypot(pa.x - pb.x, pa.z - pb.z);
}

describe("yard plaza layout", () => {
  const spawn = PASTURE_ZONE.spawn;
  const market = stationByKind(PASTURE_ZONE, "market")!;
  const craft = stationByKind(PASTURE_ZONE, "craft")!;
  const customize = stationByKind(PASTURE_ZONE, "customize")!;
  const kitchen = stationByKind(PASTURE_ZONE, "cook")!;
  const crystal = stationByKind(PASTURE_ZONE, "mine")!;
  const treasure = stationByKind(PASTURE_ZONE, "treasure")!;
  const pier = stationByKind(PASTURE_ZONE, "fish")!;
  const race = stationByKind(PASTURE_ZONE, "race")!;
  const garden = stationByKind(PASTURE_ZONE, "garden")!;
  const home = stationByKind(PASTURE_ZONE, "home")!;
  const oak = PASTURE_ZONE.landmarks.find((item) => item.id === "old-oak")!;
  const pond = lilyPondEllipse()!;

  it("puts The Drop ahead and to the right of spawn for a clear first sightline", () => {
    expect(market.position.x).toBeGreaterThan(spawn.x + 8);
    expect(market.position.z).toBeLessThan(spawn.z - 8);
  });

  it("clusters the three shops on the east wall facing the plaza", () => {
    for (const shop of [market, craft, customize]) {
      expect(shop.position.x).toBeGreaterThan(10);
      expect(Math.abs(shop.position.x - market.position.x)).toBeLessThan(1);
    }
    expect(dist(market, craft)).toBeLessThan(16);
    expect(dist(market, customize)).toBeLessThan(20);
    expect(dist(craft, customize)).toBeLessThan(28);
  });

  it("clusters kitchen, crystals, and the oak on the west / north activity yard", () => {
    expect(kitchen.position.x).toBeLessThan(spawn.x - 8);
    expect(kitchen.position.z).toBeLessThan(spawn.z);
    expect(crystal.position.x).toBeLessThan(spawn.x);
    expect(crystal.position.z).toBeLessThan(spawn.z);
    expect(oak.position.x).toBeLessThan(spawn.x);
    expect(oak.position.z).toBeLessThan(kitchen.position.z);
    expect(dist(kitchen, crystal)).toBeLessThan(12);
  });

  it("keeps treasure in front of The Drop and the canal behind the shop row", () => {
    expect(treasure.position.x).toBeLessThan(market.position.x);
    expect(treasure.position.x).toBeGreaterThan(spawn.x);
    expect(Math.abs(treasure.position.z - market.position.z)).toBeLessThan(4);
    expect(pond.z).toBeLessThan(market.position.z - 8);
    expect(Math.abs(pier.position.z - pond.z)).toBeLessThan(1);
    expect(dist(pier, pond)).toBeLessThan(12);
  });

  it("keeps every station a short walk from spawn", () => {
    const stations = [
      market,
      craft,
      customize,
      kitchen,
      crystal,
      treasure,
      pier,
      race,
      garden,
      home,
    ];
    for (const station of stations) {
      expect(dist(spawn, station.position)).toBeLessThan(40);
      expect(station.radius).toBe(3.4);
    }
  });

  it("leaves the central plaza and spawn clear of interact prompts", () => {
    expect(stationByKind(PASTURE_ZONE, "market")).toBeTruthy();
    const clear = [spawn, { x: 0, z: 0 }, { x: 0, z: 2 }];
    for (const point of clear) {
      for (const station of PASTURE_ZONE.stations) {
        if (station.kind === "info") continue;
        expect(dist(point, station.position)).toBeGreaterThan(station.radius);
      }
    }
  });
});
