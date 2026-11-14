import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import {
  isCustomPastureLandmark,
  isWithinStationRadius,
  nearbyInteractStation,
  stationActionLabel,
  stationByKind,
  stationPrompt,
} from "../src/pasture3d/stationInteract";
import {
  clampPresencePosition,
  obstaclesForZone,
  resolveClickTarget,
} from "../src/pasture3d/pathing";
import { CITY_PARK_TREES } from "../src/pasture3d/cityLayout";
import { PASTURE_FLATTEN } from "../src/pasture3d/meadowHeight";

const obstacles = obstaclesForZone(PASTURE_ZONE);

describe("public pasture stations", () => {
  const craft = stationByKind(PASTURE_ZONE, "craft");
  const market = stationByKind(PASTURE_ZONE, "market");
  const customize = stationByKind(PASTURE_ZONE, "customize");

  it("places labeled craft, market, and customize landmarks around spawn", () => {
    expect(craft?.position).toEqual({ x: 22, y: 0, z: -12 });
    expect(market?.position).toEqual({ x: 12, y: 0, z: -8 });
    expect(customize?.position).toEqual({ x: 22, y: 0, z: 10 });
    expect(craft?.radius).toBe(3.4);
    expect(market?.radius).toBe(3.4);
    expect(customize?.radius).toBe(3.4);
    expect(craft?.careHref).toBeUndefined();
    expect(market?.careHref).toBeUndefined();
    expect(customize?.careHref).toBeUndefined();
    const craftLand = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "crafting-station",
    );
    const marketLand = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "market-stall",
    );
    const customizeLand = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "customization-station",
    );
    expect(craftLand?.label).toBe("Crafting Station");
    expect(marketLand?.label).toBe("Market Stall");
    expect(customizeLand?.label).toBe("Customization Station");
    expect(isCustomPastureLandmark("crafting-station")).toBe(true);
    expect(isCustomPastureLandmark("customization-station")).toBe(true);
    expect(isCustomPastureLandmark("snack-barn")).toBe(false);
  });

  it("keeps stations clear of trees, the barn, and the main path corridors", () => {
    const barn = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "snack-barn",
    )!;
    for (const station of [craft!, market!, customize!]) {
      const land = PASTURE_ZONE.landmarks.find(
        (item) =>
          item.position.x === station.position.x &&
          item.position.z === station.position.z,
      )!;
      const halfW = land.width / 2 + 0.55;
      const halfD = land.depth / 2 + 0.55;
      for (const [x, z] of CITY_PARK_TREES) {
        const dx = Math.max(Math.abs(station.position.x - x) - halfW, 0);
        const dz = Math.max(Math.abs(station.position.z - z) - halfD, 0);
        expect(Math.hypot(dx, dz)).toBeGreaterThan(0.85);
      }
      expect(
        Math.hypot(
          station.position.x - barn.position.x,
          station.position.z - barn.position.z,
        ),
      ).toBeGreaterThan(8);
      // Main path corridors are x=0 and z=0.
      expect(Math.abs(station.position.x)).toBeGreaterThan(station.radius + 2);
      expect(Math.abs(station.position.z)).toBeGreaterThan(station.radius);
      expect(
        PASTURE_FLATTEN.some(
          (spot) =>
            spot.x === station.position.x && spot.z === station.position.z,
        ),
      ).toBe(true);
    }
  });

  it("adds a walk-in home plot with the 2D housing page as a fallback", () => {
    const home = stationByKind(PASTURE_ZONE, "home");
    expect(home?.position).toEqual({ x: 28, y: 0, z: 16 });
    expect(home?.careHref).toBe("/home.html");
    expect(stationActionLabel(home!)).toMatch(/home/i);
    const land = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "home-plot",
    )!;
    expect(land.height).toBeLessThan(1);
    expect(isCustomPastureLandmark("home-plot")).toBe(true);
    expect(
      PASTURE_FLATTEN.some(
        (spot) => spot.x === home!.position.x && spot.z === home!.position.z,
      ),
    ).toBe(true);
    const blocked = obstacles.some(
      (item) =>
        Math.hypot(item.x - home!.position.x, item.z - home!.position.z) <
          1.2 && ("solid" in item ? item.solid : true),
    );
    // The patio must stay walkable (low landmark, not a solid obstacle).
    const resolved = resolveClickTarget(
      { x: home!.position.x, z: home!.position.z },
      PASTURE_ZONE,
      obstacles,
    );
    expect(
      Math.hypot(resolved.x - home!.position.x, resolved.z - home!.position.z),
    ).toBeLessThan(0.6);
    expect(blocked).toBe(false);
  });

  it("opens only when the player is inside the interact radius", () => {
    expect(
      nearbyInteractStation(
        { x: PASTURE_ZONE.spawn.x, z: PASTURE_ZONE.spawn.z },
        PASTURE_ZONE,
      ),
    ).toBeNull();
    expect(
      nearbyInteractStation(
        { x: craft!.position.x, z: craft!.position.z + 3.3 },
        PASTURE_ZONE,
      )?.kind,
    ).toBe("craft");
    expect(
      nearbyInteractStation(
        { x: craft!.position.x, z: craft!.position.z + 3.5 },
        PASTURE_ZONE,
      ),
    ).toBeNull();
    expect(
      isWithinStationRadius(
        { x: market!.position.x, z: market!.position.z },
        market!,
      ),
    ).toBe(true);
    expect(
      nearbyInteractStation(
        { x: customize!.position.x, z: customize!.position.z + 3.3 },
        PASTURE_ZONE,
      )?.kind,
    ).toBe("customize");
    expect(
      nearbyInteractStation(
        { x: customize!.position.x, z: customize!.position.z + 3.5 },
        PASTURE_ZONE,
      ),
    ).toBeNull();
    expect(
      isWithinStationRadius(
        { x: customize!.position.x, z: customize!.position.z },
        customize!,
      ),
    ).toBe(true);
    expect(stationPrompt(craft!)).toMatch(/craft/i);
    expect(stationActionLabel(market!)).toMatch(/market/i);
    expect(stationPrompt(customize!)).toMatch(/customize/i);
    expect(stationActionLabel(customize!)).toMatch(/customize/i);
  });

  it("collides at the station boxes and resolves a walk target just outside", () => {
    for (const id of [
      "crafting-station",
      "market-stall",
      "customization-station",
    ]) {
      const land = PASTURE_ZONE.landmarks.find((item) => item.id === id)!;
      const inside = clampPresencePosition(
        "pasture",
        land.position.x,
        0,
        land.position.z,
      );
      expect(
        Math.hypot(inside.x - land.position.x, inside.z - land.position.z),
      ).toBeGreaterThan(1);
      const target = resolveClickTarget(
        { x: land.position.x, z: land.position.z },
        PASTURE_ZONE,
        obstacles,
      );
      const box = obstacles.find((item) => item.id === id);
      expect(box).toBeTruthy();
      expect(
        Math.hypot(target.x - land.position.x, target.z - land.position.z),
      ).toBeGreaterThanOrEqual(Math.min(box!.halfW, box!.halfD) - 0.05);
    }
  });
});
