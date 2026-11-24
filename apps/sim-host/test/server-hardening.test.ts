/**
 * One player must not be able to stall, wedge or flood the shared world:
 * bad influences are refused (not treated as save failures), an influence
 * whose target is gone lapses, inspection queries share one store read off
 * the writer lock, sockets are capped, and keyframes keep their events.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { WebSocket } from "ws";
import {
  CreatureStatus,
  EventKind,
  InfluenceKind,
  MP_PROTOCOL_VERSION,
  type HostToClient,
  type WsServerToClient,
} from "@boing-pets/contract";
import type { WorldEvent } from "@boing-pets/sim";
import {
  INFLUENCE_RATE_LIMIT,
  acceptedInWindow,
  createInfluenceGate,
  submitInfluence,
} from "../src/influence";
import { createSharedWorldHost } from "../src/multiplayer/shared-world-host";
import {
  listenSharedWorldWs,
  publicQueryError,
  type SharedWorldWsServerOptions,
} from "../src/multiplayer/ws-server";
import { createDirtySet } from "../src/persist/dirty";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { bootSession, commitSession, stepSession } from "../src/session";
import { createPatchBaseline, unsentEventViews } from "../src/view/world-patch";

async function waitFor(predicate: () => boolean, timeoutMs = 3_000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

class CountingRepository extends MemoryWorldRepository {
  reads = 0;
  override async readTables() {
    this.reads += 1;
    return super.readTables();
  }
}

async function startServer(
  options: Partial<SharedWorldWsServerOptions> & {
    nowMs?: () => number;
  } = {},
) {
  const repository = new CountingRepository();
  /** Account that owns every creature (null: nobody does). */
  const owner: { accountId: string | null } = { accountId: null };
  const host = createSharedWorldHost({
    repository,
    seed: 1,
    nowMs: options.nowMs ?? (() => 7_000_000),
    autoFrame: false,
    creatureOwners: async () => () => owner.accountId,
  });
  await host.start();
  const server = await listenSharedWorldWs({
    host,
    port: 0,
    tokenSecret: randomBytes(32),
    heartbeatMs: 0,
    ...options,
  });
  return { host, server, repository, owner };
}

function openClient(url: string) {
  const frames: WsServerToClient[] = [];
  const ws = new WebSocket(url);
  const ready = new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  let closeCode: number | null = null;
  ws.on("close", (code) => {
    closeCode = code;
  });
  ws.on("message", (data) => {
    frames.push(JSON.parse(String(data)) as WsServerToClient);
  });
  const hostMessages = (kind: HostToClient["message"]) =>
    frames
      .filter(
        (f): f is Extract<WsServerToClient, { type: "host" }> =>
          f.type === "host",
      )
      .filter((f) => f.message.message === kind);
  return {
    ws,
    frames,
    ready,
    hostMessages,
    closeCode: () => closeCode,
    async hello() {
      await ready;
      ws.send(JSON.stringify({ type: "hello", v: MP_PROTOCOL_VERSION }));
      await waitFor(
        () =>
          frames.some((f) => f.type === "welcome") &&
          hostMessages("world.clock").length > 0,
      );
    },
    send(frame: unknown) {
      ws.send(JSON.stringify(frame));
    },
  };
}

const rename = (creatureId: number, name = "Ada") => ({
  kind: InfluenceKind.NAME_CREATURE,
  payload: { creatureId, name },
});

test("a bad influence is refused without costing allowance", async () => {
  const session = await bootSession(new MemoryWorldRepository(), 1);
  const gate = createInfluenceGate();
  const living = session.snapshot.creatures[0]!;

  assert.deepEqual(await submitInfluence(session, gate, rename(999_999), 1), {
    ok: false,
    reason: "invalid",
    detail: "that creature is no longer alive",
  });
  assert.deepEqual(
    await submitInfluence(session, gate, rename(living.id, ""), 1),
    { ok: false, reason: "invalid", detail: "a name is required" },
  );
  assert.deepEqual(
    await submitInfluence(
      session,
      gate,
      { kind: InfluenceKind.ENRICH_TERRITORY, payload: { territoryId: -4 } },
      1,
    ),
    { ok: false, reason: "invalid", detail: "unknown territory" },
  );
  assert.equal(acceptedInWindow(gate, 1), 0);
  assert.equal(session.snapshot.pendingInfluences.length, 0);

  // Dead but not yet pruned from the hot snapshot: also refused.
  living.status = CreatureStatus.DEAD;
  const dead = await submitInfluence(session, gate, rename(living.id), 1);
  assert.equal(dead.ok, false);
  living.status = CreatureStatus.ALIVE;
  assert.equal(
    (await submitInfluence(session, gate, rename(living.id), 1)).ok,
    true,
  );
});

test("an influence whose target is gone lapses instead of stopping the world", async () => {
  const session = await bootSession(new MemoryWorldRepository(), 1);
  const tick = session.snapshot.world.lastTick + 1;
  const orphan = (id: number, kind: InfluenceKind, payload: unknown) => ({
    id,
    worldId: session.snapshot.world.id,
    kind,
    issuedAtTick: tick,
    payload: payload as never,
    applied: false,
  });
  const firstId = session.snapshot.world.nextInfluenceId;
  session.snapshot.world.nextInfluenceId += 4;
  session.snapshot.pendingInfluences.push(
    orphan(firstId, InfluenceKind.NAME_CREATURE, {
      creatureId: 999_999,
      name: "Ghost",
    }),
    orphan(firstId + 1, InfluenceKind.NAME_LINEAGE, {
      lineageId: 999_999,
      name: "Ghosts",
    }),
    orphan(firstId + 2, InfluenceKind.FAVOR_BLOODLINE, { lineageId: 999_999 }),
    orphan(firstId + 3, InfluenceKind.ENRICH_TERRITORY, {
      territoryId: 999_999,
    }),
  );

  assert.doesNotThrow(() => stepSession(session));
  assert.equal(session.snapshot.world.lastTick, tick);
  // Marked applied (so the commit retires them), and nothing was changed.
  assert.ok(
    session.snapshot.pendingInfluences
      .filter((row) => row.id >= firstId)
      .every((row) => row.applied),
  );
  assert.equal(session.snapshot.modifiers.length, 0);
  // The world keeps going afterwards, across a save.
  await commitSession(session);
  assert.doesNotThrow(() => stepSession(session));
});

test("a bad influence over the socket is a notice, not a save failure", async () => {
  const ctx = await startServer();
  const c = openClient(ctx.server.url);
  await c.hello();
  const submit = (body: unknown) =>
    c.send({
      type: "command",
      message: { message: "influence.submit", body },
    });

  submit(rename(999_999_999));
  await waitFor(() => c.hostMessages("session.notice").length > 0);
  const notice = c.hostMessages("session.notice")[0]!.message;
  assert.ok(notice.message === "session.notice");
  assert.equal(notice.body.code, "influence_rejected");
  assert.equal(notice.body.detail, "that creature is no longer alive");
  assert.equal(ctx.host.runtime.persistenceStatus().saveFailures, 0);

  // Influences still work afterwards: the creature's owner can rename it.
  const welcome = c.frames.find((f) => f.type === "welcome");
  assert.ok(welcome && welcome.type === "welcome");
  ctx.owner.accountId = welcome.accountId;
  const living = ctx.host.runtime.session.snapshot.creatures[0]!;
  for (let i = 0; i < INFLUENCE_RATE_LIMIT; i += 1) {
    submit(rename(living.id, `Ada ${i}`));
  }
  await waitFor(
    () =>
      ctx.host.runtime.session.snapshot.pendingInfluences.length ===
      INFLUENCE_RATE_LIMIT,
  );
  c.ws.close();
  await ctx.server.close();
  await ctx.host.quit();
});

test("a burst of inspection queries shares one read of the store", async () => {
  const ctx = await startServer();
  const c = openClient(ctx.server.url);
  await c.hello();
  const creatureId = ctx.host.runtime.session.snapshot.creatures[0]!.id;
  const before = ctx.repository.reads;

  for (let id = 1; id <= 10; id += 1) {
    c.send({
      type: "query",
      id,
      message: {
        message: id % 2 === 0 ? "query.family" : "query.creature",
        body: { creatureId },
      },
    });
  }
  await waitFor(
    () => c.frames.filter((f) => f.type === "query-result").length === 10,
  );
  assert.equal(ctx.repository.reads - before, 1);

  // A save changes the store, so the next query reads again (once).
  await ctx.host.runtime.tickFrame(60_000);
  await ctx.host.runtime.handleCommand({ message: "clock.pause", body: {} });
  c.send({
    type: "query",
    id: 11,
    message: { message: "query.creature", body: { creatureId } },
  });
  await waitFor(
    () => c.frames.filter((f) => f.type === "query-result").length === 11,
  );
  assert.equal(ctx.repository.reads - before, 2);

  // Past the per-socket query rate, the rest are refused, not queued.
  for (let id = 100; id < 130; id += 1) {
    c.send({
      type: "query",
      id,
      message: { message: "query.creature", body: { creatureId } },
    });
  }
  await waitFor(() =>
    c.frames.some(
      (f) => f.type === "query-error" && f.error === "busy; try again",
    ),
  );
  assert.equal(ctx.repository.reads - before, 2);
  c.ws.close();
  await ctx.server.close();
  await ctx.host.quit();
});

test("query errors never leak internal text", () => {
  assert.equal(
    publicQueryError(new Error("creature 12 not found")),
    "creature 12 not found",
  );
  assert.equal(
    publicQueryError(
      new Error("Can't reach database server at db.internal:5432"),
    ),
    "query failed",
  );
  assert.equal(publicQueryError("boom"), "query failed");
});

test("connections are capped per address and must say hello", async () => {
  const ctx = await startServer({
    maxClientsPerAddress: 2,
    helloTimeoutMs: 80,
  });
  const a = openClient(ctx.server.url);
  const b = openClient(ctx.server.url);
  await a.hello();
  await b.ready;

  const third = new WebSocket(ctx.server.url);
  const refused = await new Promise<string>((resolve) => {
    third.once("open", () => resolve("open"));
    third.once("error", (error) => resolve(error.message));
  });
  assert.match(refused, /429/);

  // `b` never says hello: closed. `a` joined in time: kept.
  await waitFor(() => b.closeCode() != null);
  assert.equal(b.closeCode(), 1008);
  assert.equal(a.ws.readyState, WebSocket.OPEN);

  // The slot `b` held is free again.
  const again = openClient(ctx.server.url);
  await again.hello();
  a.ws.close();
  again.ws.close();
  await ctx.server.close();
  await ctx.host.quit();
});

test("the real client address comes from the proxy header when configured", async () => {
  const ctx = await startServer({
    maxClientsPerAddress: 1,
    clientAddressHeader: "Fly-Client-IP",
  });
  const open = (address: string) =>
    new Promise<WebSocket | string>((resolve) => {
      const ws = new WebSocket(ctx.server.url, {
        headers: { "fly-client-ip": address },
      });
      ws.once("open", () => resolve(ws));
      ws.once("error", (error) => resolve(error.message));
    });
  const first = await open("203.0.113.7");
  const sameAddress = await open("203.0.113.7");
  const otherAddress = await open("203.0.113.8");
  assert.ok(first instanceof WebSocket);
  assert.equal(typeof sameAddress, "string");
  assert.ok(otherAddress instanceof WebSocket);
  first.close();
  otherAddress.close();
  await ctx.server.close();
  await ctx.host.quit();
});

test("repeated resync requests get one base snapshot, not one each", async () => {
  let now = 7_000_000;
  const ctx = await startServer({ nowMs: () => now });
  const c = openClient(ctx.server.url);
  await c.hello();
  const snapshots = () => c.hostMessages("world.snapshot").length;
  const before = snapshots();

  for (let i = 0; i < 15; i += 1) c.send({ type: "resync" });
  c.send({ type: "ping", t: 1 });
  await waitFor(() => c.frames.some((f) => f.type === "pong"));
  assert.equal(snapshots() - before, 1);

  now += 5_000;
  c.send({ type: "resync" });
  await waitFor(() => snapshots() - before === 2);
  c.ws.close();
  await ctx.server.close();
  await ctx.host.quit();
});

test("a keyframe carries the events no patch has sent yet", () => {
  const dirty = createDirtySet();
  const event = (id: number): WorldEvent => ({
    id,
    worldId: 1,
    tick: 40 + id,
    kind: EventKind.BIRTH,
    actorId: id,
    subjectId: null,
    territoryId: 1,
    lineageId: 1,
    summary: `event ${id}`,
    payload: null as never,
  });
  dirty.events.push(event(3), event(1), event(2));
  const baseline = createPatchBaseline();
  baseline.lastEventId = 1;
  assert.deepEqual(
    unsentEventViews(dirty, baseline).map((e) => e.id),
    [2, 3],
  );
  baseline.lastEventId = 3;
  assert.deepEqual(unsentEventViews(dirty, baseline), []);
});
