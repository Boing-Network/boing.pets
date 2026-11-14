import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import { blocked, obstaclesForZone } from "../src/pasture3d/pathing";
import { YARD_KIT_PRELOAD } from "../src/pasture3d/YardKits";
import { YARD_KIT_BASE } from "../src/pasture3d/yardKitLoader";
import { yardKitObstacles } from "../src/pasture3d/yardKitObstacles";

describe("yard kits", () => {
  it("serves kits from the public yard-kits folder", () => {
    expect(YARD_KIT_BASE).toBe("/yard-kits/");
    expect(YARD_KIT_PRELOAD.length).toBeGreaterThan(20);
    expect(YARD_KIT_PRELOAD).toContain("shop-wide");
    expect(YARD_KIT_PRELOAD).toContain("skate-bench");
  });

  it("keeps spawn walkable after kit solids are added", () => {
    const obstacles = obstaclesForZone(PASTURE_ZONE);
    expect(
      blocked({ x: PASTURE_ZONE.spawn.x, z: PASTURE_ZONE.spawn.z }, obstacles),
    ).toBeNull();
  });

  it("keeps station interact spots outside the new kit solids", () => {
    const extras = yardKitObstacles();
    expect(extras.length).toBeGreaterThan(0);
    for (const station of PASTURE_ZONE.stations) {
      expect(
        blocked({ x: station.position.x, z: station.position.z }, extras),
        station.id,
      ).toBeNull();
    }
  });
});
