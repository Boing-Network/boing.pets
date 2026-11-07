import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCESSORIES, accessory, foundWhileForaging, rarityRank } from "../src/wardrobe";
import { grantPiece } from "../worker/wardrobe";
import { YardError } from "../worker/errors";

describe("pet wardrobe", () => {
  it("keeps every catalog piece on one clothing slot", () => {
    const ids = new Set(ACCESSORIES.map((item) => item.id));
    expect(ids.size).toBe(ACCESSORIES.length);
    for (const item of ACCESSORIES) expect(accessory(item.id)?.slot).toBe(item.slot);
    expect(rarityRank("mythic")).toBeGreaterThan(rarityRank("common"));
  });
  it("lets forage find only common clothes", () => {
    const found = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const item = foundWhileForaging("challenge-" + i);
      if (!item) continue;
      found.add(item);
      expect(accessory(item)?.rarity).toBe("common");
    }
    expect(found.size).toBeGreaterThan(0);
  });
  it("grants a chosen piece once and keeps forage off the rare catalog", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync(new NodeURL("../migrations/0002_yard.sql", import.meta.url), "utf8"));
    const env = {
      DB: {
        prepare: (sql: string) => {
          const statement = {
            values: [] as unknown[],
            bind(...values: unknown[]) {
              statement.values = values;
              return statement;
            },
            async run() {
              db.prepare(sql).run(...(statement.values as never[]));
            },
          };
          return statement;
        },
      },
    } as unknown as Env;
    const owner = "0x" + "ab".repeat(32);
    await grantPiece(env, owner, "moon-cape", "minigame", 1, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    await grantPiece(env, owner, "moon-cape", "minigame", 2, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(db.prepare("SELECT item,source FROM wardrobe").all()).toEqual([{ item: "moon-cape", source: "minigame" }]);
    await expect(grantPiece(env, owner, "moon-cape", "forage", 3, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")).rejects.toBeInstanceOf(
      YardError,
    );
    expect(db.prepare("SELECT COUNT(*) AS n FROM wardrobe").get()).toEqual({ n: 1 });
    db.close();
  });
});
