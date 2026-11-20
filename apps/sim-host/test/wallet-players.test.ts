/**
 * Wallet sign-in (challenge → Ed25519 over BLAKE3) and player presence on
 * the shared-world WebSocket server.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { WebSocket } from "ws";
import {
  MP_PROTOCOL_VERSION,
  type WsServerToClient,
} from "@boing-pets/contract";
import { createSharedWorldHost, listenSharedWorldWs } from "../src/index";
import { parseOwnerWallets } from "../src/multiplayer/server-config";
import {
  createWalletChallenges,
  normalizeWalletAddress,
  shortWallet,
  verifyWalletSignature,
  walletAccountId,
  walletSignInMessage,
} from "../src/multiplayer/wallet-auth";
import { MemoryWorldRepository } from "../src/persist/memory-repository";

type Frame = WsServerToClient;

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

async function newWallet() {
  const secret = ed.utils.randomPrivateKey();
  const address = `0x${hex(await ed.getPublicKeyAsync(secret))}`;
  return {
    address,
    async sign(message: string) {
      const digest = blake3(new TextEncoder().encode(message));
      return `0x${hex(await ed.signAsync(digest, secret))}`;
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function startServer(
  extra: { ownerWallets?: string[]; nowMs?: () => number } = {},
) {
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
    ownerKey: "owner-key-for-tests-1234",
    heartbeatMs: 0,
    presenceMs: 20,
    ...(extra.ownerWallets ? { ownerWallets: extra.ownerWallets } : {}),
    ...(extra.nowMs
      ? { walletChallenges: createWalletChallenges({ nowMs: extra.nowMs }) }
      : {}),
  });
  return { host, server };
}

function openClient(url: string, origin = "https://boing-pets.vercel.app") {
  const frames: Frame[] = [];
  const ws = new WebSocket(url, { headers: { origin } });
  const ready = new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.on("message", (data) => frames.push(JSON.parse(String(data)) as Frame));
  const client = {
    ws,
    frames,
    ready,
    of<T extends Frame["type"]>(type: T) {
      return frames.filter(
        (f): f is Extract<Frame, { type: T }> => f.type === type,
      );
    },
    send(frame: unknown) {
      ws.send(JSON.stringify(frame));
    },
    async challenge(address: string) {
      await ready;
      const before = client.of("auth-challenge").length;
      client.send({ type: "auth-challenge", address });
      await waitFor(() => client.of("auth-challenge").length > before);
      return client.of("auth-challenge").at(-1)!;
    },
    async hello(extra: Record<string, unknown> = {}) {
      await ready;
      client.send({ type: "hello", v: MP_PROTOCOL_VERSION, ...extra });
      await waitFor(() => client.of("welcome").length > 0);
      return client.of("welcome")[0]!;
    },
  };
  return client;
}

test("wallet helpers: address normalization, ids, message fields", async () => {
  const upper = `0x${"AB".repeat(32)}`;
  assert.equal(normalizeWalletAddress(upper), upper.toLowerCase());
  assert.equal(normalizeWalletAddress("ab".repeat(32)), `0x${"ab".repeat(32)}`);
  assert.equal(normalizeWalletAddress("0x1234"), null);
  assert.equal(normalizeWalletAddress(42), null);
  const address = `0x${"cd".repeat(32)}`;
  assert.equal(walletAccountId(address), `w:${"cd".repeat(32)}`);
  assert.equal(shortWallet(address), "0xcdcdcd…cdcd");
  const message = walletSignInMessage({
    origin: "https://boing-pets.vercel.app",
    chainId: 6913,
    address,
    nonce: "n1",
    issuedAtMs: 1,
    expiresAtMs: 2,
  });
  assert.match(message, /^Boing Pets sign-in v1\n/);
  for (const line of [
    "Origin: https://boing-pets.vercel.app",
    "Chain: 6913",
    `Address: ${address}`,
    "Nonce: n1",
    "Expires: 2",
  ]) {
    assert.ok(message.includes(line), line);
  }
});

test("signatures verify only for the signing wallet and exact message", async () => {
  const a = await newWallet();
  const b = await newWallet();
  const message = "Boing Pets sign-in v1\nNonce: x";
  const sig = await a.sign(message);
  assert.equal(await verifyWalletSignature(a.address, message, sig), true);
  assert.equal(await verifyWalletSignature(b.address, message, sig), false);
  assert.equal(
    await verifyWalletSignature(a.address, `${message}!`, sig),
    false,
  );
  assert.equal(await verifyWalletSignature(a.address, message, "0x12"), false);
  assert.equal(await verifyWalletSignature(a.address, message, 7), false);
});

test("challenges are single use and expire", async () => {
  let now = 1_000;
  const challenges = createWalletChallenges({ nowMs: () => now, ttlMs: 100 });
  const w = await newWallet();
  const c1 = challenges.issue(w.address, "o");
  const sig1 = await w.sign(c1.message);
  assert.equal(
    await challenges.redeem({
      address: w.address,
      nonce: c1.nonce,
      signature: sig1,
    }),
    w.address,
  );
  // Replay of the same nonce fails.
  assert.equal(
    await challenges.redeem({
      address: w.address,
      nonce: c1.nonce,
      signature: sig1,
    }),
    null,
  );
  const c2 = challenges.issue(w.address, "o");
  const sig2 = await w.sign(c2.message);
  now += 101;
  assert.equal(
    await challenges.redeem({
      address: w.address,
      nonce: c2.nonce,
      signature: sig2,
    }),
    null,
  );
  // A different address cannot redeem someone else's challenge.
  const other = await newWallet();
  const c3 = challenges.issue(w.address, "o");
  assert.equal(
    await challenges.redeem({
      address: other.address,
      nonce: c3.nonce,
      signature: await other.sign(c3.message),
    }),
    null,
  );
  assert.equal(challenges.size(), 0);
});

test("owner wallets parse from env and reject junk", () => {
  const a = `0x${"aa".repeat(32)}`;
  assert.deepEqual(
    parseOwnerWallets(` ${a.toUpperCase()}, ${"bb".repeat(32)} ${a}`),
    [a, `0x${"bb".repeat(32)}`],
  );
  assert.deepEqual(parseOwnerWallets(undefined), []);
  assert.throws(() => parseOwnerWallets("0x1234"), /OWNER_WALLETS/);
});

test("wallet sign-in over the socket: challenge, hello, token keeps the wallet", async () => {
  const wallet = await newWallet();
  const { host, server } = await startServer();
  try {
    const c = openClient(server.url);
    const challenge = await c.challenge(wallet.address);
    assert.equal(challenge.address, wallet.address);
    assert.ok(
      challenge.message.includes("Origin: https://boing-pets.vercel.app"),
    );
    assert.ok(challenge.message.includes("Chain: 6913"));
    const welcome = await c.hello({
      wallet: {
        address: wallet.address,
        nonce: challenge.nonce,
        signature: await wallet.sign(challenge.message),
      },
    });
    assert.equal(welcome.wallet, wallet.address);
    assert.equal(welcome.accountId, walletAccountId(wallet.address));
    assert.equal(welcome.displayName, shortWallet(wallet.address));
    assert.equal(welcome.role, "player");
    c.ws.close();

    // Reconnect with the token: same wallet account, no new signature.
    const again = openClient(server.url);
    const back = await again.hello({ token: welcome.token });
    assert.equal(back.wallet, wallet.address);
    assert.equal(back.accountId, welcome.accountId);
    again.ws.close();
  } finally {
    await server.close();
    await host.quit();
  }
});

test("a bad or replayed signature joins as a guest with an error", async () => {
  const wallet = await newWallet();
  const thief = await newWallet();
  const { host, server } = await startServer();
  try {
    const c = openClient(server.url);
    const challenge = await c.challenge(wallet.address);
    const welcome = await c.hello({
      wallet: {
        address: wallet.address,
        nonce: challenge.nonce,
        signature: await thief.sign(challenge.message),
      },
    });
    assert.equal(welcome.wallet, undefined);
    assert.match(welcome.accountId, /^guest-/);
    assert.ok(c.of("error").some((e) => e.code === "wallet_rejected"));
    c.ws.close();
  } finally {
    await server.close();
    await host.quit();
  }
});

test("owner wallets get the owner role; others stay players", async () => {
  const owner = await newWallet();
  const player = await newWallet();
  const { host, server } = await startServer({
    ownerWallets: [owner.address.toUpperCase().replace("0X", "0x")],
  });
  try {
    for (const [wallet, role] of [
      [owner, "owner"],
      [player, "player"],
    ] as const) {
      const c = openClient(server.url);
      const challenge = await c.challenge(wallet.address);
      const welcome = await c.hello({
        wallet: {
          address: wallet.address,
          nonce: challenge.nonce,
          signature: await wallet.sign(challenge.message),
        },
      });
      assert.equal(welcome.role, role);
      c.ws.close();
    }
  } finally {
    await server.close();
    await host.quit();
  }
});

test("sign-in challenges are capped per socket and validated", async () => {
  const { host, server } = await startServer();
  try {
    const c = openClient(server.url);
    await c.ready;
    c.send({ type: "auth-challenge", address: "0x1234" });
    await waitFor(() => c.of("error").length > 0);
    assert.equal(c.of("error")[0]!.code, "invalid_message");
    const address = `0x${"ef".repeat(32)}`;
    for (let i = 0; i < 10; i += 1) c.send({ type: "auth-challenge", address });
    await waitFor(() => c.of("error").some((e) => e.code === "rate_limited"));
    assert.equal(c.of("auth-challenge").length, 8);
    c.ws.close();
  } finally {
    await server.close();
    await host.quit();
  }
});

test("players see each other's presence, rate limited and removed on leave", async () => {
  const { host, server } = await startServer();
  try {
    const a = openClient(server.url);
    const b = openClient(server.url);
    const wa = await a.hello({ name: "Ada" });
    const wb = await b.hello({ name: "Bo" });
    a.send({ type: "presence", x: 1.234567, z: -2 });
    b.send({ type: "presence", x: 5, z: 6 });
    const both = () =>
      a.of("players").some((f) => f.players.length === 2) &&
      b.of("players").some((f) => f.players.length === 2);
    await waitFor(both);
    const latest = a.of("players").at(-1)!.players;
    const ada = latest.find((p) => p.id === wa.sessionId)!;
    assert.equal(ada.name, "Ada");
    assert.equal(ada.x, 1.23);
    assert.equal(ada.wallet, false);
    assert.ok(latest.some((p) => p.id === wb.sessionId && p.x === 5));

    // Flooding presence: only the first of a burst within 160 ms counts.
    await new Promise((resolve) => setTimeout(resolve, 250));
    for (let i = 0; i < 20; i += 1)
      a.send({ type: "presence", x: 100 + i, z: 0 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const seen = b
      .of("players")
      .flatMap((f) => f.players)
      .filter((p) => p.id === wa.sessionId)
      .map((p) => p.x);
    assert.ok(seen.includes(100), `first of burst missing: ${seen.join(",")}`);
    assert.ok(!seen.includes(119), "burst was not rate limited");

    // Junk presence is refused as invalid.
    a.send({ type: "presence", x: "far", z: 0 });
    await waitFor(() =>
      a.of("error").some((e) => e.code === "invalid_message"),
    );

    b.ws.close();
    await waitFor(() =>
      a
        .of("players")
        .at(-1)!
        .players.every((p) => p.id !== wb.sessionId),
    );
    a.ws.close();
  } finally {
    await server.close();
    await host.quit();
  }
});
