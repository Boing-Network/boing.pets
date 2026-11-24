import assert from "node:assert/strict";
import { test } from "node:test";
import type { TerritoryView } from "@boing-pets/contract";
import { territoryOverlayLine } from "../src/view/world/territory-overlay";
import { spoilText } from "../src/hud/workshop";

const base = {
  id: 1,
  name: "Meadow",
  biome: "MEADOW",
  foodBase: 1000,
  danger: 0,
  climate: "TEMPERATE",
  food: 1000,
  effectiveDanger: 0,
  population: 3,
} as unknown as TerritoryView;

test("overlay is empty without effects or stock", () => {
  assert.equal(territoryOverlayLine(base, 10), "");
  assert.equal(territoryOverlayLine(undefined, 10), "");
});

test("overlay lists effects with days left, then stock", () => {
  const line = territoryOverlayLine(
    {
      ...base,
      effects: [
        { kind: "FOOD", amount: 100, endTick: 10 + 144 * 6 + 1 },
        { kind: "COMFORT", amount: 2, endTick: 10 + 144 * 3 },
      ],
      resource: { slug: "resource.clover", free: 9, cap: 12 },
    },
    10,
  );
  assert.equal(line, "food +100 · 7d   salt lick · 3d   Clover 9/12");
});

test("spoil text", () => {
  assert.equal(spoilText(null, 0), "keeps");
  assert.equal(spoilText(100, 0), "spoils today");
  assert.equal(spoilText(144 * 3 + 5, 0), "spoils in 3d");
});
