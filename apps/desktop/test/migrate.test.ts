import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import {
  buildMigrateCommand,
  prismaCliEntry,
  type MigrateRuntime,
} from "../src/migrate";

const options = {
  repoRoot: path.join("C:", "repo"),
  schemaPath: path.join(
    "C:",
    "repo",
    "packages",
    "db",
    "prisma",
    "schema.prisma",
  ),
  databaseUrl: "postgresql://user@127.0.0.1:5432/db",
};

function runtime(overrides: Partial<MigrateRuntime>): MigrateRuntime {
  return {
    platform: "win32",
    execPath: "C:\\Program Files\\nodejs\\node.exe",
    electron: false,
    env: { PATH: "x" },
    exists: () => true,
    ...overrides,
  };
}

test("runs the Prisma CLI entry with the current binary, no shell", () => {
  const plan = buildMigrateCommand(options, runtime({}));
  assert.equal(plan.command, "C:\\Program Files\\nodejs\\node.exe");
  assert.equal(plan.shell, false);
  assert.deepEqual(plan.args, [
    prismaCliEntry(options.repoRoot),
    "migrate",
    "deploy",
    "--schema",
    options.schemaPath,
  ]);
  assert.equal(plan.env.DATABASE_URL, options.databaseUrl);
  assert.equal(plan.env.PATH, "x");
  assert.equal(plan.env.ELECTRON_RUN_AS_NODE, undefined);
});

test("inside Electron the binary is told to act as Node", () => {
  const plan = buildMigrateCommand(
    options,
    runtime({ electron: true, execPath: "C:\\app\\electron.exe" }),
  );
  assert.equal(plan.command, "C:\\app\\electron.exe");
  assert.equal(plan.env.ELECTRON_RUN_AS_NODE, "1");
});

test("falls back to npx, through a shell only on Windows", () => {
  const win = buildMigrateCommand(options, runtime({ exists: () => false }));
  assert.equal(win.command, "npx.cmd");
  assert.equal(win.shell, true);
  assert.deepEqual(win.args.slice(0, 4), [
    "--no-install",
    "prisma",
    "migrate",
    "deploy",
  ]);
  const linux = buildMigrateCommand(
    options,
    runtime({ platform: "linux", exists: () => false }),
  );
  assert.equal(linux.command, "npx");
  assert.equal(linux.shell, false);
  const spaced = buildMigrateCommand(
    { ...options, schemaPath: "C:\\Boing Network\\schema.prisma" },
    runtime({ exists: () => false }),
  );
  assert.equal(spaced.args.at(-1), '"C:\\Boing Network\\schema.prisma"');
});
