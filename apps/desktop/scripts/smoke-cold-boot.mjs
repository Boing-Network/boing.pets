/**
 * Headless cold-boot smoke: local Postgres → migrate → bootSession → WorldView.
 * Does not open an Electron window (packaging proof without a display).
 *
 * LIVING_PETS_SMOKE_DATABASE_URL skips embedded Postgres and uses that empty
 * database instead (CI on Windows runs as an administrator, and Postgres
 * refuses to start under an admin account).
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootSession,
  buildWorldView,
  createFileHostMetaStore,
  PrismaWorldRepository,
} from "@boing-pets/sim-host";
import { migrateDeploy } from "../src/migrate.ts";
import { startLocalPostgres } from "../src/postgres.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const schemaPath = path.join(repoRoot, "packages/db/prisma/schema.prisma");
const port = Number(process.env.LIVING_PETS_PG_PORT ?? "55433");
const password = "living-pets-smoke";
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "living-pets-m18-"));

let postgres;
let repository;

const externalUrl = process.env.LIVING_PETS_SMOKE_DATABASE_URL;

try {
  let databaseUrl;
  if (externalUrl) {
    databaseUrl = externalUrl;
  } else {
    postgres = await startLocalPostgres({
      databaseDir: path.join(tmpRoot, "postgres"),
      port,
      password,
    });
    databaseUrl = postgres.databaseUrl;
  }
  process.env.DATABASE_URL = databaseUrl;

  migrateDeploy({ repoRoot, schemaPath, databaseUrl });

  repository = new PrismaWorldRepository({
    hostMeta: createFileHostMetaStore(path.join(tmpRoot, "host-meta.json")),
  });

  const session = await bootSession(repository, 1);
  const view = buildWorldView(session.snapshot);

  if (view.territories.length !== 7) {
    throw new Error(`expected 7 territories, got ${view.territories.length}`);
  }
  // 21 species × 2 founders (born mature, so their birth ticks are negative).
  if (view.creatures.length !== 42) {
    throw new Error(`expected 42 founders, got ${view.creatures.length}`);
  }

  // Second boot must load the persisted world, not create another.
  await repository.dispose();
  repository = new PrismaWorldRepository({
    hostMeta: createFileHostMetaStore(path.join(tmpRoot, "host-meta.json")),
  });
  const again = await bootSession(repository, 99);
  if (again.snapshot.world.seed !== 1) {
    throw new Error(
      `expected persisted seed 1, got ${again.snapshot.world.seed}`,
    );
  }
  // A world created by this build is up to date: no species to introduce.
  if (again.introduced != null) {
    throw new Error("fresh world should not need introduce-species");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        territories: view.territories.length,
        creatures: view.creatures.length,
        seed: again.snapshot.world.seed,
        postgres: externalUrl ? "external" : "embedded",
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await repository?.dispose();
  } catch {
    // ignore
  }
  try {
    await postgres?.stop();
  } catch {
    // ignore
  }
  await rm(tmpRoot, { recursive: true, force: true });
}
