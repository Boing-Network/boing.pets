import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MP_PROTOCOL_VERSION,
  type HostToClient,
  type WsServerToClient,
} from "@boing-pets/contract";
import {
  backoffMs,
  createWsHostIpc,
  sharedWorldFromLocation,
  tokenStorageKey,
} from "../src/api/ws-host-ipc";
import type { ConnectionStatus } from "../src/state/worldViewStore";

class FakeSocket {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  push(frame: WsServerToClient) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const CLOCK: HostToClient = {
  message: "world.clock",
  body: { tick: 5, paused: false, scale: 64, clockAt: 0, msPerTick: 60_000 },
};

function harness(ownerKey?: string) {
  const sockets: FakeSocket[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const statuses: ConnectionStatus[] = [];
  const storage = memoryStorage();
  const url = "ws://127.0.0.1:8787";
  const ipc = createWsHostIpc({
    url,
    ownerKey,
    name: "Nico",
    storage,
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    onStatus: (s) => statuses.push(s),
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
  });
  const received: HostToClient[] = [];
  ipc.onHostMessage((m) => received.push(m));
  return { ipc, sockets, timers, statuses, storage, url, received };
}

function welcome(token = "tok-1"): WsServerToClient {
  return {
    type: "welcome",
    v: MP_PROTOCOL_VERSION,
    token,
    sessionId: "s1",
    accountId: "guest-1",
    displayName: "Nico",
    role: "owner",
    worldId: 1,
  };
}

test("hello carries name and owner key; welcome stores the token", () => {
  const h = harness("owner-secret");
  const s = h.sockets[0]!;
  s.open();
  assert.deepEqual(s.sent[0], {
    type: "hello",
    v: MP_PROTOCOL_VERSION,
    name: "Nico",
    ownerKey: "owner-secret",
  });
  s.push(welcome());
  assert.equal(h.storage.map.get(tokenStorageKey(h.url)), "tok-1");
  assert.equal(h.statuses.at(-1), "live");
  h.ipc.dispose();
});

test("a seq gap drops live messages and requests resync until a base arrives", () => {
  const h = harness();
  const s = h.sockets[0]!;
  s.open();
  s.push(welcome());
  s.push({ type: "host", seq: 10, base: true, message: CLOCK });
  s.push({ type: "host", seq: 11, message: CLOCK });
  assert.equal(h.received.length, 2);
  s.push({ type: "host", seq: 13, message: CLOCK }); // 12 missing
  assert.equal(h.received.length, 2, "gap message dropped");
  assert.deepEqual(s.sent.at(-1), { type: "resync" });
  s.push({ type: "host", seq: 14, message: CLOCK });
  assert.equal(h.received.length, 2, "still waiting for base");
  s.push({ type: "host", seq: 14, base: true, message: CLOCK });
  s.push({ type: "host", seq: 15, message: CLOCK });
  assert.equal(h.received.length, 4);
  h.ipc.dispose();
});

test("reconnects with backoff and presents the saved token (not the owner key)", () => {
  const h = harness("owner-secret");
  const first = h.sockets[0]!;
  first.open();
  first.push(welcome("tok-A"));
  first.close();
  assert.equal(h.statuses.at(-1), "reconnecting");
  assert.equal(h.timers.length, 1);
  h.timers[0]!.fn();
  const second = h.sockets[1]!;
  second.open();
  assert.deepEqual(second.sent[0], {
    type: "hello",
    v: MP_PROTOCOL_VERSION,
    token: "tok-A",
    name: "Nico",
  });
  second.close();
  assert.equal(h.statuses.at(-1), "reconnecting");
  h.ipc.dispose();
  assert.equal(h.statuses.at(-1), "offline");
});

test("queries resolve by id and fail fast when the socket drops", async () => {
  const h = harness();
  const s = h.sockets[0]!;
  s.open();
  s.push(welcome());
  const p = h.ipc.query({ message: "query.creature", body: { creatureId: 3 } });
  const sent = s.sent.at(-1) as { id: number };
  s.push({
    type: "query-error",
    id: sent.id,
    error: "nope",
  });
  await assert.rejects(p, /nope/);
  const q = h.ipc.query({ message: "query.creature", body: { creatureId: 4 } });
  s.close();
  await assert.rejects(q, /connection lost/);
  h.ipc.dispose();
});

test("backoff doubles to an 8 s cap; ?mp= parsing accepts only ws urls", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 9].map((n) => backoffMs(n)),
    [500, 1000, 2000, 4000, 8000, 8000, 8000],
  );
  assert.deepEqual(
    sharedWorldFromLocation("?mp=ws://127.0.0.1:8787&owner=k&name=A"),
    {
      url: "ws://127.0.0.1:8787",
      ownerKey: "k",
      name: "A",
    },
  );
  assert.equal(sharedWorldFromLocation("?mp=javascript:alert(1)"), null);
  assert.equal(sharedWorldFromLocation(""), null);
  assert.deepEqual(sharedWorldFromLocation("", "wss://pets.example/ws"), {
    url: "wss://pets.example/ws",
  });
});
