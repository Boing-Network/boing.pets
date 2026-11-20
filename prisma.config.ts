/**
 * Prisma CLI config (Prisma 7 moved the datasource URL out of the schema).
 * The CLI runs from the repo root (`npm run db:*`, the desktop migrator, the
 * SQL check). DATABASE_URL is read from the environment only; nothing loads
 * a .env file. `generate` and `validate` do not need it.
 */
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: { path: "packages/db/prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
