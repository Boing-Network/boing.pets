/**
 * M22: Multiplayer host seam.
 * Shared-world host accepts multiple clients; one writer; step() hashes match.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { InfluenceKind, type HostToClient } from "@boing-pets/contract";
import { canonicalHash, createWorld, step } from "@boing-pets/sim";
import {
  INFLUENCE_RATE_LIMIT,
  LOCAL_ACCOUNT_ID,
  createHostRuntime,
  createSharedWorldHost,
} from "../src/index";
import { MemoryWorldRepository } from "../src/persist/memory-repository";

const HERE = dirname(fileURLToPath(import.meta.url));

function collectEmit() {
  const messages: HostToClient[] = [];
  return {
    messages,
    emit: (message: HostToClient) => {
      messages.push(message);
    },
    of(type: HostToClient["message"]) {
      return messages.filter((m) => m.message === type);
    },
  };
}

test("shared host joins two clients and fans out clock + snapshot", async () => {
  const repository = new MemoryWorldRepository();
  const host = createSharedWorldHost({
    repository,
    seed: 1,
    nowMs: () => 1_000_000,
    autoFrame: false,
  });
  await host.start();

  const alice = collectEmit();
  const bob = collectEmit();

  const a = await host.join({
    accountId: "alice",
    emit: alice.emit,
    role: "owner",
  });
  const b = await host.join({ accountId: "bob", emit: bob.emit });
  assert.ok(a);
  assert.ok(b);
  assert.equal(host.clients.size(), 2);

  assert.equal(alice.of("session.welcome").length, 1);
  assert.equal(bob.of("session.welcome").length, 1);
  assert.equal(alice.of("world.snapshot").length, 1);
  assert.equal(bob.of("world.snapshot").length, 1);

  await host.handleCommand(a.sessionId, {
    message: "clock.pause",
    body: {},
  });

  // Fan-out: both clients see the shared clock pause.
  assert.ok(alice.of("world.clock").length >= 1);
  assert.ok(bob.of("world.clock").length >= 1);
  const aliceClock = alice.of("world.clock").at(-1);
  const bobClock = bob.of("world.clock").at(-1);
  assert.ok(aliceClock?.message === "world.clock");
  assert.ok(bobClock?.message === "world.clock");
  if (aliceClock?.message === "world.clock") {
    assert.equal(aliceClock.body.paused, true);
  }
  if (bobClock?.message === "world.clock") {
    assert.equal(bobClock.body.paused, true);
  }

  host.leave(a.sessionId);
  assert.equal(host.clients.size(), 1);
  await host.quit();
});

test("per-account influence rate limits are independent", async () => {
  const repository = new MemoryWorldRepository();
  const host = createSharedWorldHost({
    repository,
    seed: 1,
    nowMs: () => 2_000_000,
    autoFrame: false,
  });
  await host.start();

  const alice = collectEmit();
  const bob = collectEmit();
  const a = await host.join({ accountId: "alice", emit: alice.emit });
  const b = await host.join({ accountId: "bob", emit: bob.emit });
  assert.ok(a);
  assert.ok(b);

  const meadow = host.runtime.session.snapshot.territories.find(
    (row) => row.slug === "meadow",
  );
  assert.ok(meadow);

  for (let i = 0; i < INFLUENCE_RATE_LIMIT; i += 1) {
    await host.handleCommand(a.sessionId, {
      message: "influence.submit",
      body: {
        kind: InfluenceKind.ENRICH_TERRITORY,
        payload: { territoryId: meadow.id },
      },
    });
  }

  // Alice is rate-limited; Bob can still influence.
  const before = host.runtime.session.snapshot.world.nextInfluenceId;
  await host.handleCommand(a.sessionId, {
    message: "influence.submit",
    body: {
      kind: InfluenceKind.CALM_TERRITORY,
      payload: { territoryId: meadow.id },
    },
  });
  assert.equal(host.runtime.session.snapshot.world.nextInfluenceId, before);

  await host.handleCommand(b.sessionId, {
    message: "influence.submit",
    body: {
      kind: InfluenceKind.CALM_TERRITORY,
      payload: { territoryId: meadow.id },
    },
  });
  assert.equal(host.runtime.session.snapshot.world.nextInfluenceId, before + 1);

  await host.quit();
});

test("single writer serializes concurrent client commands", async () => {
  const repository = new MemoryWorldRepository();
  const host = createSharedWorldHost({
    repository,
    seed: 1,
    nowMs: () => 3_000_000,
    autoFrame: false,
  });
  await host.start();

  const alice = collectEmit();
  const bob = collectEmit();
  // One owner, two tabs: both may drive the clock.
  const a = await host.join({
    accountId: "alice",
    emit: alice.emit,
    role: "owner",
  });
  const b = await host.join({
    accountId: "alice",
    emit: bob.emit,
    role: "owner",
  });
  assert.ok(a);
  assert.ok(b);

  const order: string[] = [];
  const p1 = host
    .handleCommand(a.sessionId, { message: "clock.pause", body: {} })
    .then(() => {
      order.push("alice");
    });
  const p2 = host
    .handleCommand(b.sessionId, { message: "clock.resume", body: {} })
    .then(() => {
      order.push("bob");
    });
  await Promise.all([p1, p2]);
  assert.deepEqual(order, ["alice", "bob"]);
  assert.equal(host.runtime.clock.paused, false);

  await host.quit();
});

test("step hashes match single-writer path with same influences", async () => {
  // Shared host queues influences into the same pendingInfluences list that
  // local submitInfluence uses. Pure step() must hash identically.
  const sharedRepo = new MemoryWorldRepository();
  const host = createSharedWorldHost({
    repository: sharedRepo,
    seed: 1,
    nowMs: () => 4_000_000,
    autoFrame: false,
  });
  await host.start();
  const alice = collectEmit();
  const session = await host.join({ accountId: "alice", emit: alice.emit });
  assert.ok(session);
  const lineage = host.runtime.session.snapshot.lineages[0];
  assert.ok(lineage);
  await host.handleCommand(session.sessionId, {
    message: "influence.submit",
    body: {
      kind: InfluenceKind.FAVOR_BLOODLINE,
      payload: { lineageId: lineage.id },
    },
  });

  const sharedSnap = structuredClone(host.runtime.session.snapshot);
  const sharedHash = (() => {
    const { snapshot } = step(structuredClone(sharedSnap));
    return canonicalHash(snapshot);
  })();

  // Offline-equivalent: createWorld + same influence row + step.
  const { snapshot: localSnap } = createWorld(1);
  localSnap.world.clockAtMs = 4_000_000;
  const favor = sharedSnap.pendingInfluences[0];
  assert.ok(favor);
  localSnap.pendingInfluences.push(structuredClone(favor));
  localSnap.world.nextInfluenceId = sharedSnap.world.nextInfluenceId;
  const { snapshot: afterLocal } = step(localSnap);
  assert.equal(canonicalHash(afterLocal), sharedHash);

  await host.quit();
});

test("local HostRuntime still works without multiplayer join", async () => {
  const repository = new MemoryWorldRepository();
  const messages: HostToClient[] = [];
  const runtime = createHostRuntime({
    repository,
    seed: 1,
    nowMs: () => 5_000_000,
    autoFrame: false,
    emit: (message) => {
      messages.push(message);
    },
  });
  await runtime.start();
  assert.ok(messages.some((m) => m.message === "world.snapshot"));
  await runtime.handleCommand({ message: "clock.pause", body: {} });
  assert.equal(runtime.clock.paused, true);
  assert.ok(runtime.influenceBook.byAccount.has(LOCAL_ACCOUNT_ID));
  await runtime.quit();
});

test("packages/sim must not import multiplayer or ws", () => {
  const root = join(HERE, "../../../packages/sim/src");
  const files: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".ts")) files.push(full);
    }
  }
  walk(root);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes("multiplayer"), false, file);
    assert.equal(text.includes('from "ws"'), false, file);
    assert.equal(text.includes("WebSocket"), false, file);
  }
});
