import assert from "node:assert/strict";
import { test } from "node:test";
import type { HostToClient } from "@boing-pets/contract";
import { canonicalHash } from "@boing-pets/sim";
import {
  BrowserWorldRepository,
  createMemoryStringStore,
} from "../src/persist/browser-repository";
import { createHostRuntime } from "../src/runtime/host-runtime";
import { bootSession, commitSession, stepSession } from "../src/session";

test("browser repository survives relaunch with the same canonical hash", async () => {
  const store = createMemoryStringStore();
  const first = new BrowserWorldRepository({ store });
  const session = await bootSession(first, 1, { nowMs: 1_000_000 });

  for (let i = 0; i < 12; i += 1) {
    stepSession(session);
  }
  await commitSession(session);
  const hashAfter = canonicalHash(session.snapshot);
  const tickAfter = session.snapshot.world.lastTick;

  const second = new BrowserWorldRepository({ store });
  const reloaded = await bootSession(second, 1, { nowMs: 1_000_000 });
  assert.equal(reloaded.snapshot.world.lastTick, tickAfter);
  assert.equal(canonicalHash(reloaded.snapshot), hashAfter);
});

test("browser host runtime catch-up advances past the last quit stamp", async () => {
  const store = createMemoryStringStore();
  const messages: HostToClient[] = [];
  let now = 2_000_000;

  const firstRuntime = createHostRuntime({
    repository: new BrowserWorldRepository({ store }),
    seed: 1,
    nowMs: () => now,
    autoFrame: false,
    emit: (message) => {
      messages.push(message);
    },
  });
  await firstRuntime.start();
  const bootSnapshot = messages.find(
    (message) => message.message === "world.snapshot",
  );
  assert.ok(bootSnapshot);
  assert.equal(bootSnapshot.message, "world.snapshot");
  if (bootSnapshot.message !== "world.snapshot") return;
  const bootTick = bootSnapshot.body.world.lastTick;

  // Step a few live ticks so the durable store is dirty, then quit.
  await firstRuntime.tickFrame(60_000 * 4);
  const midTick = firstRuntime.session.snapshot.world.lastTick;
  assert.ok(midTick > bootTick);
  await firstRuntime.quit();

  // Time passes while the tab is closed.
  now += 60_000 * 20;

  const catchupMessages: HostToClient[] = [];
  const secondRuntime = createHostRuntime({
    repository: new BrowserWorldRepository({ store }),
    seed: 1,
    nowMs: () => now,
    autoFrame: false,
    emit: (message) => {
      catchupMessages.push(message);
    },
  });
  await secondRuntime.start();

  const catchup = catchupMessages.find(
    (message) => message.message === "world.catchup",
  );
  assert.ok(catchup, "expected world.catchup after offline gap");
  const snapshot = catchupMessages.find(
    (message) => message.message === "world.snapshot",
  );
  assert.ok(snapshot);
  assert.equal(snapshot.message, "world.snapshot");
  if (snapshot.message !== "world.snapshot") return;
  assert.ok(snapshot.body.world.lastTick > midTick);

  // Seed 1 createWorld is not re-run — creatures keep living state.
  assert.equal(snapshot.body.world.seed, 1);
  assert.ok(snapshot.body.creatures.length >= 12);

  await secondRuntime.quit();
});
