import assert from "node:assert/strict";
import { test } from "node:test";
import type { HostToClient } from "@boing-pets/contract";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { createHostRuntime } from "../src/runtime/host-runtime";

test("host runtime boots empty store, emits snapshot, and answers family query", async () => {
  const repository = new MemoryWorldRepository();
  const messages: HostToClient[] = [];
  let now = 1_000_000;

  const runtime = createHostRuntime({
    repository,
    seed: 1,
    nowMs: () => now,
    autoFrame: false,
    emit: (message) => {
      messages.push(message);
    },
  });

  await runtime.start();

  const snapshot = messages.find(
    (message) => message.message === "world.snapshot",
  );
  assert.ok(snapshot);
  assert.equal(snapshot.message, "world.snapshot");
  if (snapshot.message !== "world.snapshot") return;
  assert.equal(snapshot.body.territories.length, 7);
  assert.equal(snapshot.body.creatures.length, 70);

  const family = await runtime.handleQuery({
    message: "query.family",
    body: { creatureId: 1 },
  });
  assert.equal(family.message, "query.family");

  await runtime.handleCommand({ message: "clock.pause", body: {} });
  const clock = messages
    .filter((message) => message.message === "world.clock")
    .at(-1);
  assert.ok(clock);
  assert.equal(clock.message, "world.clock");
  if (clock.message === "world.clock") {
    assert.equal(clock.body.paused, true);
  }

  now += 60_000;
  await runtime.quit();
});
