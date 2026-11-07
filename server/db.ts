import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, types } from "@neondatabase/serverless";
import { postgresSchema } from "./postgres-schema";

const INT_FIELDS = new Set([
  "created_at",
  "expires_at",
  "min_height",
  "day",
  "n",
]);

export interface SqlQuery {
  (sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
}

export interface Driver {
  query: SqlQuery;
  transaction(run: (query: SqlQuery) => Promise<void>): Promise<void>;
}

export class Statement {
  constructor(
    private readonly driver: Driver,
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}
  bind(...values: unknown[]) {
    return new Statement(this.driver, this.sql, values);
  }
  async first<T>() {
    const rows = await this.driver.query(this.sql, this.values);
    return (rows[0] as T | undefined) ?? null;
  }
  async all<T>() {
    return { results: (await this.driver.query(this.sql, this.values)) as T[] };
  }
  async run() {
    await this.driver.query(this.sql, this.values);
  }
}

export interface PetsDb {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<void>;
}

export function createDb(driver: Driver): PetsDb {
  return {
    prepare: (sql) => new Statement(driver, sql),
    batch: (statements) =>
      driver.transaction(async (query) => {
        for (const statement of statements)
          await query(statement.sql, statement.values);
      }),
  };
}

export function normalizeRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  for (const key of INT_FIELDS) {
    const value = out[key];
    if (typeof value === "bigint") out[key] = Number(value);
    else if (typeof value === "string" && /^-?\d+$/.test(value)) {
      const num = Number(value);
      if (Number.isSafeInteger(num)) out[key] = num;
    }
  }
  return out;
}

export function toPg(sql: string) {
  let index = 0;
  let quoted = false;
  let out = "";
  for (const char of sql) {
    if (char === "'") quoted = !quoted;
    if (char === "?" && !quoted) out += `$${++index}`;
    else out += char;
  }
  return out;
}

export function sqlStatements(sql: string) {
  return sql
    .split(";")
    .map((part) => part.replace(/--.*$/gm, "").trim())
    .filter(Boolean);
}

export function migrationPath(name: string) {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "server", name),
    join(process.cwd(), "migrations", name),
    join(here, name),
    join(here, "..", "server", name),
    join(here, "..", "migrations", name),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`Missing migration ${name}`);
  return found;
}

function readMigration(name: string) {
  return readFileSync(migrationPath(name), "utf8");
}

export async function migrateSql(driver: Driver, sql: string) {
  const statements = sqlStatements(sql);
  await driver.transaction(async (query) => {
    for (const statement of statements) await query(statement, []);
  });
}

export async function migrate(driver: Driver, name: string) {
  await migrateSql(driver, readMigration(name));
}

export function databaseUrl(
  env: Record<string, string | undefined> = process.env,
) {
  return env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL || "";
}

export function postgresConnectionString(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.DATABASE_URL_UNPOOLED ||
    env.POSTGRES_URL_NON_POOLING ||
    databaseUrl(env)
  );
}

export function databaseMode(
  env: Record<string, string | undefined> = process.env,
) {
  if (databaseUrl(env)) return "postgres" as const;
  if (env.PETS_DB === "sqlite") return "sqlite" as const;
  return "missing" as const;
}

types.setTypeParser(20, (value: string) => Number(value));

function redact(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Database connection failed";
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]");
}

export async function openPostgres(connectionString: string) {
  const pool = await connectPostgres(connectionString);
  const driver: Driver = {
    query: async (sql, params) => {
      const result = await pool.query(toPg(sql), params);
      return result.rows.map((row) => normalizeRow(row));
    },
    transaction: async (run) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await run(async (sql, params) => {
          const result = await client.query(toPg(sql), params);
          return result.rows.map((row) => normalizeRow(row));
        });
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The original query error is the one callers handle.
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
  try {
    await migrateSql(driver, postgresSchema);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
  return { db: createDb(driver), close: () => pool.end() };
}

async function connectPostgres(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    await pool.query("SELECT 1");
    return pool;
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw new Error(redact(error));
  }
}

export async function openDatabase(
  env: Record<string, string | undefined> = process.env,
) {
  const mode = databaseMode(env);
  if (mode === "postgres") return openPostgres(postgresConnectionString(env));
  if (mode === "sqlite") {
    const { openSqlite } = await import("./sqlite");
    return openSqlite(env.PETS_SQLITE_PATH || ".data/pets.sqlite");
  }
  throw new Error(
    "DATABASE_URL is not set. The Neon integration injects it on Vercel. Local sqlite is only for PETS_DB=sqlite.",
  );
}
