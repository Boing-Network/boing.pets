import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWorldModel,
  resolveWorldModel,
  worldModelKey,
} from "../src/view/world/world-model";
import { planWorld } from "../src/view/world/world-plan";

const sample = {
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

test("worldModelKey is stable for the same graph", () => {
  assert.equal(worldModelKey(sample), worldModelKey({ ...sample }));
});

test("planWorld lays out three named regions with downhill rivers", () => {
  const plan = planWorld(sample);
  assert.equal(plan.regions.length, 3);
  assert.ok(plan.rivers.length >= 3);
  assert.ok(plan.bodies.every((b) => Number.isFinite(b.level)));
  for (const river of plan.rivers) {
    for (let i = 1; i < river.points.length; i += 1) {
      assert.ok(
        river.points[i]!.level <= river.points[i - 1]!.level + 1e-6,
        "river never climbs",
      );
    }
  }
  const names = plan.regions.map((r) => r.name).sort();
  assert.deepEqual(names, ["Meadow", "Ridge", "Thicket"]);
});

test("buildWorldModel places creatures on dry ground near region centers", () => {
  const model = buildWorldModel(sample);
  for (const region of model.regions) {
    const h = model.heightAt(region.center.x, region.center.z);
    assert.ok(h > 0.5, `${region.name} heart is above water`);
    assert.equal(
      model.waterSurfaceAt(region.center.x, region.center.z),
      null,
      `${region.name} heart stays dry`,
    );
  }
  assert.ok(model.nx * model.nz < 450_000);
});

test("resolveWorldModel keeps one instance across snapshot array churn", () => {
  const first = resolveWorldModel(null, sample);
  assert.ok(first);
  // Live hosts replace territory/link array identity every tick even when the
  // graph fingerprint is unchanged — rebuilding would reset the camera.
  const churned = {
    seed: sample.seed,
    territories: sample.territories.map((t) => ({ ...t })),
    links: sample.links.map((l) => ({ ...l })),
  };
  const second = resolveWorldModel(first, churned);
  assert.equal(second, first);
  assert.equal(second?.model, first.model);

  const grown = {
    ...sample,
    territories: [
      ...sample.territories,
      {
        id: 4,
        slug: "wilds",
        name: "Wilds",
        foodAbundance: 100,
        danger: 100,
        capacity: 10,
      },
    ],
  };
  const third = resolveWorldModel(first, grown);
  assert.notEqual(third, first);
  assert.notEqual(third?.model, first.model);
  assert.equal(third?.key, worldModelKey(grown));
});

/** The enlarged v1 catalog: seven territories joined by seven two-way links. */
const enlarged = {
  seed: 1,
  territories: [
    ["meadow", "Meadow", 700, 200, 40],
    ["thicket", "Thicket", 500, 450, 30],
    ["ridge", "Ridge", 350, 700, 20],
    ["glade", "Moonlit Glade", 650, 250, 35],
    ["fen", "Glowfen", 600, 350, 30],
    ["grove", "Elder Grove", 550, 400, 28],
    ["crags", "High Crags", 300, 600, 18],
  ].map(([slug, name, foodAbundance, danger, capacity], i) => ({
    id: i + 1,
    slug: slug as string,
    name: name as string,
    foodAbundance: foodAbundance as number,
    danger: danger as number,
    capacity: capacity as number,
  })),
  links: (
    [
      [1, 2, 6],
      [2, 3, 8],
      [1, 4, 5],
      [4, 6, 6],
      [6, 2, 6],
      [2, 5, 7],
      [3, 7, 7],
    ] as const
  ).flatMap(([a, b, travelTicks]) => [
    { fromId: a, toId: b, travelTicks },
    { fromId: b, toId: a, travelTicks },
  ]),
};

test("enlarged world: seven separate regions, two peaks, dry hearts", () => {
  const plan = planWorld(enlarged);
  assert.equal(plan.regions.length, 7);
  const peaks = plan.regions.filter((r) => r.peak).map((r) => r.name);
  assert.deepEqual(peaks.sort(), ["High Crags", "Ridge"]);
  for (let i = 0; i < plan.regions.length; i += 1) {
    for (let j = i + 1; j < plan.regions.length; j += 1) {
      const a = plan.regions[i]!;
      const b = plan.regions[j]!;
      const gap = Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z);
      assert.ok(gap >= a.radius + b.radius, `${a.name} and ${b.name} overlap`);
    }
  }
  const model = buildWorldModel(enlarged);
  for (const region of model.regions) {
    assert.ok(model.heightAt(region.center.x, region.center.z) > 0.5);
    assert.equal(model.waterSurfaceAt(region.center.x, region.center.z), null);
  }
  assert.ok(model.nx * model.nz < 450_000);
});
