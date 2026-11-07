import { afterEach, describe, expect, it } from "vitest";
import { openPostgres, postgresConnectionString } from "../server/db";

const url = postgresConnectionString();
const live = Boolean(url && process.env.NEON_PROJECT_ID);
let close: (() => Promise<void> | void) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

describe.skipIf(!live)("Neon pasture", () => {
  it("migrates and reads the shared database", async () => {
    const opened = await openPostgres(url);
    close = opened.close;
    const row = await opened.db
      .prepare("SELECT COUNT(*) AS n FROM pets")
      .first<{ n: number }>();
    expect(row?.n).toBeGreaterThanOrEqual(0);
  });
});
