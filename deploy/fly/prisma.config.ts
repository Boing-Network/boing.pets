/**
 * Prisma CLI config inside the runtime image (/app): Fly's release_command
 * runs `npx prisma migrate deploy` here with DATABASE_URL from the secrets.
 */
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
