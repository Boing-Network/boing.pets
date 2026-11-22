import assert from "node:assert/strict";
import { test } from "node:test";
import { Diet, SPECIES, TERRITORY_CATALOG } from "@boing-pets/contract";
import {
  BESTIARY_SPECIES,
  DEFAULT_BESTIARY_FILTERS,
  bestiaryHref,
  filterBestiary,
  marketHrefForSpecies,
  parseBestiarySearch,
  speciesCatalogRowBySlug,
  territoryName,
} from "../src/dev/bestiary-data";

test("the bestiary catalog lists all 42 species from the shared catalog", () => {
  assert.equal(BESTIARY_SPECIES.length, 42);
  assert.equal(BESTIARY_SPECIES.length, SPECIES.length);
  assert.deepEqual(
    BESTIARY_SPECIES.map((row) => row.id),
    SPECIES.map((row) => row.id),
  );
  for (const row of BESTIARY_SPECIES) {
    assert.ok(row.baseLifespanDays > 0, row.slug);
    assert.ok(row.home);
    assert.ok(Object.values(Diet).includes(row.diet), row.slug);
  }
});

test("every territory in the catalog can be used as a habitat filter", () => {
  assert.equal(TERRITORY_CATALOG.length, 7);
  for (const territory of TERRITORY_CATALOG) {
    const matches = filterBestiary(BESTIARY_SPECIES, {
      ...DEFAULT_BESTIARY_FILTERS,
      habitat: territory.slug,
    });
    assert.ok(matches.length >= 5, territory.slug);
    assert.ok(
      matches.every(
        (row) =>
          row.home === territory.slug || row.habitat.includes(territory.slug),
      ),
    );
  }
});

test("diet and search filters use catalog fields only", () => {
  const herbivores = filterBestiary(BESTIARY_SPECIES, {
    ...DEFAULT_BESTIARY_FILTERS,
    diet: Diet.HERBIVORE,
  });
  assert.ok(herbivores.length > 0);
  assert.ok(herbivores.every((row) => row.diet === Diet.HERBIVORE));

  const foxes = filterBestiary(BESTIARY_SPECIES, {
    ...DEFAULT_BESTIARY_FILTERS,
    query: "fire fox",
  });
  assert.equal(foxes.length, 1);
  assert.equal(foxes[0]?.slug, "fire-fox");

  const meadow = filterBestiary(BESTIARY_SPECIES, {
    ...DEFAULT_BESTIARY_FILTERS,
    query: "meadow",
  });
  assert.ok(meadow.some((row) => row.slug === "fire-fox"));
  assert.ok(
    meadow.every((row) => {
      const hay =
        `${territoryName(row.home)} ${row.habitat.map(territoryName).join(" ")}`.toLowerCase();
      return (
        hay.includes("meadow") ||
        row.displayName.toLowerCase().includes("meadow")
      );
    }),
  );
});

test("sort orders use real catalog values", () => {
  const byName = filterBestiary(BESTIARY_SPECIES, {
    ...DEFAULT_BESTIARY_FILTERS,
    sort: "name",
  });
  const names = byName.map((row) => row.displayName);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b)),
  );

  const byLife = filterBestiary(BESTIARY_SPECIES, {
    ...DEFAULT_BESTIARY_FILTERS,
    sort: "lifespan",
  });
  for (let i = 1; i < byLife.length; i += 1) {
    assert.ok(byLife[i - 1]!.baseLifespanDays >= byLife[i]!.baseLifespanDays);
  }
});

test("capture and slug query parsing keep the portrait tool's flags", () => {
  assert.deepEqual(parseBestiarySearch("?bestiary"), {
    slug: "",
    capture: false,
    pose: "walk",
  });
  assert.deepEqual(parseBestiarySearch("?bestiary=fire-fox"), {
    slug: "fire-fox",
    capture: false,
    pose: "walk",
  });
  assert.deepEqual(parseBestiarySearch("?bestiary=fire-fox&capture=1"), {
    slug: "fire-fox",
    capture: true,
    pose: "walk",
  });
  assert.deepEqual(
    parseBestiarySearch("?bestiary=moss-stag&capture&pose=idle"),
    {
      slug: "moss-stag",
      capture: true,
      pose: "idle",
    },
  );
  assert.equal(
    parseBestiarySearch("?bestiary=lantern-moth&pose=rest").pose,
    "rest",
  );
  assert.equal(speciesCatalogRowBySlug("fire-fox")?.displayName, "Fire Fox");
  assert.equal(speciesCatalogRowBySlug("nope"), null);
});

test("links point at the bestiary and the market species filter", () => {
  assert.equal(bestiaryHref(), "/world/?bestiary");
  assert.equal(bestiaryHref("fire-fox"), "/world/?bestiary=fire-fox");
  assert.equal(marketHrefForSpecies("fire-fox"), "/market/?species=fire-fox");
});
