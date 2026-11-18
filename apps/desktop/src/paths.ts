/**
 * User-data layout for the packaged host.
 * Postgres data, host meta, and logs live under the Electron userData root.
 */
import path from "node:path";

export type DesktopPaths = {
  root: string;
  postgresDir: string;
  hostMetaPath: string;
  clientDistIndex: string;
  schemaPath: string;
  repoRoot: string;
};

export function resolveDesktopPaths(options: {
  userDataRoot: string;
  repoRoot: string;
  clientDistIndex: string;
}): DesktopPaths {
  const root = options.userDataRoot;
  return {
    root,
    postgresDir: path.join(root, "postgres"),
    hostMetaPath: path.join(root, "host-meta.json"),
    clientDistIndex: options.clientDistIndex,
    schemaPath: path.join(options.repoRoot, "packages/db/prisma/schema.prisma"),
    repoRoot: options.repoRoot,
  };
}

export function databaseUrl(port: number, password: string): string {
  return `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/living_pets`;
}
