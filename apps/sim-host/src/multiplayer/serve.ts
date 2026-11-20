/**
 * Shared-world server entrypoint: `npm run mp:serve [-- --port 8787]`.
 *
 * One HostRuntime (the single writer) behind a WebSocket server. Every
 * browser that opens the client with `?mp=ws://HOST:PORT` joins the same
 * living world. Storage is a JSON file under `--data` (default
 * `.living-pets-mp/`), or Postgres when DATABASE_URL is set.
 *
 * Options (flags or env):
 *   --host / LIVING_PETS_MP_HOST        bind address (default 127.0.0.1)
 *   --port / LIVING_PETS_MP_PORT        port (default 8787)
 *   --data / LIVING_PETS_MP_DATA        data dir (default .living-pets-mp)
 *   --seed / LIVING_PETS_MP_SEED        seed for a new world (default 1)
 *   --scale / LIVING_PETS_MP_SCALE      time scale for a new world (default 64)
 *   LIVING_PETS_MP_OWNER_KEY            owner key (default: generated, printed)
 *   LIVING_PETS_MP_SECRET               token HMAC key (default: random, saved
 *                                       in the data dir)
 */
import path from "node:path";
import { parseArgs } from "node:util";
import {
  MP_DEFAULT_PORT,
  TIME_SCALES,
  type TimeScale,
} from "@boing-pets/contract";
import { BrowserWorldRepository } from "../persist/browser-repository";
import { createFileStringStore } from "../persist/file-string-store";
import { createFileHostMetaStore } from "../persist/host-meta";
import type { WorldRepository } from "../persist/repository";
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

const env = process.env;
const hostname = values.host ?? env.LIVING_PETS_MP_HOST ?? "127.0.0.1";
const port = Number(values.port ?? env.LIVING_PETS_MP_PORT ?? MP_DEFAULT_PORT);
const dataDir = path.resolve(
  values.data ?? env.LIVING_PETS_MP_DATA ?? ".living-pets-mp",
);
const seed = Number(values.seed ?? env.LIVING_PETS_MP_SEED ?? 1);
const scaleArg = Number(values.scale ?? env.LIVING_PETS_MP_SCALE ?? 64);

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`invalid port ${String(port)}`);
}
if (!Number.isSafeInteger(seed) || seed <= 0) throw new Error("invalid seed");
if (!(TIME_SCALES as readonly number[]).includes(scaleArg)) {
  throw new Error(`scale must be one of ${TIME_SCALES.join(", ")}`);
}

async function openRepository(): Promise<{
  repository: WorldRepository;
  label: string;
  dispose: () => Promise<void>;
}> {
  if (env.DATABASE_URL) {
    const { PrismaWorldRepository } =
      await import("../persist/prisma-repository");
    const repository = new PrismaWorldRepository({
      hostMeta: createFileHostMetaStore(path.join(dataDir, "host-meta.json")),
    });
    return {
      repository,
      label: "Postgres (DATABASE_URL)",
      dispose: () => repository.dispose(),
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
const tokenSecret = await loadOrCreateSecret(
  path.join(dataDir, "session-secret"),
  env.LIVING_PETS_MP_SECRET,
);
const ownerKeyFromEnv = env.LIVING_PETS_MP_OWNER_KEY;
const ownerKey =
  ownerKeyFromEnv != null && ownerKeyFromEnv.length >= 8
    ? ownerKeyFromEnv
    : generateOwnerKey();

const host = createSharedWorldHost({
  repository,
  seed,
  initialScale: scaleArg as TimeScale,
});
await host.start();
const server = await listenSharedWorldWs({
  host,
  hostname,
  port,
  tokenSecret,
  ownerKey,
  log: (line) => console.log(`[${new Date().toISOString()}] ${line}`),
});

const world = host.runtime.session.snapshot.world;
const lines = [
  `Living Pets shared world on ${server.url}`,
  `  world ${world.id} seed ${world.seed} tick ${world.lastTick}, storage: ${label}`,
  "",
  "Open the client (npm run dev -w @boing-pets/client) with:",
  `  player: http://127.0.0.1:5173/?mp=${server.url}`,
  ownerKeyFromEnv
    ? "  owner:  add &owner=<LIVING_PETS_MP_OWNER_KEY> to the player link"
    : `  owner:  http://127.0.0.1:5173/?mp=${server.url}&owner=${ownerKey}`,
  "Only the owner can pause or change the speed. Ctrl+C saves and exits.",
];
if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  lines.push(
    "",
    `WARNING: bound to ${hostname}. Anyone who can reach this port can join.`,
  );
}
console.log(lines.join("\n"));

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal}: saving world...`);
  try {
    await server.close();
    await host.quit();
    await dispose();
    console.log("saved. bye.");
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
