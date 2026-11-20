/**
 * Prisma client factory for the host. Not used inside `step()`.
 *
 * Prisma 7 talks to Postgres through a driver adapter (`pg`), not the old
 * Rust engine. The connect timeout matches Prisma 6's 5 s default (`pg`
 * would otherwise wait forever). `pg` ignores Prisma's `?schema=` URL
 * parameter, so it is moved into the adapter's `schema` option.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export type DbClient = PrismaClient;

export interface PgConnectionOptions {
  connectionString: string;
  schema?: string;
}

export function pgConnectionOptions(databaseUrl: string): PgConnectionOptions {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return { connectionString: databaseUrl };
  }
  const schema = url.searchParams.get("schema");
  if (schema == null || schema.length === 0) {
    return { connectionString: databaseUrl };
  }
  url.searchParams.delete("schema");
  return { connectionString: url.toString(), schema };
}

export function createDbClient(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
): DbClient {
  if (databaseUrl == null || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required for the Postgres repository");
  }
  const { connectionString, schema } = pgConnectionOptions(databaseUrl);
  const adapter = new PrismaPg(
    { connectionString, connectionTimeoutMillis: 5_000 },
    schema == null ? undefined : { schema },
  );
  return new PrismaClient({ adapter });
}
