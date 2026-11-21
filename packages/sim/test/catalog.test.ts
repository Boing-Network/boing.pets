import assert from "node:assert/strict";
import { test } from "node:test";
import { SPECIES_CATALOG, speciesKeyForSlug } from "@boing-pets/contract";
import { aggregateTerritories } from "../src/kernel/territories";
import { exploreDestination } from "../src/ai/actions";
import {
  LINK_CATALOG,
  TERRITORY_CATALOG,
  WORLDGEN_SPECIES,
  createWorld,
} from "../src/index";

test("worldgen species match the contract catalog one to one", () => {
  const pick = (row: {
    id: number;
    slug: string;
    displayName: string;
    home: string;
    diet: string;
    gait: string;
  }) => [row.id, row.slug, row.displayName, row.home, row.diet, row.gait];
  assert.deepEqual(WORLDGEN_SPECIES.map(pick), SPECIES_CATALOG.map(pick));
  assert.equal(SPECIES_CATALOG.length, 35);
  assert.deepEqual(
    SPECIES_CATALOG.map((row) => row.id),
    SPECIES_CATALOG.map((_, index) => index + 1),
  );
});

test("species biology stays inside sane ranges", () => {
  for (const row of WORLDGEN_SPECIES) {
    assert.ok(row.juvenileDays < row.maturityDays, row.slug);
    assert.ok(row.gestationDays < row.maturityDays, row.slug);
    assert.ok(row.maturityDays * 4 <= row.baseLifespanDays, row.slug);
    for (const value of Object.values(row.genes)) {
      assert.ok(value >= 200 && value <= 800, `${row.slug} gene ${value}`);
    }
    for (const value of Object.values(row.needs)) {
      assert.ok(value >= -2 && value <= 1, `${row.slug} need ${value}`);
    }
    assert.ok(row.forageSkill >= 0 && row.forageSkill <= 100, row.slug);
    assert.ok(!row.habitat.includes(row.home), `${row.slug} lists home twice`);
    assert.match(row.colorHex, /^#[0-9A-F]{6}$/);
  }
});

test("legacy slugs resolve to the renamed species with the same id", () => {
  assert.equal(speciesKeyForSlug("fernfox")?.slug, "fire-fox");
  assert.equal(speciesKeyForSlug("mossback")?.slug, "moss-stag");
  assert.equal(speciesKeyForSlug("pebblehare")?.slug, "lantern-moth");
  assert.equal(speciesKeyForSlug("pebblehare")?.id, 3);
  assert.ok(!speciesKeyForSlug("nope"));
});

test("every territory is home to exactly five species", () => {
  const slugs = new Set(TERRITORY_CATALOG.map((row) => row.slug));
  for (const row of WORLDGEN_SPECIES) {
    assert.ok(slugs.has(row.home), row.home);
    for (const extra of row.habitat) assert.ok(slugs.has(extra), extra);
  }
  for (const territory of TERRITORY_CATALOG) {
    const residents = WORLDGEN_SPECIES.filter(
      (row) => row.home === territory.slug,
    );
    assert.equal(residents.length, 5, territory.slug);
  }
});

test("territory links are two-way and connect the whole map", () => {
  const key = (a: string, b: string) => `${a}>${b}`;
  const edges = new Map(
    LINK_CATALOG.map((row) => [key(row.from, row.to), row.travelTicks]),
  );
  for (const row of LINK_CATALOG) {
    assert.equal(edges.get(key(row.to, row.from)), row.travelTicks);
  }
  const seen = new Set<string>(["meadow"]);
  const queue = ["meadow"];
  while (queue.length > 0) {
    const at = queue.shift()!;
    for (const row of LINK_CATALOG) {
      if (row.from === at && !seen.has(row.to)) {
        seen.add(row.to);
        queue.push(row.to);
      }
    }
  }
  assert.equal(seen.size, TERRITORY_CATALOG.length);
});

test("seed 1 seeds one female and one male founder of every species at home", () => {
  const { snapshot } = createWorld(1);
  assert.equal(snapshot.territories.length, TERRITORY_CATALOG.length);
  for (const species of WORLDGEN_SPECIES) {
    const home = snapshot.territories.find((row) => row.slug === species.home);
    assert.ok(home);
    const founders = snapshot.creatures.filter(
      (row) => row.speciesId === species.id,
    );
    assert.equal(founders.length, snapshot.ruleset.founderCountPerSpecies);
    assert.ok(founders.every((row) => row.territoryId === home.id));
    const genders = founders.map((row) => row.gender).sort();
    assert.equal(snapshot.ruleset.founderCountPerSpecies, 2);
    assert.deepEqual(genders, ["FEMALE", "MALE"]);
    // Founders arrive as young adults, just mature on tick 0.
    for (const founder of founders) {
      assert.equal(
        founder.birthTick,
        -species.maturityDays * snapshot.ruleset.ticksPerDay,
      );
    }
    assert.ok(
      snapshot.discoveries.some((row) => row.territoryId === home.id),
      `${species.slug} discovered its home`,
    );
  }
});

test("new territories are reachable for exploration", () => {
  const { snapshot } = createWorld(1);
  const glade = snapshot.territories.find((row) => row.slug === "glade");
  assert.ok(glade);
  const hare = snapshot.creatures.find((row) => row.territoryId === glade.id);
  assert.ok(hare);
  const destination = exploreDestination(
    snapshot,
    hare,
    aggregateTerritories(snapshot, 0),
  );
  assert.ok(destination, "a glade creature has somewhere new to explore");
  const linked = snapshot.links
    .filter((row) => row.fromId === glade.id)
    .map((row) => row.toId);
  assert.ok(linked.includes(destination.territoryId));
});
