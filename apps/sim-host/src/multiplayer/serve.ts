/**
 * Shared-world server entrypoint: `npm run mp:serve [-- --port 8787]`.
 *
 * One HostRuntime (the single writer) behind a WebSocket server. Every
 * browser that opens the client with `?mp=ws://HOST:PORT` joins the same
 * living world. Storage is a JSON file under `--data` (default
 * `.living-pets-mp/`), or Postgres when DATABASE_URL is set.
 *
 * Options (flags or env; see server-config.ts):
 *   --host / LIVING_PETS_MP_HOST        bind address (default 127.0.0.1)
 *   --port / LIVING_PETS_MP_PORT / PORT port (default 8787)
 *   --data / LIVING_PETS_MP_DATA        data dir (default .living-pets-mp)
 *   --seed / LIVING_PETS_MP_SEED        seed for a new world (default 1)
 *   --scale / LIVING_PETS_MP_SCALE      time scale for a new world (default 64)
 *   LIVING_PETS_MP_OWNER_KEY            owner key (local default: generated)
 *   LIVING_PETS_MP_SECRET               token HMAC key (local default: saved
 *                                       in the data dir)
 *   LIVING_PETS_MP_ALLOWED_ORIGINS      extra allowed browser origins, comma
 *                                       separated, `*` wildcards
 *   NODE_ENV=production                 require the secrets, DATABASE_URL and
 *                                       an origin list from the environment
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { BrowserWorldRepository } from "../persist/browser-repository";
import { createFileStringStore } from "../persist/file-string-store";
import type { WorldRepository } from "../persist/repository";
import {
  ServerConfigError,
  compileOriginMatcher,
  resolveServerConfig,
  type ServerConfig,
} from "./server-config";
import { createSharedWorldHost } from "./shared-world-host";
import { generateOwnerKey, loadOrCreateSecret } from "./tokens";
import { listenSharedWorldWs } from "./ws-server";

const { values } = parseArgs({
  options: {
    host: { type: "string" },
    port: { type: "string" },
    data: { type: "string" },
    seed: { type: "string" },
    scale: { type: "string" },
  },
  allowPositionals: false,
});

function log(line: string): void {
  console.log(`[${new Date().toISOString()}] ${line}`);
}

function loadConfig(): ServerConfig {
  try {
    return resolveServerConfig(values, process.env);
  } catch (error) {
    if (error instanceof ServerConfigError) {
      // Fail fast with a clear message; never echo secret values.
      console.error(`living-pets shared world: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
const config = loadConfig();
const dataDir = path.resolve(config.dataDir);

async function openRepository(): Promise<{
  repository: WorldRepository;
  label: string;
  dispose: () => Promise<void>;
}> {
  if (config.databaseUrl != null) {
    const [{ PrismaWorldRepository }, { createPrismaHostMetaStore }, db] =
      await Promise.all([
        import("../persist/prisma-repository"),
        import("../persist/prisma-host-meta"),
        import("@boing-pets/db"),
      ]);
    const client = db.createDbClient();
    const repository = new PrismaWorldRepository({
      client,
      hostMeta: createPrismaHostMetaStore(client),
    });
    return {
      repository,
      label: "Postgres (DATABASE_URL)",
      dispose: () => client.$disconnect(),
    };
  }
  return {
    repository: new BrowserWorldRepository({
      store: createFileStringStore(dataDir),
    }),
    label: `file store ${dataDir}`,
    dispose: async () => {},
  };
}

const { repository, label, dispose } = await openRepository();
const tokenSecret =
  config.sessionSecret != null
    ? Buffer.from(config.sessionSecret)
    : await loadOrCreateSecret(path.join(dataDir, "session-secret"));
const ownerKeyFromEnv =
  config.ownerKey != null && config.ownerKey.length >= 8
    ? config.ownerKey
    : null;
const ownerKey = ownerKeyFromEnv ?? generateOwnerKey();

const host = createSharedWorldHost({
  repository,
  seed: config.seed,
  initialScale: config.scale,
});
await host.start();
const server = await listenSharedWorldWs({
  host,
  hostname: config.hostname,
  port: config.port,
  tokenSecret,
  ownerKey,
  log,
  allowOrigin: compileOriginMatcher(config.allowedOrigins),
  health: () => {
    const snapshot = host.runtime.session.snapshot;
    const clock = host.runtime.clock;
    return {
      tick: snapshot.world.lastTick,
      paused: clock.paused,
      scale: clock.scale,
    };
  },
});

const world = host.runtime.session.snapshot.world;
const lines = [
  `Living Pets shared world on ${server.url}${config.production ? " (production)" : ""}`,
  `  world ${world.id} seed ${world.seed} tick ${world.lastTick}, storage: ${label}`,
  `  allowed origins: ${config.allowedOrigins.join(", ")} (and non-browser clients)`,
];
if (!config.production) {
  lines.push(
    "",
    "Open the client (npm run dev -w @boing-pets/client) with:",
    `  player: http://127.0.0.1:5173/?mp=${server.url}`,
    ownerKeyFromEnv != null
      ? "  owner:  add &owner=<LIVING_PETS_MP_OWNER_KEY> to the player link"
      : `  owner:  http://127.0.0.1:5173/?mp=${server.url}&owner=${ownerKey}`,
    "Only the owner can pause or change the speed. Ctrl+C saves and exits.",
  );
  if (config.hostname !== "127.0.0.1" && config.hostname !== "localhost") {
    lines.push(
      "",
      `WARNING: bound to ${config.hostname}. Anyone who can reach this port can join.`,
    );
  }
}
console.log(lines.join("\n"));

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`${signal}: closing connections and saving the world`);
  // Hard stop in case a save hangs; Fly's kill_timeout is longer than this.
  const watchdog = setTimeout(() => {
    console.error("shutdown timed out");
    process.exit(1);
  }, 25_000);
  watchdog.unref();
  try {
    await server.close();
    await host.quit();
    await dispose();
    log(`saved at tick ${host.runtime.session.snapshot.world.lastTick}. bye.`);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
