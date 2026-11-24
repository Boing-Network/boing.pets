/**
 * Live patches carry only what changed since the previous emit, and a client
 * that merges them by id ends up with the same rows as a fresh full view.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyWorldPatch,
  type CreatureView,
  type HostToClient,
  type WorldPatch,
  type WorldView,
} from "@boing-pets/contract";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { createHostRuntime } from "../src/runtime/host-runtime";
import { buildWorldView } from "../src/view/world-view";
import { diffCreatures } from "../src/view/world-patch";

test("live patches are deltas that rebuild the full view", async () => {
  const messages: HostToClient[] = [];
  let now = 2_000_000;
  const runtime = createHostRuntime({
    repository: new MemoryWorldRepository(),
    seed: 3,
    nowMs: () => now,
    autoFrame: false,
    preferPatches: true,
    emit: (message) => messages.push(message),
  });
  await runtime.start();
  const first = messages.find((m) => m.message === "world.snapshot");
  assert.ok(first && first.message === "world.snapshot");
  let view: WorldView = first.body;

  const patches: WorldPatch[] = [];
  for (let i = 0; i < 40; i += 1) {
    now += 60_000;
    await runtime.tickFrame(60_000);
  }
  for (const message of messages) {
    if (message.message === "world.snapshot") view = message.body;
    if (message.message !== "world.patch") continue;
    patches.push(message.body);
    const merged = applyWorldPatch(view, message.body);
    assert.equal(merged.skipped, 0, "every delta lands on a held row");
    view = merged.view;
  }
  assert.ok(patches.length >= 30, `patched ${patches.length} ticks`);

  // Events never repeat across patches.
  const eventIds = patches.flatMap((p) => p.events.map((e) => e.id));
  assert.equal(new Set(eventIds).size, eventIds.length, "no repeated events");

  // Needs drift every tick, so creature rows ride along each time, but a
  // patch no longer re-sends the commit window's events or quiet rows: it
  // stays under one full view of the same moment.
  for (const [index, patch] of patches.entries()) {
    const bytes = JSON.stringify(patch).length;
    const eventBytes = JSON.stringify(patch.events).length;
    assert.ok(eventBytes < 4_000, `patch ${index} events ${eventBytes}B`);
    // Field-level creature deltas: ~6 KB per tick for 28 pets (was ~45 KB);
    // the 42-species world starts with 84 pets, so the bound scales by 3.
    assert.ok(bytes < 60_000, `patch ${index} ${bytes}B`);
  }
  assert.ok(
    patches.some((p) => p.territories.length === 0),
    "unchanged territories are not re-sent",
  );

  const truth = buildWorldView(runtime.session.snapshot);
  const byId = <T extends { id: number }>(rows: T[]) =>
    new Map(rows.map((row) => [row.id, JSON.stringify(row)]));
  const merged = byId(view.creatures);
  for (const [id, json] of byId(truth.creatures)) {
    assert.equal(merged.get(id), json, `creature ${id} matches`);
  }
  const mergedRel = byId(view.relationships);
  for (const [id, json] of byId(truth.relationships)) {
    assert.equal(mergedRel.get(id), json, `relationship ${id} matches`);
  }
  assert.deepEqual(view.territories, truth.territories);
  await runtime.quit();
});

test("creature deltas carry only changed fields; new rows go out whole", () => {
  const seen = new Map<number, Map<string, string>>();
  const base = {
    id: 1,
    name: "Ash",
    needs: { hunger: 1, thirst: 2 },
    spotX: 3,
  } as unknown as CreatureView;
  const first = diffCreatures([base], seen);
  assert.equal(first.full.length, 1, "first sight is a full row");
  assert.equal(first.deltas.length, 0);
  const same = diffCreatures([base], seen);
  assert.equal(same.full.length + same.deltas.length, 0, "unchanged: nothing");
  const moved = { ...base, needs: { hunger: 5, thirst: 2 } } as CreatureView;
  const next = diffCreatures([moved], seen);
  assert.deepEqual(next.deltas, [{ id: 1, needs: { hunger: 5, thirst: 2 } }]);
});

test("every Nth live view is a full snapshot keyframe", async () => {
  const messages: HostToClient[] = [];
  let now = 2_000_000;
  const runtime = createHostRuntime({
    repository: new MemoryWorldRepository(),
    seed: 3,
    nowMs: () => now,
    autoFrame: false,
    preferPatches: true,
    keyframeEvery: 5,
    emit: (message) => messages.push(message),
  });
  await runtime.start();
  messages.length = 0;
  for (let i = 0; i < 20; i += 1) {
    now += 60_000;
    await runtime.tickFrame(60_000);
  }
  const kinds = messages
    .map((m) => m.message)
    .filter((m) => m === "world.patch" || m === "world.snapshot");
  const snapshots = kinds.filter((m) => m === "world.snapshot").length;
  assert.equal(snapshots, 4, `keyframes in ${kinds.join(",")}`);
  assert.equal(kinds[4], "world.snapshot", "the 5th live view is a keyframe");

  // Keyframes are whole views, so a client that ignores deltas (an older
  // build) or drifted is reset by the next one.
  const keyframe = [...messages]
    .reverse()
    .find((m) => m.message === "world.snapshot");
  assert.ok(keyframe?.message === "world.snapshot", "has a keyframe");
  assert.equal(
    keyframe.body.creatures.length,
    buildWorldView(runtime.session.snapshot).creatures.length,
  );
  await runtime.quit();
});
