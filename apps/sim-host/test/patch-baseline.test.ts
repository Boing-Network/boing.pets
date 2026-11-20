/**
 * Live patches carry only what changed since the previous emit, and a client
 * that merges them by id ends up with the same rows as a fresh full view.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { HostToClient, WorldPatch, WorldView } from "@boing-pets/contract";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { createHostRuntime } from "../src/runtime/host-runtime";
import { buildWorldView } from "../src/view/world-view";

function merge<T extends { id: number }>(current: T[], incoming: T[]): T[] {
  const map = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) map.set(row.id, row);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

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
    view = {
      ...view,
      creatures: merge(view.creatures, message.body.creatures),
      relationships: merge(view.relationships, message.body.relationships),
      events: merge(view.events, message.body.events),
      territories: merge(view.territories, message.body.territories),
    };
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
    assert.ok(bytes < 80_000, `patch ${index} ${bytes}B`);
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
