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

describe("yard city layout", () => {
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

  it("gives the print shop and fitting room their own east blocks", () => {
    expect(market.position.x).toBeGreaterThan(10);
    expect(craft.position.x).toBeGreaterThan(market.position.x);
    expect(customize.position.x).toBeGreaterThan(18);
    expect(dist(market, craft)).toBeGreaterThan(18);
    expect(dist(market, customize)).toBeGreaterThan(24);
    expect(dist(craft, customize)).toBeGreaterThan(28);
  });

  it("places the kitchen, crystal yard, and oak park on separate west blocks", () => {
    expect(kitchen.position.x).toBeLessThan(spawn.x - 8);
    expect(kitchen.position.z).toBeLessThan(spawn.z);
    expect(crystal.position.x).toBeLessThan(kitchen.position.x);
    expect(oak.position.x).toBeLessThan(spawn.x);
    expect(oak.position.z).toBeLessThan(kitchen.position.z);
    expect(dist(kitchen, crystal)).toBeGreaterThan(18);
  });

  it("puts the dig site northwest and the canal on the south waterfront", () => {
    expect(treasure.position.x).toBeLessThan(spawn.x);
    expect(treasure.position.z).toBeGreaterThan(spawn.z);
    expect(pond.z).toBeLessThan(market.position.z - 8);
    expect(Math.abs(pier.position.z - pond.z)).toBeLessThan(1);
    expect(dist(pier, pond)).toBeLessThan(14);
  });

  it("spreads stations onto their own blocks inside the enlarged city", () => {
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
      expect(dist(spawn, station.position)).toBeGreaterThan(16);
      expect(dist(spawn, station.position)).toBeLessThan(80);
      expect(station.radius).toBe(3.4);
    }
    for (let i = 0; i < stations.length; i++) {
      for (let j = i + 1; j < stations.length; j++) {
        expect(
          dist(stations[i]!.position, stations[j]!.position),
          `${stations[i]!.id} vs ${stations[j]!.id}`,
        ).toBeGreaterThan(16);
      }
    }
  });

  it("leaves the main intersection and spawn clear of interact prompts", () => {
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
