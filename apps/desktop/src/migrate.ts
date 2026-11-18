/**
 * Apply Prisma migrations against the local Postgres URL.
 * Packaging only — no schema or sim rule changes.
 */
import { spawnSync } from "node:child_process";

export function migrateDeploy(options: {
  repoRoot: string;
  schemaPath: string;
  databaseUrl: string;
}): void {
  const result = spawnSync(
    "npx",
    [
      "--no-install",
      "prisma",
      "migrate",
      "deploy",
      "--schema",
      options.schemaPath,
    ],
    {
      cwd: options.repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: options.databaseUrl,
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy exited ${result.status}`);
  }
}
