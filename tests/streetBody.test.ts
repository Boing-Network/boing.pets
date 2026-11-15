import { describe, expect, it } from "vitest";
import {
  STREET_BODY_ANCHOR_SLOTS,
  STREET_BODY_ANCHORS,
  STREET_BODY_JOINTS,
  STREET_BODY_URL,
} from "../src/pasture3d/streetBodyAnchors";
import {
  STREET_BODY_ARM_DROP,
  STREET_BODY_RUN_SPEED,
  armsOpposeLegs,
  leftLegForward,
  streetBodyGait,
  streetBodyPose,
} from "../src/pasture3d/streetBodyAnim";
import {
  STREETWEAR_PROPS,
  STREET_PROP_BASE,
} from "../src/pasture3d/streetProps";
import {
  CITY_RESERVED_LOTS,
  cityBuildingCameraSolids,
  cityBuildingFootprints,
  cityDressingSolids,
  cityStreetwearBuildings,
  cityStreetwearProps,
  onCityStreet,
} from "../src/pasture3d/cityLayout";
import { PASTURE_ZONE } from "../src/world/config/zones";

describe("StreetBody anchors and gait", () => {
  it("exposes the 16 wardrobe attach slots on the 20-joint skeleton", () => {
    expect(STREET_BODY_URL).toBe("/characters/street-body.glb");
    expect(STREET_BODY_ANCHOR_SLOTS).toHaveLength(16);
    expect(STREET_BODY_ANCHORS.map((a) => a.id)).toEqual([
      ...STREET_BODY_ANCHOR_SLOTS,
    ]);
    expect(new Set(STREET_BODY_ANCHORS.map((a) => a.id)).size).toBe(16);
    expect(STREET_BODY_JOINTS).toHaveLength(20);
    const bones = new Set<string>(STREET_BODY_JOINTS);
    for (const anchor of STREET_BODY_ANCHORS) {
      expect(bones.has(anchor.bone), anchor.id).toBe(true);
    }
  });

  it("classifies idle, walk, and run from speed", () => {
    expect(streetBodyGait(0, false)).toBe("idle");
    expect(streetBodyGait(0.1, true)).toBe("idle");
    expect(streetBodyGait(1.35, true)).toBe("walk");
    expect(streetBodyGait(5.2, true)).toBe("run");
    expect(streetBodyGait(STREET_BODY_RUN_SPEED, true)).toBe("run");
  });

  it("keeps the authored A-pose and walks with opposite-phase legs facing +Z", () => {
    expect(STREET_BODY_ARM_DROP).toBe(0);
    const rest = streetBodyPose("idle", 0, true);
    expect(rest.shoulderL[2]).toBeCloseTo(STREET_BODY_ARM_DROP);
    expect(rest.shoulderR[2]).toBeCloseTo(-STREET_BODY_ARM_DROP);

    const omega = 7.5;
    const pose = streetBodyPose("walk", Math.PI / (2 * omega));
    expect(leftLegForward(pose)).toBe(true);
    expect(pose.upperLegR[0]).toBeGreaterThan(0);
    expect(armsOpposeLegs(pose)).toBe(true);
    expect(pose.shoulderL[2]).toBeCloseTo(STREET_BODY_ARM_DROP);
    expect(pose.shoulderR[2]).toBeCloseTo(-STREET_BODY_ARM_DROP);
  });
});

describe("Nico streetwear props", () => {
  it("ships the 11 singles from /street-props, skipping the kit bundles", () => {
    expect(STREET_PROP_BASE).toBe("/street-props/");
    const props = cityStreetwearProps();
    expect(props).toHaveLength(11);
    expect(props.map((p) => p.name).sort()).toEqual(
      [
        "corner-store",
        "fat-caps",
        "night-cart",
        "pigeon-drum",
        "site-fence",
        "sticker-box",
        "tagged-cone",
        "tagged-hydrant",
        "walk-up",
        "wheatpaste",
        "wood-crate",
      ].sort(),
    );
    expect(
      cityStreetwearBuildings()
        .map((p) => p.name)
        .sort(),
    ).toEqual(["corner-store", "walk-up"].sort());
    expect(STREETWEAR_PROPS.some((p) => p.name.startsWith("alley"))).toBe(
      false,
    );
  });

  it("keeps every prop off reserved lots, streets, the court, and spawn", () => {
    const drop = { x: 12, z: -8 };
    for (const item of cityStreetwearProps()) {
      const x = item.position[0];
      const z = item.position[2];
      const streetPad = item.kind === "building" ? 4.4 : 2.4;
      expect(onCityStreet(x, z, streetPad), item.name).toBe(false);
      expect(
        CITY_RESERVED_LOTS.some(
          (lot) =>
            Math.hypot(x - lot.x, z - lot.z) <=
            lot.r + (item.kind === "building" ? 1.15 : 0.8),
        ),
        item.name,
      ).toBe(false);
      expect(
        Math.hypot(x - PASTURE_ZONE.spawn.x, z - PASTURE_ZONE.spawn.z),
        item.name,
      ).toBeGreaterThan(4);
    }
    const cart = cityStreetwearProps().find((p) => p.name === "night-cart")!;
    const dist = Math.hypot(
      cart.position[0] - drop.x,
      cart.position[2] - drop.z,
    );
    expect(dist).toBeGreaterThan(7);
    expect(dist).toBeLessThan(14);
  });

  it("registers landmark buildings as footprints and camera solids", () => {
    const marks = cityStreetwearBuildings();
    const footprints = cityBuildingFootprints();
    const cams = cityBuildingCameraSolids();
    expect(cams.length).toBe(footprints.length);
    for (const b of marks) {
      expect(
        footprints.some(
          (f) => Math.hypot(f.x - b.position[0], f.z - b.position[2]) < 0.2,
        ),
        b.name,
      ).toBe(true);
    }
    const dressing = cityDressingSolids();
    expect(
      dressing.some(
        (s) =>
          s.id.startsWith("streetwear-building-") &&
          marks.some(
            (b) => Math.hypot(s.x - b.position[0], s.z - b.position[2]) < 0.2,
          ),
      ),
    ).toBe(true);
    for (const item of cityStreetwearProps().filter(
      (p) => p.kind === "clutter",
    )) {
      expect(
        dressing.some(
          (s) =>
            Math.hypot(s.x - item.position[0], s.z - item.position[2]) < 0.2,
        ),
        item.name,
      ).toBe(true);
    }
  });
});

describe("cartoon polish layout", () => {
  it("places Walk-Up and Corner Store on the central avenue in camera view", () => {
    const marks = Object.fromEntries(
      cityStreetwearBuildings().map((b) => [b.name, b]),
    );
    const walk = marks["walk-up"]!;
    const store = marks["corner-store"]!;
    // West and east of the N-S avenue, south of spawn, inside the district.
    expect(walk.position[0]).toBeLessThan(-4.4);
    expect(walk.position[0]).toBeGreaterThan(-8);
    expect(store.position[0]).toBeGreaterThan(4.4);
    expect(store.position[0]).toBeLessThan(8);
    for (const b of [walk, store]) {
      expect(b.position[2]).toBeLessThan(-6);
      expect(b.position[2]).toBeGreaterThan(-16);
    }
    expect(walk.rotationY).toBeCloseTo(Math.PI / 2);
    expect(store.rotationY).toBeCloseTo(-Math.PI / 2);
  });
});
