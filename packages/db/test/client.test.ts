import assert from "node:assert/strict";
import { test } from "node:test";
import { pgConnectionOptions } from "../src/client";

test("pgConnectionOptions moves ?schema= into the adapter option", () => {
  const out = pgConnectionOptions(
    "postgresql://u:p@localhost:5432/postgres?schema=living_pets_smoke&sslmode=disable",
  );
  assert.equal(out.schema, "living_pets_smoke", "schema extracted");
  assert.equal(
    out.connectionString,
    "postgresql://u:p@localhost:5432/postgres?sslmode=disable",
    "schema removed, other params kept",
  );
});

test("pgConnectionOptions leaves URLs without a schema alone", () => {
  const url = "postgresql://u:p@db.internal:5432/pets";
  assert.deepEqual(
    pgConnectionOptions(url),
    { connectionString: url },
    "unchanged",
  );
});
