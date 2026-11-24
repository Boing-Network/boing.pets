/**
 * Shared-world WebSocket protocol v2: identity, owner role, ordering /
 * resync, validation and limits, reconnect with a session token.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import {
  InfluenceKind,
  MP_MAX_CLIENT_MESSAGE_BYTES,
  MP_PROTOCOL_VERSION,
  type HostToClient,
  type WsServerToClient,
} from "@boing-pets/contract";
import {
  INFLUENCE_RATE_LIMIT,
  createSharedWorldHost,
  listenSharedWorldWs,
  parseWsClientMessage,
  signSessionToken,
  slowClientDecision,
  validateCommand,
  validateQuery,
  verifySessionToken,
  type SharedWorldHost,
} from "../src/index";
import { MemoryWorldRepository } from "../src/persist/memory-repository";

const OWNER_KEY = "test-owner-key-123";

async function waitFor(predicate: () => boolean, timeoutMs = 3_000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function startServer(options: { nowMs?: () => number } = {}) {
  /** Account that owns every creature (null: nobody does). */
  const owner: { accountId: string | null } = { accountId: null };
  const host = createSharedWorldHost({
    repository: new MemoryWorldRepository(),
    seed: 1,
    nowMs: options.nowMs ?? (() => 7_000_000),
    autoFrame: false,
    creatureOwners: async () => () => owner.accountId,
  });
  await host.start();
  const secret = randomBytes(32);
  const server = await listenSharedWorldWs({
    host,
    port: 0,
    tokenSecret: secret,
    ownerKey: OWNER_KEY,
    heartbeatMs: 0,
  });
  return { host, server, secret, owner };
}

type Client = ReturnType<typeof openClient>;

function openClient(url: string) {
  const frames: WsServerToClient[] = [];
  const ws = new WebSocket(url);
  const ready = new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.on("message", (data) => {
    frames.push(JSON.parse(String(data)) as WsServerToClient);
  });
  const closed = new Promise<void>((resolve) =>
    ws.once("close", () => resolve()),
  );
  return {
    ws,
    frames,
    closed,
    host(): Array<Extract<WsServerToClient, { type: "host" }>> {
      return frames.filter(
        (f): f is Extract<WsServerToClient, { type: "host" }> =>
          f.type === "host",
      );
    },
    messages(kind: HostToClient["message"]): HostToClient[] {
      return this.host()
        .map((f) => f.message)
        .filter((m) => m.message === kind);
    },
    welcome() {
      return frames.find(
        (f): f is Extract<WsServerToClient, { type: "welcome" }> =>
          f.type === "welcome",
      );
    },
    async hello(
      extra: { token?: string; ownerKey?: string; name?: string } = {},
    ) {
      await ready;
      ws.send(
        JSON.stringify({ type: "hello", v: MP_PROTOCOL_VERSION, ...extra }),
      );
      await waitFor(
        () => this.welcome() != null && this.messages("world.clock").length > 0,
      );
      return this.welcome()!;
    },
    send(frame: unknown) {
      ws.send(typeof frame === "string" ? frame : JSON.stringify(frame));
    },
    close() {
      ws.close();
    },
  };
}

async function stop(
  ctx: { host: SharedWorldHost; server: { close(): Promise<void> } },
  clients: Client[],
) {
  for (const c of clients) c.close();
  await ctx.server.close();
  await ctx.host.quit();
}

test("two clients join one world; owner rescales, both see the same clock", async () => {
  const ctx = await startServer();
  const owner = openClient(ctx.server.url);
  const guest = openClient(ctx.server.url);
  const ow = await owner.hello({ ownerKey: OWNER_KEY, name: "Nico" });
  const gw = await guest.hello({ name: "Visitor" });
  assert.equal(ow.role, "owner");
  assert.equal(ow.displayName, "Nico");
  assert.equal(gw.role, "player");
  assert.match(gw.accountId, /^guest-[0-9a-f]{12}$/);
  assert.notEqual(ow.accountId, gw.accountId);

  // Join snapshot is a base point.
  const base = guest.host().find((f) => f.message.message === "world.snapshot");
  assert.equal(base?.base, true);

  owner.send({
    type: "command",
    message: { message: "clock.setScale", body: { scale: 16 } },
  });
  await waitFor(() =>
    guest
      .messages("world.clock")
      .some((m) => m.message === "world.clock" && m.body.scale === 16),
  );
  assert.equal(ctx.host.runtime.clock.scale, 16);

  // The player may not pause; only the sender hears about it.
  guest.send({
    type: "command",
    message: { message: "clock.pause", body: {} },
  });
  await waitFor(() => guest.messages("session.notice").length > 0);
  const notice = guest.messages("session.notice")[0]!;
  assert.equal(
    notice.message === "session.notice" && notice.body.code,
    "not_owner",
  );
  assert.equal(ctx.host.runtime.clock.paused, false);
  assert.equal(owner.messages("session.notice").length, 0);

  // A live tick fans out identical numbered patches to both.
  await ctx.host.runtime.tickFrame(60_000 / 16);
  await waitFor(
    () =>
      owner.messages("world.patch").length > 0 &&
      guest.messages("world.patch").length > 0,
  );
  const op = owner.host().find((f) => f.message.message === "world.patch")!;
  const gp = guest.host().find((f) => f.message.message === "world.patch")!;
  assert.equal(op.seq, gp.seq);
  assert.deepEqual(op.message, gp.message);

  await stop(ctx, [owner, guest]);
});

test("broadcast seq is contiguous and resync returns a base snapshot", async () => {
  const ctx = await startServer();
  const c = openClient(ctx.server.url);
  await c.hello({ ownerKey: OWNER_KEY });
  for (let i = 0; i < 3; i += 1) await ctx.host.runtime.tickFrame(60_000);
  await waitFor(() => c.messages("world.patch").length >= 3);
  const live = c.host().filter((f) => !f.base);
  for (let i = 1; i < live.length; i += 1) {
    assert.equal(live[i]!.seq, live[i - 1]!.seq + 1, "no gaps");
  }
  const bases = c.host().filter((f) => f.base).length;
  c.send({ type: "resync" });
  await waitFor(() => c.host().filter((f) => f.base).length >= bases + 2);
  const last = c.host().at(-1)!;
  assert.equal(last.base, true);
  assert.equal(last.seq, ctx.host.seq);
  await stop(ctx, [c]);
});

test("a reconnect with the session token keeps the same account and role", async () => {
  const ctx = await startServer();
  const first = openClient(ctx.server.url);
  const w1 = await first.hello({ ownerKey: OWNER_KEY, name: "Nico" });
  first.close();
  await first.closed;
  await waitFor(() => ctx.host.clients.size() === 0);

  const second = openClient(ctx.server.url);
  const w2 = await second.hello({ token: w1.token });
  assert.equal(w2.accountId, w1.accountId);
  assert.equal(w2.role, "owner", "owner role travels in the signed token");
  assert.equal(w2.displayName, "Nico");

  // A tampered token is refused and the client becomes a fresh guest.
  const third = openClient(ctx.server.url);
  const [body] = w1.token.split(".");
  const forged = `${body}.${Buffer.from("x".repeat(32)).toString("base64url")}`;
  const w3 = await third.hello({ token: forged });
  assert.notEqual(w3.accountId, w1.accountId);
  assert.equal(w3.role, "player");
  assert.ok(
    third.frames.some((f) => f.type === "error" && f.code === "invalid_token"),
  );
  await stop(ctx, [second, third]);
});

test("a rename is for the owner, once a month, across sockets", async () => {
  const ctx = await startServer();
  const a1 = openClient(ctx.server.url);
  const wa = await a1.hello({});
  ctx.owner.accountId = wa.accountId;
  const creature = ctx.host.runtime.session.snapshot.creatures[0]!;
  const enrich = {
    type: "command",
    message: {
      message: "influence.submit",
      body: {
        kind: InfluenceKind.NAME_CREATURE,
        payload: { creatureId: creature.id, name: "Ada" },
      },
    },
  };
  for (let i = 0; i < INFLUENCE_RATE_LIMIT; i += 1) a1.send(enrich);
  await waitFor(
    () =>
      ctx.host.runtime.session.snapshot.pendingInfluences.length ===
      INFLUENCE_RATE_LIMIT,
  );
  // The owner on a second socket (e.g. another tab): already renamed
  // this month.
  const a2 = openClient(ctx.server.url);
  await a2.hello({ token: wa.token });
  a2.send(enrich);
  await waitFor(() => a2.messages("session.notice").length > 0);
  const n = a2.messages("session.notice")[0]!;
  assert.equal(n.message === "session.notice" && n.body.code, "rate_limited");
  // Anyone else cannot rename it at all.
  const b = openClient(ctx.server.url);
  await b.hello({});
  b.send(enrich);
  await waitFor(() => b.messages("session.notice").length > 0);
  const refused = b.messages("session.notice")[0]!;
  assert.equal(
    refused.message === "session.notice" && refused.body.code,
    "not_owner",
  );
  assert.equal(
    ctx.host.runtime.session.snapshot.pendingInfluences.length,
    INFLUENCE_RATE_LIMIT,
  );
  await stop(ctx, [a1, a2, b]);
});

test("garbage, invalid payloads, floods and oversized frames are contained", async () => {
  const ctx = await startServer();
  const c = openClient(ctx.server.url);
  await c.hello({});
  c.send("not json");
  c.send({
    type: "command",
    message: { message: "clock.setScale", body: { scale: 3 } },
  });
  c.send({
    type: "command",
    message: {
      message: "influence.submit",
      body: {
        kind: "NAME_CREATURE",
        payload: { creatureId: 1, name: "\u0007bell" },
      },
    },
  });
  c.send({
    type: "command",
    message: { message: "session.join", body: { accountId: "x" } },
  });
  await waitFor(() =>
    c.frames.some((f) => f.type === "error" && f.code === "invalid_message"),
  );
  await waitFor(() => c.messages("session.notice").length >= 3);
  assert.equal(ctx.host.runtime.session.snapshot.pendingInfluences.length, 0);

  // Commands before hello are refused.
  const early = openClient(ctx.server.url);
  await new Promise<void>((resolve) => early.ws.once("open", () => resolve()));
  early.send({
    type: "command",
    message: { message: "clock.pause", body: {} },
  });
  await waitFor(() =>
    early.frames.some((f) => f.type === "error" && f.code === "not_joined"),
  );
  assert.equal(ctx.host.runtime.clock.paused, false);

  // Flood: the token bucket answers rate_limited instead of processing.
  for (let i = 0; i < 80; i += 1) c.send({ type: "ping", t: i });
  await waitFor(() =>
    c.frames.some((f) => f.type === "error" && f.code === "rate_limited"),
  );

  // Oversized frame: ws closes the socket (1009) without touching the host.
  const big = openClient(ctx.server.url);
  await new Promise<void>((resolve) => big.ws.once("open", () => resolve()));
  big.send("x".repeat(MP_MAX_CLIENT_MESSAGE_BYTES + 1));
  await big.closed;
  await stop(ctx, [c, early]);
});

test("heartbeat tolerates a stalled reader but drops a dead one", async () => {
  const host = createSharedWorldHost({
    repository: new MemoryWorldRepository(),
    seed: 1,
    nowMs: () => 7_000_000,
    autoFrame: false,
  });
  await host.start();
  const server = await listenSharedWorldWs({
    host,
    port: 0,
    tokenSecret: randomBytes(32),
    heartbeatMs: 40,
    heartbeatMisses: 3,
  });
  // Never answers protocol pings, but keeps talking: still alive.
  const chatty = new WebSocket(server.url, { autoPong: false });
  // Never answers and never talks: dropped after the allowed misses.
  const silent = new WebSocket(server.url, { autoPong: false });
  let silentClosedAt = 0;
  silent.once("close", () => (silentClosedAt = Date.now()));
  await Promise.all(
    [chatty, silent].map((ws) => new Promise((r) => ws.once("open", r))),
  );
  const opened = Date.now();
  const timer = setInterval(
    () => chatty.send(JSON.stringify({ type: "ping", t: 1 })),
    30,
  );
  await waitFor(() => silentClosedAt > 0, 3_000);
  assert.ok(
    silentClosedAt - opened >= 100,
    "not dropped on the first missed pong",
  );
  assert.equal(
    chatty.readyState,
    WebSocket.OPEN,
    "any inbound frame counts as liveness",
  );
  clearInterval(timer);
  chatty.close();
  await server.close();
  await host.quit();
});

test("a skipped slow client is rebased once its backlog drains", () => {
  const max = 1000;
  assert.equal(slowClientDecision(false, 10, max), "send");
  assert.equal(slowClientDecision(false, 1001, max), "skip");
  assert.equal(
    slowClientDecision(true, 800, max),
    "skip",
    "wait for the backlog to halve",
  );
  assert.equal(
    slowClientDecision(true, 400, max),
    "rebase",
    "no gap reaches the client, so the server must rebase",
  );
});

test("session tokens verify, expire, and reject tampering", () => {
  const secret = randomBytes(32);
  const claims = {
    v: 1 as const,
    sub: "guest-abc",
    name: "A",
    role: "player" as const,
    iat: 0,
    exp: 1_000,
  };
  const token = signSessionToken(secret, claims);
  assert.deepEqual(verifySessionToken(secret, token, 999), claims);
  assert.equal(verifySessionToken(secret, token, 1_000), null, "expired");
  assert.equal(
    verifySessionToken(randomBytes(32), token, 0),
    null,
    "other server",
  );
  const [body, sig] = token.split(".");
  const evil = Buffer.from(
    JSON.stringify({ ...claims, role: "owner" }),
  ).toString("base64url");
  assert.equal(
    verifySessionToken(secret, `${evil}.${sig}`, 0),
    null,
    "role escalation",
  );
  assert.equal(verifySessionToken(secret, `${body}`, 0), null);
  assert.equal(verifySessionToken(secret, 42, 0), null);
});

test("validators rebuild clean commands and queries", () => {
  assert.deepEqual(
    validateCommand({
      message: "clock.setScale",
      body: { scale: 4, extra: 1 },
    }),
    { ok: true, value: { message: "clock.setScale", body: { scale: 4 } } },
  );
  assert.equal(
    validateCommand({ message: "clock.setScale", body: { scale: 5 } }).ok,
    false,
  );
  assert.equal(
    validateCommand({ message: "query.family", body: { creatureId: 1 } }).ok,
    false,
  );
  const named = validateCommand({
    message: "influence.submit",
    body: {
      kind: "NAME_LINEAGE",
      payload: { lineageId: 2, name: "  Fen  ", x: 1 },
    },
  });
  assert.deepEqual(named, {
    ok: true,
    value: {
      message: "influence.submit",
      body: { kind: "NAME_LINEAGE", payload: { lineageId: 2, name: "Fen" } },
    },
  });
  assert.equal(
    validateCommand({
      message: "influence.submit",
      body: {
        kind: "NAME_LINEAGE",
        payload: { lineageId: 2, name: "x".repeat(41) },
      },
    }).ok,
    false,
  );
  assert.equal(
    validateQuery({ message: "query.creature", body: { creatureId: -1 } }).ok,
    false,
  );
  const events = validateQuery({
    message: "query.events",
    body: { worldId: 1, fromTick: 0, toTick: 10, limit: 10_000 },
  });
  assert.ok(
    events.ok &&
      events.value.message === "query.events" &&
      events.value.body.limit === 500,
  );
  assert.equal(parseWsClientMessage('{"type":"hello"}'), null);
  assert.deepEqual(
    parseWsClientMessage('{"type":"hello","v":2,"name":"A","junk":1}'),
    {
      type: "hello",
      v: 2,
      name: "A",
    },
  );
  assert.deepEqual(parseWsClientMessage('{"type":"resync"}'), {
    type: "resync",
  });
});

test("the browser worker never reaches node-only multiplayer modules", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const entry = resolve(here, "../src/browser/host-worker.ts");
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const banned of [
      '"node:crypto"',
      '"node:http"',
      '"node:util"',
      '"ws"',
    ]) {
      assert.equal(
        text.includes(`from ${banned}`),
        false,
        `${file} imports ${banned}`,
      );
    }
    for (const match of text.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
      const base = join(dirname(file), match[1]!);
      const candidates = [`${base}.ts`, join(base, "index.ts"), base];
      const found = candidates.find((c) => c.endsWith(".ts") && existsSync(c));
      if (found) stack.push(found);
    }
  }
  assert.ok(seen.size > 5);
});
