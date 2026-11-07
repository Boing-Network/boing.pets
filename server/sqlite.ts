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
