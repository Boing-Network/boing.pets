/**
 * Shared-world server config: safe local defaults, fail-fast production,
 * origin allow-list, and the HTTP/WebSocket edge (healthz, origin refusal,
 * graceful close), plus the Postgres-backed host-meta store.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { WebSocket } from "ws";
import {
  LOCAL_ORIGINS,
  ServerConfigError,
  compileOriginMatcher,
  resolveServerConfig,
} from "../src/multiplayer/server-config";
import { createSharedWorldHost, listenSharedWorldWs } from "../src/index";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import {
  createPrismaHostMetaStore,
  type HostMetaTableClient,
} from "../src/persist/prisma-host-meta";

const PROD_ENV = {
  NODE_ENV: "production",
  LIVING_PETS_MP_OWNER_KEY: "o".repeat(32),
  LIVING_PETS_MP_SECRET: "s".repeat(48),
  DATABASE_URL: "postgres://app@db.internal:5432/app",
  LIVING_PETS_MP_ALLOWED_ORIGINS: "https://boing-pets-*-nico-builds.vercel.app",
};

test("local defaults bind loopback and accept localhost origins", () => {
  const config = resolveServerConfig({}, {});
  assert.equal(config.production, false);
  assert.equal(config.hostname, "127.0.0.1");
  assert.equal(config.port, 8787);
  assert.equal(config.scale, 64);
  assert.equal(config.ownerKey, null);
  assert.equal(config.sessionSecret, null);
  assert.equal(config.databaseUrl, null);
  assert.deepEqual(config.allowedOrigins, LOCAL_ORIGINS);
});

test("port precedence is flag, LIVING_PETS_MP_PORT, then PORT", () => {
  assert.equal(resolveServerConfig({}, { PORT: "8080" }).port, 8080);
  assert.equal(
    resolveServerConfig({}, { PORT: "8080", LIVING_PETS_MP_PORT: "9000" }).port,
    9000,
  );
  assert.equal(
    resolveServerConfig({ port: "7000" }, { PORT: "8080" }).port,
    7000,
  );
  assert.throws(
    () => resolveServerConfig({}, { PORT: "99999" }),
    ServerConfigError,
  );
  assert.throws(
    () => resolveServerConfig({}, { LIVING_PETS_MP_SCALE: "3" }),
    ServerConfigError,
  );
});

test("production fails fast without secrets, database or origins", () => {
  const config = resolveServerConfig(
    {},
    { ...PROD_ENV, LIVING_PETS_MP_HOST: "0.0.0.0" },
  );
  assert.equal(config.production, true);
  assert.equal(config.hostname, "0.0.0.0");
  assert.deepEqual(config.allowedOrigins, [
    "https://boing-pets-*-nico-builds.vercel.app",
  ]);
  for (const key of [
    "LIVING_PETS_MP_OWNER_KEY",
    "LIVING_PETS_MP_SECRET",
    "DATABASE_URL",
    "LIVING_PETS_MP_ALLOWED_ORIGINS",
  ] as const) {
    const env: Record<string, string | undefined> = {
      ...PROD_ENV,
      [key]: undefined,
    };
    assert.throws(
      () => resolveServerConfig({}, env),
      (error: Error) =>
        error instanceof ServerConfigError && error.message.includes(key),
      key,
    );
  }
  // Too-short secrets are refused, and the message never echoes values.
  assert.throws(
    () =>
      resolveServerConfig(
        {},
        { ...PROD_ENV, LIVING_PETS_MP_SECRET: "short-secret" },
      ),
    (error: Error) => !error.message.includes("short-secret"),
  );
});

test("origin patterns match one host label run, never dots or paths", () => {
  const allow = compileOriginMatcher([
    "https://boing-pets-*-nico-builds.vercel.app",
    "http://localhost:*",
  ]);
  assert.equal(
    allow("https://boing-pets-git-feat-x-7f4f2e-nico-builds.vercel.app"),
    true,
  );
  assert.equal(
    allow("https://BOING-PETS-abc123-nico-builds.vercel.app/"),
    true,
  );
  assert.equal(allow("http://localhost:5173"), true);
  assert.equal(allow(undefined), true, "non-browser clients send no Origin");
  assert.equal(allow("https://boing-pets-x-other-team.vercel.app"), false);
  assert.equal(
    allow("https://evil.com.boing-pets-a-nico-builds.vercel.app"),
    false,
  );
  assert.equal(allow("https://boing-pets-a.b-nico-builds.vercel.app"), false);
  assert.equal(allow("http://boing-pets-a-nico-builds.vercel.app"), false);
  assert.equal(allow("https://evil.example"), false);
  assert.equal(allow("http://localhost.evil.example:5173"), false);
});

test("healthz reports the world, foreign origins are refused, close is graceful", async () => {
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
    heartbeatMs: 0,
    allowOrigin: compileOriginMatcher([
      "https://boing-pets-*-nico-builds.vercel.app",
    ]),
    health: () => ({ tick: host.runtime.session.snapshot.world.lastTick }),
  });
  const httpBase = server.url.replace("ws://", "http://");
  const health = await fetch(`${httpBase}/healthz`);
  assert.equal(health.status, 200);
  const body = (await health.json()) as {
    ok: boolean;
    clients: number;
    tick: number;
  };
  assert.equal(body.ok, true);
  assert.equal(body.clients, 0);
  assert.equal(typeof body.tick, "number");

  const refused = new WebSocket(server.url, { origin: "https://evil.example" });
  const status = await new Promise<number>((resolve) => {
    refused.once("unexpected-response", (_req, res) =>
      resolve(res.statusCode ?? 0),
    );
    refused.once("open", () => resolve(101));
    refused.once("error", () => {});
  });
  assert.equal(status, 403);

  const allowed = new WebSocket(server.url, {
    origin: "https://boing-pets-abc-nico-builds.vercel.app",
  });
  await new Promise((resolve, reject) => {
    allowed.once("open", resolve);
    allowed.once("error", reject);
  });
  const closeCode = new Promise<number>((resolve) =>
    allowed.once("close", (code) => resolve(code)),
  );
  await server.close();
  assert.equal(await closeCode, 1012, "clients are told to reconnect");
  await host.quit();
});

test("Postgres host-meta store round-trips through one row", async () => {
  let row: { id: number; data: unknown } | null = null;
  const fake: HostMetaTableClient = {
    hostMeta: {
      async findUnique() {
        return row;
      },
      async upsert(args) {
        row = {
          id: args.where.id,
          data: JSON.parse(
            JSON.stringify(row == null ? args.create.data : args.update.data),
          ),
        };
        return row;
      },
    },
  };
  const store = createPrismaHostMetaStore(fake);
  const empty = await store.read();
  assert.deepEqual(empty.influenceAcceptedAtMs, []);
  await store.write({
    influenceAcceptedAtMs: [5],
    influenceAcceptedByAccount: { local: [5], "guest-abc": [7, 9] },
    hostClock: { scale: 16 },
  });
  assert.equal((row as { id: number } | null)?.id, 1);
  const back = await store.read();
  assert.deepEqual(back.influenceAcceptedByAccount["guest-abc"], [7, 9]);
  assert.deepEqual(back.hostClock, { scale: 16 });
});
