/**
 * Local Postgres boot for a cold machine.
 * Spawns an embedded cluster under the app userData directory.
 */
import { mkdir } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";

export type LocalPostgresOptions = {
  databaseDir: string;
  port: number;
  password: string;
  databaseName?: string;
};

export type LocalPostgres = {
  port: number;
  password: string;
  databaseName: string;
  databaseUrl: string;
  stop(): Promise<void>;
};

export async function startLocalPostgres(
  options: LocalPostgresOptions,
): Promise<LocalPostgres> {
  const databaseName = options.databaseName ?? "living_pets";
  await mkdir(options.databaseDir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: options.databaseDir,
    user: "postgres",
    password: options.password,
    port: options.port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  await pg.initialise();
  await pg.start();

  try {
    await pg.createDatabase(databaseName);
  } catch (error) {
    // Persistent clusters already have the database after the first cold boot.
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) {
      await pg.stop();
      throw error;
    }
  }

  const databaseUrl = `postgresql://postgres:${encodeURIComponent(options.password)}@127.0.0.1:${options.port}/${databaseName}`;

  return {
    port: options.port,
    password: options.password,
    databaseName,
    databaseUrl,
    async stop() {
      await pg.stop();
    },
  };
}
