import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Action,
  ActionTargetKind,
  Goal,
  type CreatureView,
  type WorldClock,
} from "@boing-pets/contract";
import { FIXTURE_WORLD_VIEW } from "../src/demo/fixture-world";
import {
  buildLeg,
  estimateSimTick,
  gaitPhase,
  legKey,
  sampleLeg,
  spotToWorld,
  strideLength,
} from "../src/view/motion/trajectory";
import { buildWorldModel } from "../src/view/world/world-model";

const model = buildWorldModel({
  seed: FIXTURE_WORLD_VIEW.world.seed,
  territories: FIXTURE_WORLD_VIEW.territories,
  links: FIXTURE_WORLD_VIEW.links,
});

const BASE: CreatureView = FIXTURE_WORLD_VIEW.creatures[0]!;

function creature(overrides: Partial<CreatureView>): CreatureView {
  return {
    ...BASE,
    currentGoal: Goal.FIND_FOOD,
    currentAction: Action.FORAGE,
    actionTargetKind: ActionTargetKind.NONE,
    actionTargetId: null,
    actionStartedTick: 100,
    actionEndsTick: 112,
    territoryId: 1,
    fromSpotX: -400,
    fromSpotZ: 200,
    spotX: 300,
    spotZ: -250,
    ...overrides,
  };
}

test("land spots resolve to dry ground inside the territory's region", () => {
  for (const territory of FIXTURE_WORLD_VIEW.territories) {
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      const r = (i % 4) * 280;
      const sx = Math.round(Math.cos(angle) * r);
      const sz = Math.round(Math.sin(angle) * r);
      const a = spotToWorld(model, territory.id, sx, sz);
      const b = spotToWorld(model, territory.id, sx, sz);
      assert.deepEqual(a, b, "deterministic");
      assert.equal(model.waterSurfaceAt(a.x, a.z), null, "not in water");
      assert.ok(model.waterDistAt(a.x, a.z) > 0, "dry");
    }
  }
});

test("shore spots stand on the bank next to the territory's water", () => {
  for (const territory of FIXTURE_WORLD_VIEW.territories) {
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const p = spotToWorld(
        model,
        territory.id,
        Math.round(Math.cos(angle) * 1200),
        Math.round(Math.sin(angle) * 1200),
      );
      const wd = model.waterDistAt(p.x, p.z);
      assert.ok(wd >= 0, `on land (wd=${wd})`);
      assert.ok(wd < 4, `close to the water (wd=${wd})`);
    }
  }
});

test("legs are identical for identical host state (every client agrees)", () => {
  const c = creature({});
  const a = buildLeg(model, c, "walk", 64, 60_000);
  const b = buildLeg(model, structuredClone(c), "walk", 64, 60_000);
  assert.deepEqual(a, b);
  assert.equal(a.key, legKey(c, 64));
  for (const tick of [100, 100.5, 101.25, 103, 111.9]) {
    assert.deepEqual(sampleLeg(a, tick), sampleLeg(b, tick));
  }
});

test("a leg starts at fromSpot, ends at spot, and never walks backwards", () => {
  const leg = buildLeg(model, creature({}), "trot", 64, 60_000);
  const start = spotToWorld(model, 1, -400, 200);
  const end = spotToWorld(model, 1, 300, -250);
  const s0 = sampleLeg(leg, 100);
  assert.ok(Math.hypot(s0.x - start.x, s0.z - start.z) < 1e-6);
  const done = sampleLeg(leg, 112);
  assert.ok(Math.hypot(done.x - end.x, done.z - end.z) < 1e-6);
  assert.equal(done.moving, false);
  let last = -1;
  for (let t = 100; t <= 112; t += 0.05) {
    const s = sampleLeg(leg, t);
    assert.ok(s.distance >= last - 1e-9);
    last = s.distance;
  }
  for (const point of leg.points) {
    assert.equal(model.waterSurfaceAt(point.x, point.z), null, "dry waypoint");
  }
});

test("walk time follows speed at 1x and fits the action window at 64x", () => {
  const c = creature({});
  const slow = buildLeg(model, c, "walk", 1, 60_000);
  const fast = buildLeg(model, c, "walk", 64, 60_000);
  // 1x: a real-time walk is a small fraction of one 60 s tick.
  assert.ok(slow.arriveTick - slow.startTick < 1);
  // 64x: capped to the forage window share so grazing still plays.
  assert.ok(fast.arriveTick - fast.startTick <= 12 * 0.55 + 1e-9);
  assert.ok(fast.arriveTick > slow.arriveTick);
});

test("migration follows the trail and arrives in the destination", () => {
  const link = FIXTURE_WORLD_VIEW.links[0]!;
  const c = creature({
    territoryId: link.fromId,
    currentGoal: Goal.EXPLORE,
    currentAction: Action.RELOCATE,
    actionTargetKind: ActionTargetKind.TERRITORY,
    actionTargetId: link.toId,
    actionStartedTick: 200,
    actionEndsTick: 206,
    fromSpotX: 100,
    fromSpotZ: 100,
    spotX: -150,
    spotZ: 50,
  });
  const leg = buildLeg(model, c, "walk", 64, 60_000);
  assert.equal(leg.travel, true);
  assert.ok(leg.points.length > 3, "routes along the trail");
  assert.equal(leg.arriveTick, 206, "travel spans the whole action");
  const end = spotToWorld(model, link.toId, -150, 50);
  const last = leg.points[leg.points.length - 1]!;
  assert.deepEqual(last, end);
  const mid = sampleLeg(leg, 203);
  assert.ok(mid.moving);
  assert.ok(mid.heading != null);
});

test("estimateSimTick interpolates between host ticks and freezes when paused", () => {
  const clock: WorldClock = {
    tick: 50,
    paused: false,
    scale: 64,
    clockAt: 0,
    msPerTick: 60_000,
  };
  assert.equal(estimateSimTick(null, 0, 0, 7), 7);
  assert.equal(estimateSimTick(clock, 1000, 1000, 0), 50);
  const half = (60_000 / 64) * 0.5;
  assert.ok(
    Math.abs(estimateSimTick(clock, 1000, 1000 + half, 0) - 50.5) < 1e-9,
  );
  assert.ok(
    estimateSimTick(clock, 1000, 1000 + 10_000, 0) < 51,
    "never runs ahead",
  );
  assert.equal(estimateSimTick({ ...clock, paused: true }, 1000, 9_000, 0), 50);
});

test("gait phase advances with distance, one cycle per stride", () => {
  const stride = strideLength("walk");
  assert.equal(gaitPhase(0, "walk"), 0);
  assert.ok(Math.abs(gaitPhase(stride * 0.25, "walk") - 0.25) < 1e-9);
  assert.ok(Math.abs(gaitPhase(stride * 3.5, "walk") - 0.5) < 1e-9);
});
