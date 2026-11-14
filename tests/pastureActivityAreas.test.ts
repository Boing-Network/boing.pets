import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import { HASH_REDIRECTS, PAGE_META } from "../src/ui/nav";
import { PAGE_BODIES } from "../src/ui/pageBodies";
import {
  activityKindForHash,
  ACTIVITY_AREA_LIST,
  ACTIVITY_AREA_META,
} from "../src/pasture3d/activityAreas";
import { activityPanelHtml } from "../src/ui/activityPanels";
import {
  isCustomPastureLandmark,
  isWithinStationRadius,
  nearbyInteractStation,
  stationActionLabel,
  stationByKind,
  stationPrompt,
  type ActivityStationKind,
} from "../src/pasture3d/stationInteract";
import {
  clampPresencePosition,
  obstaclesForZone,
  resolveClickTarget,
} from "../src/pasture3d/pathing";
import { MEADOW_TREE_SPOTS } from "../src/pasture3d/meadowLayout";
import { PASTURE_FLATTEN } from "../src/pasture3d/meadowHeight";

const obstacles = obstaclesForZone(PASTURE_ZONE);

const EXPECTED: Record<
  ActivityStationKind,
  { x: number; z: number; landmarkId: string; label: string }
> = {
  mine: {
    x: -10,
    z: -6,
    landmarkId: "crystal-quarry",
    label: "Crystal Quarry",
  },
  fish: { x: 13, z: -24, landmarkId: "pond-pier", label: "Pond Pier" },
  treasure: { x: 8, z: -6, landmarkId: "treasure-dig", label: "Treasure Dig" },
  garden: { x: 22, z: -20, landmarkId: "garden-beds", label: "Garden Beds" },
  cook: { x: -16, z: -8, landmarkId: "kitchen-hut", label: "Pasture Kitchen" },
  race: { x: -12, z: 8, landmarkId: "race-gate", label: "Race Track" },
};

const REQUIRED_IDS: Record<string, string[]> = {
  fishing: ["fishing-summary", "fish-cast", "fish-minigame"],
  mining: ["mining-summary", "mine-swing", "mine-minigame"],
  treasure: ["treasure-summary", "treasure-start", "treasure-minigame"],
  garden: [
    "garden-summary",
    "garden-play",
    "garden-minigame",
    "garden-crop",
    "garden-plots",
  ],
  cook: [
    "kitchen-summary",
    "cook-play",
    "cook-minigame",
    "kitchen-recipes",
    "kitchen-dishes",
  ],
  racing: ["racing-summary", "race-start", "race-minigame"],
};

describe("public pasture activity areas", () => {
  it("places a labeled area for each daily activity clear of desks and the oak", () => {
    const oak = PASTURE_ZONE.landmarks.find((item) => item.id === "old-oak")!;
    const desks = (["craft", "market", "customize"] as const).map((kind) =>
      stationByKind(PASTURE_ZONE, kind)!,
    );
    for (const meta of ACTIVITY_AREA_LIST) {
      const expected = EXPECTED[meta.kind];
      const station = stationByKind(PASTURE_ZONE, meta.kind);
      expect(station?.position).toEqual({
        x: expected.x,
        y: 0,
        z: expected.z,
      });
      expect(station?.radius).toBe(3.4);
      expect(station?.careHref).toBeUndefined();
      expect(station?.label).toBe(expected.label);
      const land = PASTURE_ZONE.landmarks.find(
        (item) => item.id === expected.landmarkId,
      );
      expect(land?.label).toBe(expected.label);
      expect(land?.position).toEqual({ x: expected.x, y: 0, z: expected.z });
      expect(isCustomPastureLandmark(expected.landmarkId)).toBe(true);
      expect(
        Math.hypot(expected.x - oak.position.x, expected.z - oak.position.z),
      ).toBeGreaterThan(10);
      for (const desk of desks) {
        expect(
          Math.hypot(
            expected.x - desk.position.x,
            expected.z - desk.position.z,
          ),
        ).toBeGreaterThan(desk.radius + station!.radius);
      }
    }
  });

  it("keeps areas clear of trees, the barn, and the main path corridors", () => {
    const barn = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "snack-barn",
    )!;
    for (const meta of ACTIVITY_AREA_LIST) {
      const station = stationByKind(PASTURE_ZONE, meta.kind)!;
      const land = PASTURE_ZONE.landmarks.find(
        (item) =>
          item.position.x === station.position.x &&
          item.position.z === station.position.z,
      )!;
      const halfW = land.width / 2 + 0.55;
      const halfD = land.depth / 2 + 0.55;
      for (const [x, z] of MEADOW_TREE_SPOTS) {
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

  it("opens only inside the interact radius and uses a Press E prompt", () => {
    expect(
      nearbyInteractStation(
        { x: PASTURE_ZONE.spawn.x, z: PASTURE_ZONE.spawn.z },
        PASTURE_ZONE,
      ),
    ).toBeNull();
    const quarry = stationByKind(PASTURE_ZONE, "mine")!;
    expect(
      nearbyInteractStation(
        { x: quarry.position.x, z: quarry.position.z + 3.3 },
        PASTURE_ZONE,
      )?.kind,
    ).toBe("mine");
    expect(
      nearbyInteractStation(
        { x: quarry.position.x, z: quarry.position.z + 3.5 },
        PASTURE_ZONE,
      ),
    ).toBeNull();
    expect(
      isWithinStationRadius(
        {
          x: stationByKind(PASTURE_ZONE, "fish")!.position.x,
          z: stationByKind(PASTURE_ZONE, "fish")!.position.z,
        },
        stationByKind(PASTURE_ZONE, "fish")!,
      ),
    ).toBe(true);
    expect(stationPrompt(quarry)).toMatch(/mine/i);
    expect(stationActionLabel(stationByKind(PASTURE_ZONE, "fish")!)).toMatch(
      /fish/i,
    );
    expect(stationPrompt(stationByKind(PASTURE_ZONE, "garden")!)).toMatch(
      /garden/i,
    );
  });

  it("collides at each area landmark and resolves a walk target just outside", () => {
    for (const meta of ACTIVITY_AREA_LIST) {
      const expected = EXPECTED[meta.kind];
      const land = PASTURE_ZONE.landmarks.find(
        (item) => item.id === expected.landmarkId,
      )!;
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
      const box = obstacles.find((item) => item.id === expected.landmarkId);
      expect(box).toBeTruthy();
      expect(
        Math.hypot(target.x - land.position.x, target.z - land.position.z),
      ).toBeGreaterThanOrEqual(Math.min(box!.halfW, box!.halfD) - 0.05);
    }
  });

  it("reuses the same panel markup and IDs as the fallback pages", () => {
    for (const meta of ACTIVITY_AREA_LIST) {
      const html = activityPanelHtml(meta.activity);
      const pageKey =
        meta.activity === "cook"
          ? "kitchen"
          : meta.activity === "mining"
            ? "mining"
            : meta.activity === "racing"
              ? "racing"
              : meta.activity;
      for (const id of REQUIRED_IDS[meta.activity]) {
        expect(html).toContain(`id="${id}"`);
        expect(PAGE_BODIES[pageKey]).toContain(`id="${id}"`);
      }
      expect(PAGE_BODIES[pageKey]).toContain(`/#${meta.hash}`);
      expect(PAGE_META[pageKey as keyof typeof PAGE_META].path).toBe(
        meta.fallbackPath,
      );
    }
  });

  it("exposes pasture deep links that do not collide with legacy hash redirects", () => {
    for (const meta of ACTIVITY_AREA_LIST) {
      expect(HASH_REDIRECTS[meta.hash]).toBeUndefined();
      expect(activityKindForHash(`#${meta.hash}`)).toBe(meta.kind);
      expect(activityKindForHash(meta.hash)).toBe(meta.kind);
    }
    expect(activityKindForHash("#fishing")).toBeNull();
    expect(HASH_REDIRECTS.fishing).toBe("/fishing.html");
    expect(ACTIVITY_AREA_META.mine.hash).toBe("mine");
  });
});
