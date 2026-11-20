/**
 * Prisma client factory for the host. Not used inside `step()`.
 *
 * Prisma 7 talks to Postgres through a driver adapter (`pg`), not the old
 * Rust engine. The connect timeout matches Prisma 6's 5 s default (`pg`
 * would otherwise wait forever).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export type DbClient = PrismaClient;

export function createDbClient(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
): DbClient {
  if (databaseUrl == null || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required for the Postgres repository");
  }
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}
