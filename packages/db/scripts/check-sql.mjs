/**
 * Apply the first migration and prove the SQL checks.
 *
 * DATABASE_URL must point at PostgreSQL. Pass --require-empty to refuse a
 * database that already has public tables, which is the empty-database run.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const schemaPath = "packages/db/prisma/schema.prisma";
const migrationName = "20261118090000_init";

const MODEL_TABLES = [
  "catchup_report",
  "creature",
  "lineage",
  "memory",
  "player_influence",
  "relationship",
  "species",
  "species_compatibility",
  "territory",
  "territory_link",
  "territory_modifier",
  "world",
  "world_event",
];

const CHECKS = {
  creature_ranges:
    "gene_strength BETWEEN 0 AND 1000 AND gene_speed BETWEEN 0 AND 1000 AND gene_intelligence BETWEEN 0 AND 1000 AND gene_curiosity BETWEEN 0 AND 1000 AND gene_sociability BETWEEN 0 AND 1000 AND trait_curiosity BETWEEN 0 AND 1000 AND trait_aggression BETWEEN 0 AND 1000 AND trait_loyalty BETWEEN 0 AND 1000 AND trait_sociability BETWEEN 0 AND 1000 AND trait_bravery BETWEEN 0 AND 1000 AND trait_risk_taking BETWEEN 0 AND 1000 AND hunger BETWEEN 0 AND 1000 AND thirst BETWEEN 0 AND 1000 AND fatigue BETWEEN 0 AND 1000 AND discomfort BETWEEN 0 AND 1000 AND unsafety BETWEEN 0 AND 1000 AND loneliness BETWEEN 0 AND 1000 AND health BETWEEN 0 AND 1000 AND id <> mother_id AND id <> father_id",
  relationship_ordered: "creature_a_id < creature_b_id",
  relationship_ranges:
    "score BETWEEN -1000 AND 1000 AND friendship BETWEEN 0 AND 1000 AND romance BETWEEN 0 AND 1000 AND trust BETWEEN 0 AND 1000 AND cooperation BETWEEN 0 AND 1000 AND avoidance BETWEEN 0 AND 1000 AND conflict BETWEEN 0 AND 1000",
  memory_importance_nonneg: "importance >= 0",
  memory_strength_range: "initial_strength BETWEEN 0 AND 1000",
  memory_emotion_range: "emotional_value BETWEEN -1000 AND 1000",
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeSql(sql) {
  const flat = sql
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .replace(/'(-?\d+)'::integer/g, "$1")
    .trim();
  return flat.replace(
    /(\w+) BETWEEN (-?\d+) AND (-?\d+)/g,
    "$1 >= $2 AND $1 <= $3",
  );
}

async function publicTables(client) {
  const result = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  return result.rows.map((row) => row.tablename);
}

function deploy() {
  const result = spawnSync(
    "npx",
    ["--no-install", "prisma", "migrate", "deploy", "--schema", schemaPath],
    { cwd: repoRoot, stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) {
    fail(`prisma migrate deploy exited ${result.status}`);
  }
}

async function expectRejected(client, label, constraint, run) {
  await client.query("SAVEPOINT probe");
  try {
    await run();
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT probe");
    if (error.code === "23514" && error.constraint === constraint) {
      console.log(`rejected ${label} (${constraint})`);
      return;
    }
    const code = error.code ?? "none";
    const found = error.constraint ?? "none";
    throw new Error(
      `${label}: expected check ${constraint}, got ${code} ${found}: ${error.message}`,
    );
  }
  await client.query("ROLLBACK TO SAVEPOINT probe");
  throw new Error(`${label}: write was accepted`);
}

async function insertCreature(client, id, gender, hunger) {
  await client.query(
    `INSERT INTO creature (
      id, world_id, name, name_given_by_player, species_id, gender, status,
      birth_tick, territory_id, lineage_id, generation,
      gene_strength, gene_speed, gene_intelligence, gene_curiosity, gene_sociability,
      genes_extra,
      trait_curiosity, trait_aggression, trait_loyalty, trait_sociability,
      trait_bravery, trait_risk_taking, personality_extra,
      hunger, thirst, fatigue, discomfort, unsafety, loneliness, health,
      current_goal, action_target_kind
    ) VALUES (
      $1, 1, $2, false, 1, $3::"Gender", 'ALIVE',
      0, 1, 1, 0,
      500, 500, 500, 500, 500,
      '{}'::jsonb,
      500, 500, 500, 500,
      500, 500, '{}'::jsonb,
      $4, 300, 200, 100, 40, 200, 850,
      'IDLE', 'NONE'
    )`,
    [id, `Creature ${id}`, gender, hunger],
  );
}

async function insertMemory(client, id, importance, emotionalValue, strength) {
  await client.query(
    `INSERT INTO memory (
      id, world_id, creature_id, tick, kind, importance, emotional_value,
      initial_strength, payload
    ) VALUES (
      $1, 1, 1, 0, 'DISCOVERY', $2, $3, $4, '{}'::jsonb
    )`,
    [id, importance, emotionalValue, strength],
  );
}

async function insertRelationship(client, id, creatureAId, creatureBId, score) {
  await client.query(
    `INSERT INTO relationship (
      id, world_id, creature_a_id, creature_b_id,
      score, friendship, romance, trust, cooperation, avoidance, conflict,
      met_tick, last_interaction_tick, interaction_count
    ) VALUES ($1, 1, $2, $3, $4, 0, 0, 0, 0, 0, 0, 0, 0, 0)`,
    [id, creatureAId, creatureBId, score],
  );
}

async function assertCatalog(client) {
  const tables = await publicTables(client);
  const expected = [...MODEL_TABLES, "_prisma_migrations"].sort();
  const actual = [...tables].sort();
  if (actual.join() !== expected.join()) {
    throw new Error(
      `public tables:\n  ${actual.join("\n  ")}\nexpected:\n  ${expected.join("\n  ")}`,
    );
  }

  const migrations = await client.query(
    "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name",
  );
  const names = migrations.rows.map((row) => row.migration_name);
  if (names.join() !== migrationName) {
    throw new Error(`migrations: ${names.join(", ") || "(none)"}`);
  }

  const sequences = await client.query(
    `SELECT table_name, column_name, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_default LIKE '%nextval%'`,
  );
  if (sequences.rows.length > 0) {
    throw new Error(`identity defaults: ${JSON.stringify(sequences.rows)}`);
  }

  const checks = await client.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conname = ANY($1::name[])`,
    [Object.keys(CHECKS)],
  );
  const byName = new Map(checks.rows.map((row) => [row.conname, row.def]));
  for (const [name, expectedDef] of Object.entries(CHECKS)) {
    const actualDef = byName.get(name);
    if (!actualDef) throw new Error(`missing constraint ${name}`);
    const normalized = normalizeSql(actualDef.replace(/^CHECK\s+/i, ""));
    const expected = normalizeSql(expectedDef);
    if (normalized !== expected) {
      throw new Error(
        `${name} definition mismatch\n  actual: ${normalized}\n  expected: ${expected}`,
      );
    }
  }

  const indexes = await client.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = ANY($1::name[])`,
    [["creature_living_territory_idx", "creature_living_action_end_idx"]],
  );
  const indexByName = new Map(
    indexes.rows.map((row) => [row.indexname, row.indexdef]),
  );
  const territoryIdx = indexByName.get("creature_living_territory_idx") ?? "";
  const actionIdx = indexByName.get("creature_living_action_end_idx") ?? "";
  if (
    !territoryIdx.includes("(world_id, territory_id)") ||
    !territoryIdx.includes("ALIVE")
  ) {
    throw new Error(`territory partial index: ${territoryIdx}`);
  }
  if (
    !actionIdx.includes("(world_id, action_ends_tick)") ||
    !actionIdx.includes("ALIVE")
  ) {
    throw new Error(`action partial index: ${actionIdx}`);
  }
  console.log("catalog matches the architecture schema and SQL checks");
}

async function assertBehavior(client) {
  await client.query(
    `INSERT INTO world (
      id, name, seed, schema_version, ruleset_version, ruleset,
      created_at, clock_at, last_tick,
      next_creature_id, next_memory_id, next_relationship_id, next_event_id,
      next_lineage_id, next_modifier_id, next_territory_id, next_influence_id
    ) VALUES (
      1, 'fixture', 1, 1, 1, '{}'::jsonb,
      TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '2026-01-01 00:00:00', 0,
      3, 1, 1, 1, 2, 1, 2, 1
    )`,
  );
  await client.query(
    `INSERT INTO species (
      id, world_id, slug, display_name, diet,
      maturity_days, base_lifespan_days, gestation_days, juvenile_days,
      base_curiosity, base_aggression, base_loyalty, base_sociability,
      base_bravery, base_risk_taking, color_hex
    ) VALUES (
      1, 1, 'fire-fox', 'Fire Fox', 'HERBIVORE',
      90, 900, 18, 16, 700, 350, 500, 600, 550, 650, '#E07A3D'
    )`,
  );
  await client.query(
    `INSERT INTO territory (id, world_id, slug, name, food_abundance, danger, capacity)
     VALUES (1, 1, 'meadow', 'Meadow', 700, 200, 40)`,
  );
  await client.query(
    `INSERT INTO lineage (
      id, world_id, founder_creature_id, species_id, name, founded_tick
    ) VALUES (1, 1, NULL, 1, 'Fern line', 0)`,
  );
  await insertCreature(client, 1, "FEMALE", 300);
  await insertCreature(client, 2, "MALE", 300);
  await client.query("UPDATE creature SET hunger = 0 WHERE id = 1");
  await client.query("UPDATE creature SET hunger = 1000 WHERE id = 1");
  await client.query("UPDATE creature SET hunger = 300 WHERE id = 1");
  await insertRelationship(client, 1, 1, 2, 0);
  await client.query("UPDATE relationship SET score = -1000 WHERE id = 1");
  await client.query("UPDATE relationship SET score = 1000 WHERE id = 1");
  await insertMemory(client, 1, 0, -1000, 0);
  await client.query(
    "UPDATE memory SET initial_strength = 1000, emotional_value = 1000 WHERE id = 1",
  );
  console.log("accepted in-range hunger, score, and memory bounds");

  await expectRejected(
    client,
    "reversed relationship pair",
    "relationship_ordered",
    () => insertRelationship(client, 2, 2, 1, 0),
  );
  await expectRejected(
    client,
    "equal relationship pair",
    "relationship_ordered",
    () => insertRelationship(client, 3, 1, 1, 0),
  );
  await expectRejected(client, "hunger 1001", "creature_ranges", () =>
    client.query("UPDATE creature SET hunger = 1001 WHERE id = 1"),
  );
  await expectRejected(client, "hunger -1", "creature_ranges", () =>
    client.query("UPDATE creature SET hunger = -1 WHERE id = 1"),
  );
  await expectRejected(
    client,
    "creature is its own mother",
    "creature_ranges",
    () => client.query("UPDATE creature SET mother_id = id WHERE id = 1"),
  );
  await expectRejected(client, "score 1001", "relationship_ranges", () =>
    client.query("UPDATE relationship SET score = 1001 WHERE id = 1"),
  );
  await expectRejected(
    client,
    "importance -1",
    "memory_importance_nonneg",
    () => client.query("UPDATE memory SET importance = -1 WHERE id = 1"),
  );
  await expectRejected(
    client,
    "initial strength 1001",
    "memory_strength_range",
    () =>
      client.query("UPDATE memory SET initial_strength = 1001 WHERE id = 1"),
  );
  await expectRejected(
    client,
    "emotional value -1001",
    "memory_emotion_range",
    () =>
      client.query("UPDATE memory SET emotional_value = -1001 WHERE id = 1"),
  );
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL is required");
  const requireEmpty = process.argv.includes("--require-empty");

  if (requireEmpty) {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const tables = await publicTables(client);
      if (tables.length > 0) {
        fail(`database is not empty: ${tables.join(", ")}`);
      }
      console.log("database has no public tables");
    } finally {
      await client.end();
    }
  }

  deploy();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await assertCatalog(client);
    await assertBehavior(client);
    await client.query("ROLLBACK");
    console.log("fixture rolled back");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection may already be closing.
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
