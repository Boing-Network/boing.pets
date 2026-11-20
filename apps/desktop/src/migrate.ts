/**
 * Apply Prisma migrations against the local Postgres URL.
 * Packaging only — no schema or sim rule changes.
 *
 * Runs the Prisma CLI's JS entry with the current Node/Electron binary
 * instead of `npx`: on Windows `npx` is a `.cmd` shim that `spawnSync`
 * cannot start without a shell (ENOENT, status null). Falls back to
 * `npx` through a shell only when the CLI entry is missing.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export type MigrateOptions = {
  repoRoot: string;
  schemaPath: string;
  databaseUrl: string;
};

export type MigrateCommand = {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
  shell: boolean;
};

export type MigrateRuntime = {
  platform: NodeJS.Platform;
  execPath: string;
  /** True inside Electron, where execPath must be told to act as Node. */
  electron: boolean;
  env: Record<string, string | undefined>;
  exists: (file: string) => boolean;
};

function currentRuntime(): MigrateRuntime {
  return {
    platform: process.platform,
    execPath: process.execPath,
    electron: process.versions.electron != null,
    env: process.env,
    exists: existsSync,
  };
}

function quoteForCmd(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

export function prismaCliEntry(repoRoot: string): string {
  return path.join(repoRoot, "node_modules", "prisma", "build", "index.js");
}

export function buildMigrateCommand(
  options: MigrateOptions,
  runtime: MigrateRuntime = currentRuntime(),
): MigrateCommand {
  const prismaArgs = ["migrate", "deploy", "--schema", options.schemaPath];
  const env: Record<string, string | undefined> = {
    ...runtime.env,
    DATABASE_URL: options.databaseUrl,
  };
  const entry = prismaCliEntry(options.repoRoot);
  if (runtime.exists(entry)) {
    if (runtime.electron) env.ELECTRON_RUN_AS_NODE = "1";
    return {
      command: runtime.execPath,
      args: [entry, ...prismaArgs],
      env,
      shell: false,
    };
  }
  const windows = runtime.platform === "win32";
  const args = ["--no-install", "prisma", ...prismaArgs];
  return {
    command: windows ? "npx.cmd" : "npx",
    // A shell joins args with spaces; quote paths like "Boing Network".
    args: windows ? args.map(quoteForCmd) : args,
    env,
    // .cmd shims only start through a shell on Windows.
    shell: windows,
  };
}

export function migrateDeploy(options: MigrateOptions): void {
  const plan = buildMigrateCommand(options);
  const result = spawnSync(plan.command, plan.args, {
    cwd: options.repoRoot,
    stdio: "inherit",
    env: plan.env,
    shell: plan.shell,
  });
  if (result.error != null) {
    throw new Error(
      `prisma migrate deploy failed to start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy exited ${result.status}`);
  }
}
