/**
 * Seasons and gene-driven finding: the year's clock, what each season does to
 * a territory's stock, and how a creature's genes change what it finds.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GATHER_RULES,
  ITEM_CATALOG,
  ItemCategory,
  ItemSlug,
  RESOURCE_SEASONS,
  SEASON_ORDER,
  SEASON_RULES,
  Season,
  abundanceOf,
  foragingGrade,
  foragingSkill,
  lootChancePerMille,
  seasonAt,
  stockCapFor,
} from "@boing-pets/contract";
import {
  createWorld,
  lootCheck,
  resourceStock,
  type CreatureRow,
  type WorldSnapshot,
} from "../src/index";

const DAY = 144;
const SEASON_TICKS = SEASON_RULES.daysPerSeason * DAY;

function world(seed = 1): WorldSnapshot {
  return createWorld(seed).snapshot;
}

function territoryId(snapshot: WorldSnapshot, slug: string): number {
  const row = snapshot.territories.find((t) => t.slug === slug);
  assert.ok(row, slug);
  return row.id;
}

test("the year runs spring, summer, autumn, winter, a week each", () => {
  assert.deepEqual(seasonAt(0, DAY), {
    season: Season.SPRING,
    year: 1,
    day: 1,
    daysLeft: 7,
    next: Season.SUMMER,
  });
  assert.equal(seasonAt(SEASON_TICKS - 1, DAY).season, Season.SPRING);
  assert.equal(seasonAt(SEASON_TICKS - 1, DAY).daysLeft, 1);
  for (let i = 0; i < 8; i += 1) {
    const clock = seasonAt(i * SEASON_TICKS, DAY);
    assert.equal(clock.season, SEASON_ORDER[i % 4]);
    assert.equal(clock.year, Math.floor(i / 4) + 1);
    assert.equal(clock.day, 1);
  }
  // Odd inputs never throw or go out of range.
  assert.equal(seasonAt(-5, DAY).season, Season.SPRING);
  assert.ok(SEASON_ORDER.includes(seasonAt(10, 0).season));
});

test("every material has a good and a bad season, and they differ", () => {
  const resources = ITEM_CATALOG.filter(
    (def) => def.category === ItemCategory.RESOURCE,
  );
  for (const def of resources) {
    const row = RESOURCE_SEASONS[def.slug];
    assert.ok(row, def.slug);
    assert.notEqual(row.plentiful, row.scarce);
    assert.equal(stockCapFor(def.slug, row.plentiful), 16);
    assert.equal(stockCapFor(def.slug, row.scarce), 8);
  }
  // Every season has something plentiful, so there is always a reason to look.
  for (const season of SEASON_ORDER) {
    assert.ok(
      resources.some((def) => abundanceOf(def.slug, season) === "plentiful"),
      season,
    );
  }
  assert.equal(abundanceOf("potion.calm", Season.SPRING), "normal");
  assert.equal(
    stockCapFor(ItemSlug.CLOVER, Season.SUMMER),
    GATHER_RULES.stockCap,
  );
});

test("a territory's stock follows the season", () => {
  const snapshot = world();
  const meadow = territoryId(snapshot, "meadow");
  const caps = [0, 1, 2, 3].map(
    (i) => resourceStock(snapshot, meadow, i * SEASON_TICKS + 1)?.cap,
  );
  // Clover: plentiful in spring, scarce in winter.
  assert.deepEqual(caps, [16, 12, 12, 8]);
  const ridge = territoryId(snapshot, "ridge");
  assert.equal(resourceStock(snapshot, ridge, 1)?.cap, 8);
  assert.equal(resourceStock(snapshot, ridge, 3 * SEASON_TICKS + 1)?.cap, 16);
  // Free stock never goes negative when the cap drops under what is taken.
  for (let i = 0; i < 10; i += 1) {
    snapshot.modifiers.push({
      id: 900 + i,
      worldId: snapshot.world.id,
      territoryId: meadow,
      kind: "HARVEST",
      amount: -GATHER_RULES.foodPerUnit,
      startTick: 3 * SEASON_TICKS - 10,
      endTick: 3 * SEASON_TICKS + 200,
      sourceInfluenceId: 1,
    });
  }
  assert.equal(resourceStock(snapshot, meadow, 3 * SEASON_TICKS + 1)?.free, 0);
});

test("genes set how often a creature finds materials", () => {
  const dull = { intelligence: 0, speed: 0, curiosity: 0 };
  const average = { intelligence: 500, speed: 500, curiosity: 500 };
  const sharp = { intelligence: 1000, speed: 1000, curiosity: 1000 };
  assert.equal(lootChancePerMille(dull), 100);
  assert.equal(lootChancePerMille(average), 300);
  assert.equal(lootChancePerMille(sharp), 500);
  // Intelligence counts double.
  assert.ok(
    foragingSkill({ intelligence: 800, speed: 400, curiosity: 400 }) >
      foragingSkill({ intelligence: 400, speed: 800, curiosity: 400 }),
  );
  assert.equal(foragingGrade(foragingSkill(sharp)), "keen");
  assert.equal(foragingGrade(foragingSkill(average)), "fair");
  assert.equal(foragingGrade(foragingSkill(dull)), "poor");
});

test("a keen creature loots more often than a dull one", () => {
  const snapshot = world();
  const meadow = territoryId(snapshot, "meadow");
  const base = snapshot.creatures.find((c) => c.territoryId === meadow);
  assert.ok(base);
  const withGenes = (value: number): CreatureRow => ({
    ...base,
    geneIntelligence: value,
    geneSpeed: value,
    geneCuriosity: value,
  });
  const count = (creature: CreatureRow) => {
    let found = 0;
    for (let tick = 1; tick <= 2000; tick += 1) {
      if (lootCheck(snapshot, creature, tick, "meadow").ok) found += 1;
    }
    return found;
  };
  const keen = count(withGenes(1000));
  const dull = count(withGenes(0));
  // About 1000 and 200 of 2000 rolls.
  assert.ok(keen > dull * 3, `${keen} vs ${dull}`);
  assert.ok(dull > 100 && keen < 1200, `${keen} vs ${dull}`);
});
