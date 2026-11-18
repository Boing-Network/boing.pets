import assert from "node:assert/strict";
import { test } from "node:test";
import {
  colorForSpecies,
  skinForSpecies,
  skinIdForSpecies,
} from "../src/view/species-skins";

test("maps v1 species to the three concept-art skins", () => {
  assert.equal(skinIdForSpecies(1), "fire-fox");
  assert.equal(skinIdForSpecies(2), "moss-stag");
  assert.equal(skinIdForSpecies(3), "lantern-moth");
});

test("unknown species falls back to moss-stag presentation", () => {
  assert.equal(skinIdForSpecies(99), "moss-stag");
});

test("palettes expose readable primary and emissive colors", () => {
  const fox = skinForSpecies(1);
  assert.equal(fox.label, "Fire fox");
  assert.match(fox.primary, /^#/);
  assert.match(fox.emissive, /^#/);
  assert.ok(fox.emissiveIntensity > 0);

  const stag = skinForSpecies(2);
  assert.equal(stag.label, "Moss stag");

  const moth = skinForSpecies(3);
  assert.equal(moth.label, "Lantern moth");
});

test("colorForSpecies matches the skin primary", () => {
  assert.equal(colorForSpecies(1), skinForSpecies(1).primary);
  assert.equal(colorForSpecies(2), skinForSpecies(2).primary);
  assert.equal(colorForSpecies(3), skinForSpecies(3).primary);
});
