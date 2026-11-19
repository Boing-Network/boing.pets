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
