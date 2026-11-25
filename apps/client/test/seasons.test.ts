import assert from "node:assert/strict";
import { test } from "node:test";
import { ItemSlug, Season } from "@boing-pets/contract";
import {
  abundanceLabel,
  foragingText,
  seasonSummary,
} from "../src/hud/seasons";

const DAY = 144;

test("the season line names the day, what is next, and what it changes", () => {
  const spring = seasonSummary(2 * DAY + 5);
  assert.equal(spring.title, "Spring, day 3 of 7");
  assert.equal(spring.next, "Summer in 5 days");
  assert.deepEqual(spring.plentiful, ["Clover"]);
  assert.deepEqual(spring.scarce, ["Crystal shard", "Thornberry"]);
  assert.equal(
    spring.note,
    "Clover plentiful; Crystal shard and Thornberry scarce.",
  );
  assert.equal(seasonSummary(7 * DAY - 1).next, "Summer tomorrow");
  // Autumn is the harvest: nothing is scarce.
  const autumn = seasonSummary(14 * DAY);
  assert.deepEqual(autumn.scarce, []);
  assert.equal(autumn.note, "Glowmoss and Amber resin plentiful.");
});

test("materials are tagged only when the season changes them", () => {
  assert.equal(abundanceLabel(ItemSlug.CLOVER, Season.SPRING), "plentiful");
  assert.equal(abundanceLabel(ItemSlug.CLOVER, Season.WINTER), "scarce");
  assert.equal(abundanceLabel(ItemSlug.CLOVER, Season.SUMMER), "");
});

test("the finding-materials note grades a creature from its genes", () => {
  assert.deepEqual(
    foragingText({ intelligence: 900, speed: 800, curiosity: 800 }),
    { grade: "Keen", detail: "finds a material about 4 times in 10 forages" },
  );
  assert.deepEqual(foragingText({ intelligence: 0, speed: 0, curiosity: 0 }), {
    grade: "Poor",
    detail: "finds a material about 1 time in 10 forages",
  });
});
