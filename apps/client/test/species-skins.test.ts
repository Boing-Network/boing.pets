import assert from "node:assert/strict";
import { test } from "node:test";
import { worldScaleForSkin } from "../src/view/creatures/materials";
import { SPECIES_CATALOG } from "@boing-pets/contract";
import {
  ALL_SKIN_IDS,
  colorForSpecies,
  skinForSpecies,
  skinIdForSpecies,
  speciesLabel,
} from "../src/view/species-skins";

test("maps v1 species to the three concept-art skins", () => {
  assert.equal(skinIdForSpecies(1), "fire-fox");
  assert.equal(skinIdForSpecies(2), "moss-stag");
  assert.equal(skinIdForSpecies(3), "lantern-moth");
});

test("every catalog species has its own skin named after its slug", () => {
  assert.equal(ALL_SKIN_IDS.length, SPECIES_CATALOG.length);
  for (const row of SPECIES_CATALOG) {
    const skin = skinForSpecies(row.id);
    assert.equal(skin.id, row.slug);
    assert.equal(skin.label, row.displayName);
    assert.equal(speciesLabel(row.id), row.displayName);
    assert.ok(worldScaleForSkin(row.slug, false) > 0);
  }
  assert.equal(new Set(ALL_SKIN_IDS).size, ALL_SKIN_IDS.length);
});

test("new species map to their skins", () => {
  assert.equal(skinIdForSpecies(4), "glow-tortoise");
  assert.equal(skinIdForSpecies(5), "moon-hare");
  assert.equal(skinIdForSpecies(6), "crag-ram");
  assert.equal(skinIdForSpecies(7), "thistle-hog");
  assert.equal(speciesLabel(99), "Unknown species");
});

test("unknown species falls back to moss-stag presentation", () => {
  assert.equal(skinIdForSpecies(99), "moss-stag");
});

test("palettes expose readable primary and emissive colors", () => {
  const fox = skinForSpecies(1);
  assert.equal(fox.label, "Fire Fox");
  assert.match(fox.primary, /^#/);
  assert.match(fox.emissive, /^#/);
  assert.ok(fox.emissiveIntensity > 0);

  const stag = skinForSpecies(2);
  assert.equal(stag.label, "Moss Stag");

  const moth = skinForSpecies(3);
  assert.equal(moth.label, "Lantern Moth");
});

test("colorForSpecies matches the skin primary", () => {
  assert.equal(colorForSpecies(1), skinForSpecies(1).primary);
  assert.equal(colorForSpecies(2), skinForSpecies(2).primary);
  assert.equal(colorForSpecies(3), skinForSpecies(3).primary);
});

test("world scale keeps fox smaller than stag and moth compact", () => {
  const fox = worldScaleForSkin("fire-fox", false);
  const stag = worldScaleForSkin("moss-stag", false);
  const moth = worldScaleForSkin("lantern-moth", false);
  assert.ok(fox < stag);
  assert.ok(moth < fox);
  assert.ok(worldScaleForSkin("fire-fox", true) > fox);
});

test("lore emissives stay atmospheric (below first-pass neon levels)", () => {
  assert.ok(skinForSpecies(1).emissiveIntensity < 1);
  assert.ok(skinForSpecies(2).emissiveIntensity < 1);
  assert.ok(skinForSpecies(3).emissiveIntensity < 1.1);
  for (const id of [4, 5, 6, 7]) {
    assert.ok(skinForSpecies(id).emissiveIntensity < 1);
  }
});
