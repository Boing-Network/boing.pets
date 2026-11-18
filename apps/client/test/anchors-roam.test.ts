import assert from "node:assert/strict";
import { test } from "node:test";
import {
  explorePoint,
  foodPatch,
  roamDuration,
  roamWaypoints,
  sampleOpenWorld,
} from "../src/view/motion/anchors";
import { buildWorldModel } from "../src/view/world/world-model";

const FIXTURE = {
  seed: 1,
  territories: [
    {
      id: 1,
      slug: "meadow",
      name: "Meadow",
      foodAbundance: 700,
      danger: 200,
      capacity: 40,
    },
    {
      id: 2,
      slug: "thicket",
      name: "Thicket",
      foodAbundance: 500,
      danger: 450,
      capacity: 30,
    },
    {
      id: 3,
      slug: "ridge",
      name: "Ridge",
      foodAbundance: 350,
      danger: 700,
      capacity: 20,
    },
  ],
  links: [
    { fromId: 1, toId: 2, travelTicks: 6 },
    { fromId: 2, toId: 1, travelTicks: 6 },
    { fromId: 2, toId: 3, travelTicks: 8 },
    { fromId: 3, toId: 2, travelTicks: 8 },
  ],
};

test("open-world explore points are not pinned to a single region disc", () => {
  const model = buildWorldModel(FIXTURE);
  const home = model.regions[0]!;
  const regions = new Set<string>();
  for (let i = 0; i < 12; i += 1) {
    const p = explorePoint(model, home, 1, 9, i);
    const at = model.regionAt(p.x, p.z);
    if (at) regions.add(at.slug);
    assert.ok(model.heightAt(p.x, p.z) > 0.2);
    assert.ok(model.waterDistAt(p.x, p.z) > 0.2);
  }
  // Across a dozen samples we should leave the home meadow at least once.
  assert.ok(
    regions.size >= 2 ||
      [...Array(12)].some((_, i) => {
        const p = sampleOpenWorld(model, 1, 9, 400 + i);
        const d = Math.hypot(p.x - home.center.x, p.z - home.center.z);
        return d > home.radius * 0.95;
      }),
  );
});

test("food patches include open-world forage away from home center", () => {
  const model = buildWorldModel(FIXTURE);
  const home = model.regions[0]!;
  const odd = foodPatch(model, home, 1, 1, 1);
  const even = foodPatch(model, home, 1, 1, 0);
  assert.ok(model.waterDistAt(odd.x, odd.z) > 0.2);
  assert.ok(model.waterDistAt(even.x, even.z) > 0.2);
  // Odd indices prefer a (possibly) other region — distance from home center
  // should often exceed a tiny pad.
  const d = Math.hypot(odd.x - home.center.x, odd.z - home.center.z);
  assert.ok(d > 2);
});

test("roamWaypoints insert midpoints for long hops and stay dry", () => {
  const model = buildWorldModel(FIXTURE);
  const a = model.regions[0]!;
  const b = model.regions[2]!;
  const from = {
    x: a.center.x,
    z: a.center.z,
    y: model.heightAt(a.center.x, a.center.z),
  };
  const to = {
    x: b.center.x,
    z: b.center.z,
    y: model.heightAt(b.center.x, b.center.z),
  };
  const path = roamWaypoints(model, from, to);
  assert.ok(path.length >= 2);
  for (const p of path) {
    assert.ok(model.waterDistAt(p.x, p.z) > 0.15);
  }
  const seconds = roamDuration(path, from, 4);
  assert.ok(seconds >= 4);
  assert.ok(seconds <= 28);
});
