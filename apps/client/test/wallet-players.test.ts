import assert from "node:assert/strict";
import { test } from "node:test";
import type { WsServerToClient } from "@boing-pets/contract";
import { createWsHostIpc, tokenStorageKey } from "../src/api/ws-host-ipc";
import { otherPlayers } from "../src/state/sharedWorldStore";
import { easeToward, playerColor } from "../src/view/world/PlayerMarkers";
import {
  signInWithBoing,
  walletErrorText,
  type BoingProvider,
} from "../src/wallet/boing-wallet";

class FakeSocket {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  closedWith: number | undefined;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  push(frame: WsServerToClient) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const ADDRESS = `0x${"ab".repeat(32)}`;

function harness() {
  const sockets: FakeSocket[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const map = new Map<string, string>();
  const players: unknown[] = [];
  const errors: string[] = [];
  let now = 0;
  const url = "wss://pets.example";
  const ipc = createWsHostIpc({
    url,
    storage: {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    },
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    onPlayers: (p) => players.push(p),
    onError: (code) => errors.push(code),
    nowMs: () => now,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
  });
  const welcome = (
    extra: Partial<Extract<WsServerToClient, { type: "welcome" }>> = {},
  ) =>
    sockets.at(-1)!.push({
      type: "welcome",
      v: 2,
      token: "tok",
      sessionId: "s1",
      accountId: "guest-1",
      displayName: "Guest",
      role: "player",
      worldId: 1,
      ...extra,
    });
  return {
    ipc,
    sockets,
    timers,
    map,
    players,
    errors,
    url,
    welcome,
    tick(ms: number) {
      now += ms;
    },
  };
}

test("wallet sign-in: challenge round trip, rejoin with proof, token kept", async () => {
  const h = harness();
  h.sockets[0]!.open();
  h.welcome();
  const pending = h.ipc.requestChallenge(
    ADDRESS.toUpperCase().replace("0X", "0x"),
  );
  const ask = h.sockets[0]!.sent.at(-1)!;
  assert.deepEqual(ask, { type: "auth-challenge", address: ADDRESS });
  h.sockets[0]!.push({
    type: "auth-challenge",
    address: ADDRESS,
    nonce: "n1",
    message: "Boing Pets sign-in v1",
    expiresAt: 1,
  });
  assert.deepEqual(await pending, {
    nonce: "n1",
    message: "Boing Pets sign-in v1",
  });

  h.ipc.signIn({ address: ADDRESS, nonce: "n1", signature: "0xsig" });
  assert.equal(h.sockets[0]!.closedWith, 4000);
  assert.equal(h.map.get(tokenStorageKey(h.url)), undefined);
  h.timers.at(-1)!.fn();
  h.sockets[1]!.open();
  const hello = h.sockets[1]!.sent[0]!;
  assert.equal(hello.type, "hello");
  assert.deepEqual(hello.wallet, {
    address: ADDRESS,
    nonce: "n1",
    signature: "0xsig",
  });
  assert.equal(hello.token, undefined);
  h.welcome({ token: "wallet-token", wallet: ADDRESS });
  assert.equal(h.map.get(tokenStorageKey(h.url)), "wallet-token");

  // Later reconnects use the token only (the proof is single use).
  h.sockets[1]!.close();
  h.timers.at(-1)!.fn();
  h.sockets[2]!.open();
  assert.equal(h.sockets[2]!.sent[0]!.wallet, undefined);
  assert.equal(h.sockets[2]!.sent[0]!.token, "wallet-token");

  // Sign out: forget the token and rejoin as a guest.
  h.ipc.signOut();
  assert.equal(h.map.get(tokenStorageKey(h.url)), undefined);
});

test("challenge fails fast when offline and on timeout", async () => {
  const h = harness();
  await assert.rejects(h.ipc.requestChallenge(ADDRESS), /offline/);
  h.sockets[0]!.open();
  const pending = h.ipc.requestChallenge(ADDRESS);
  h.timers.at(-1)!.fn();
  await assert.rejects(pending, /timed out/);
});

test("presence is throttled, skips tiny moves, and players frames reach the store", () => {
  const h = harness();
  h.sockets[0]!.open();
  h.ipc.sendPresence(1, 1); // not live yet
  h.welcome();
  const presence = () =>
    h.sockets[0]!.sent.filter((f) => f.type === "presence");
  h.ipc.sendPresence(1, 2);
  h.ipc.sendPresence(3, 4); // inside the 200 ms gap
  h.tick(250);
  h.ipc.sendPresence(3.01, 4); // gap passed: sent
  h.tick(250);
  h.ipc.sendPresence(3.02, 4); // tiny move from (3.01,4): skipped
  assert.deepEqual(
    presence().map((f) => [f.x, f.z]),
    [
      [1, 2],
      [3.01, 4],
    ],
  );
  h.sockets[0]!.push({
    type: "players",
    players: [
      { id: "s2", name: "Bo", role: "player", wallet: true, x: 1, z: 2 },
    ],
  });
  assert.equal(h.players.length, 1);
  h.sockets[0]!.push({ type: "error", code: "wallet_rejected", error: "no" });
  assert.deepEqual(h.errors, ["wallet_rejected"]);
});

test("signInWithBoing asks accounts, checks chain, signs the server message", async () => {
  const calls: string[] = [];
  const provider: BoingProvider = {
    async request({ method, params }) {
      calls.push(method);
      if (method === "boing_requestAccounts") return [ADDRESS];
      if (method === "boing_chainId") return "0x1b01";
      if (method === "boing_signMessage") {
        assert.deepEqual(params, ["MSG", ADDRESS]);
        return `0x${"11".repeat(64)}`;
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  let proof: unknown = null;
  const address = await signInWithBoing(
    {
      requestChallenge: async () => ({ nonce: "n", message: "MSG" }),
      signIn: (p) => {
        proof = p;
      },
      signOut: () => {},
      sendPresence: () => {},
    },
    provider,
  );
  assert.equal(address, ADDRESS);
  assert.deepEqual(calls, [
    "boing_requestAccounts",
    "boing_chainId",
    "boing_signMessage",
  ]);
  assert.deepEqual(proof, {
    address: ADDRESS,
    nonce: "n",
    signature: `0x${"11".repeat(64)}`,
  });

  const wrongChain: BoingProvider = {
    async request({ method }) {
      if (method === "boing_requestAccounts") return [ADDRESS];
      if (method === "boing_chainId") return "0x1";
      throw new Error("no");
    },
  };
  await assert.rejects(
    signInWithBoing(
      {
        requestChallenge: async () => ({ nonce: "n", message: "m" }),
        signIn: () => {},
        signOut: () => {},
        sendPresence: () => {},
      },
      wrongChain,
    ),
    /testnet/,
  );
  assert.equal(
    walletErrorText(new Error("User rejected the request")),
    "Sign-in cancelled in Boing Express.",
  );
});

test("marker helpers: other players only, colours, easing", () => {
  const players = [
    { id: "a", name: "A", role: "player" as const, wallet: false, x: 0, z: 0 },
    { id: "b", name: "B", role: "owner" as const, wallet: true, x: 0, z: 0 },
  ];
  assert.deepEqual(
    otherPlayers(players, "a").map((p) => p.id),
    ["b"],
  );
  assert.equal(playerColor(players[1]!), "#c9a7ff");
  assert.equal(playerColor({ role: "player", wallet: true }), "#ffd27a");
  assert.equal(playerColor(players[0]!), "#9fd8ff");
  const eased = easeToward(0, 10, 0.1);
  assert.ok(eased > 0 && eased < 10);
  assert.ok(Math.abs(easeToward(0, 10, 10) - 10) < 1e-6);
});
