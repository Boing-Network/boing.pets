import { mkdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { dirname } from "node:path";
import {
  createDb,
  migrationPath,
  normalizeRow,
  type Driver,
} from "./db";

export async function openSqlite(filename = ":memory:") {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  const ready = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'pets'")
    .get();
  if (!ready) db.exec(readFileSync(migrationPath("0001_pasture.sql"), "utf8"));
  const yard = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'yards'")
    .get();
  if (!yard) db.exec(readFileSync(migrationPath("0002_yard.sql"), "utf8"));
  for (const sql of [
    "ALTER TABLE presence ADD COLUMN x REAL",
    "ALTER TABLE presence ADD COLUMN z REAL",
    "ALTER TABLE presence ADD COLUMN pass TEXT",
    "ALTER TABLE presence ADD COLUMN pass_until INTEGER",
    `CREATE TABLE IF NOT EXISTS wardrobe (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      item TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS equipped (
      owner TEXT NOT NULL,
      slot TEXT NOT NULL CHECK (slot IN ('head', 'neck', 'body', 'back', 'feet')),
      piece TEXT NOT NULL,
      PRIMARY KEY (owner, slot)
    )`,
    `CREATE TABLE IF NOT EXISTS skills (
      owner TEXT NOT NULL,
      skill TEXT NOT NULL CHECK (skill IN ('forage', 'greet', 'play')),
      points INTEGER NOT NULL,
      last_day INTEGER NOT NULL,
      PRIMARY KEY (owner, skill)
    )`,
  ]) {
    try {
      db.exec(sql);
    } catch {
      // The column is already there on a pasture created before walking was added.
    }
  }
  const driver: Driver = {
    query: async (sql, params) => {
      const statement = db.prepare(sql);
      const values = params as SQLInputValue[];
      if (/^\s*(select|with)\b/i.test(sql)) {
        return statement.all(...values).map((row) => normalizeRow(row as Record<string, unknown>));
      }
      statement.run(...values);
      return [];
    },
    transaction: async (run) => {
      db.exec("BEGIN");
      try {
        await run(async (sql, params) => {
          const statement = db.prepare(sql);
          const values = params as SQLInputValue[];
          if (/^\s*(select|with)\b/i.test(sql)) {
            return statement.all(...values).map((row) => normalizeRow(row as Record<string, unknown>));
          }
          statement.run(...values);
          return [];
        });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db: createDb(driver), close: () => db.close() };
}
