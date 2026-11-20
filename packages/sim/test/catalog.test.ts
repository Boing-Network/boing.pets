import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CreatureStatus,
  SPECIES_CATALOG,
  speciesKeyForSlug,
} from "@boing-pets/contract";
import { aggregateTerritories } from "../src/kernel/territories";
import { exploreDestination } from "../src/ai/actions";
import {
  LINK_CATALOG,
  TERRITORY_CATALOG,
  WORLDGEN_SPECIES,
  createWorld,
  step,
} from "../src/index";

test("worldgen species match the contract catalog one to one", () => {
  assert.deepEqual(
    WORLDGEN_SPECIES.map((row) => [row.id, row.slug, row.displayName]),
    SPECIES_CATALOG.map((row) => [row.id, row.slug, row.displayName]),
  );
});

test("legacy slugs resolve to the renamed species with the same id", () => {
  assert.equal(speciesKeyForSlug("fernfox")?.slug, "fire-fox");
  assert.equal(speciesKeyForSlug("mossback")?.slug, "moss-stag");
  assert.equal(speciesKeyForSlug("pebblehare")?.slug, "lantern-moth");
  assert.equal(speciesKeyForSlug("pebblehare")?.id, 3);
  assert.ok(!speciesKeyForSlug("nope"));
});

test("every species has a home territory and every home is unique", () => {
  const slugs = new Set(TERRITORY_CATALOG.map((row) => row.slug));
  const homes = WORLDGEN_SPECIES.map((row) => row.home);
  for (const home of homes) assert.ok(slugs.has(home), home);
  assert.equal(new Set(homes).size, homes.length);
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

test("seed 1 seeds four founders of every species in its home territory", () => {
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
    assert.deepEqual(genders, ["FEMALE", "FEMALE", "MALE", "MALE"]);
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

test("all seven species survive a long seed-1 run", () => {
  const { snapshot } = createWorld(1);
  const days = 60;
  for (let tick = 0; tick < days * snapshot.ruleset.ticksPerDay; tick += 1) {
    step(snapshot);
  }
  for (const species of WORLDGEN_SPECIES) {
    const living = snapshot.creatures.filter(
      (row) =>
        row.speciesId === species.id && row.status === CreatureStatus.ALIVE,
    ).length;
    assert.ok(living > 0, `${species.slug} still has living members`);
  }
});
