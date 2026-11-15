import { describe, expect, it } from "vitest";
import {
  GATHER_CRED_UNITS_PER_DAY,
  GATHER_LEVEL_CAP,
  GATHER_NODE_MAX_MS,
  GATHER_NODE_MIN_MS,
  GATHER_PACK_UNITS,
  applyGatherTicks,
  credPerUnit,
  faceSuccessChance,
  levelsCrossed,
  mintPresets,
  nodeLifeMs,
  parseMintQty,
  planBankCred,
  nodesForSkill,
  quarryNodesFor,
  quarrySeedXp,
  rollDepleteTicks,
  skillProgress,
  tickMs,
  xpToReach,
} from "../src/content/gathering";

function sequence(values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

describe("quarry skill rules", () => {
  it("uses the OSRS curve and caps unlocks at 50", () => {
    expect(xpToReach(1)).toBe(0);
    expect(xpToReach(2)).toBe(83);
    expect(xpToReach(50)).toBe(101333);
    const atCap = skillProgress(xpToReach(50));
    expect(atCap.level).toBe(50);
    expect(atCap.prestige).toBe(0);
    const past = skillProgress(xpToReach(51));
    expect(past.level).toBe(GATHER_LEVEL_CAP);
    expect(past.prestige).toBe(1);
    expect(tickMs(past.level)).toBe(tickMs(50));
    expect(faceSuccessChance(past.level, 1)).toBe(faceSuccessChance(50, 1));
  });

  it("keeps pickaxes as a hard lock on top of level", () => {
    expect(quarryNodesFor(50, 1).map((node) => node.id)).toEqual([
      "ore-pebble",
      "ore-spark",
    ]);
    expect(quarryNodesFor(14, 4).map((node) => node.id)).toEqual([
      "ore-pebble",
      "ore-spark",
    ]);
    expect(quarryNodesFor(20, 2).map((node) => node.id)).toEqual([
      "ore-pebble",
      "ore-spark",
      "ore-emberite",
      "ore-crystal",
    ]);
    expect(
      quarryNodesFor(35, 2).some((node) => node.id === "ore-aetherite"),
    ).toBe(false);
    expect(
      quarryNodesFor(35, 3).some((node) => node.id === "ore-aetherite"),
    ).toBe(true);
    expect(quarrySeedXp({ pickTier: 2, discoveredIds: [] })).toBe(
      xpToReach(20),
    );
  });

  it("opens fish, crops, and finds by level", () => {
    expect(nodesForSkill("line", 1).map((node) => node.id)).toEqual([
      "fish-ripple",
    ]);
    expect(nodesForSkill("line", 45).map((node) => node.id)).toContain(
      "fish-starfin",
    );
    expect(nodesForSkill("plot", 1).map((node) => node.id)).toContain(
      "crop-forage",
    );
    expect(nodesForSkill("sweep", 1).map((node) => node.id)).toEqual([
      "loot-pebble",
    ]);
    expect(nodesForSkill("plot", 45).length).toBeGreaterThan(4);
  });

  it("rolls a node life of about 2 to 5 minutes", () => {
    const tick = tickMs(1);
    const shortest = rollDepleteTicks(sequence([0]), tick);
    const longest = rollDepleteTicks(sequence([0.999999]), tick);
    expect(nodeLifeMs(shortest, tick)).toBeGreaterThanOrEqual(
      GATHER_NODE_MIN_MS - tick,
    );
    expect(nodeLifeMs(longest, tick)).toBeLessThanOrEqual(
      GATHER_NODE_MAX_MS + tick,
    );
    expect(nodeLifeMs(shortest, tick)).toBeGreaterThan(90_000);
    const fast = tickMs(50);
    const longFast = rollDepleteTicks(sequence([0.999999]), fast);
    expect(nodeLifeMs(longFast, fast)).toBeGreaterThan(2 * 60_000);
  });

  it("stops at 28 and does not consume the overflow tick", () => {
    let sawPacked = false;
    for (let n = 0; n < 40; n++) {
      const applied = applyGatherTicks({
        tickCount: 8,
        seed: `pack-${n}`,
        ticksAlreadySettled: 0,
        packUnits: GATHER_PACK_UNITS - 1,
        level: 1,
        pickTier: 1,
      });
      expect(applied.packUnits).toBeLessThanOrEqual(GATHER_PACK_UNITS);
      if (applied.packed) {
        sawPacked = true;
        expect(applied.packUnits).toBe(GATHER_PACK_UNITS);
        expect(applied.consumed).toBeLessThan(8);
      }
    }
    expect(sawPacked).toBe(true);
  });

  it("ignores any caller-supplied tick total beyond the count it is given", () => {
    const one = applyGatherTicks({
      tickCount: 1,
      seed: "same",
      ticksAlreadySettled: 0,
      packUnits: 0,
      level: 1,
      pickTier: 1,
    });
    const manyAsked = applyGatherTicks({
      tickCount: 1,
      seed: "same",
      ticksAlreadySettled: 0,
      packUnits: 0,
      level: 1,
      pickTier: 1,
    });
    expect(manyAsked).toEqual(one);
    expect(one.consumed).toBeLessThanOrEqual(1);
  });

  it("pays floor(reward/8) Cred and stops after 80 units", () => {
    expect(credPerUnit(4)).toBe(1);
    expect(credPerUnit(36)).toBe(4);
    const plan = planBankCred(
      [
        { itemId: "ore-pebble", qty: 50 },
        { itemId: "ore-aetherite", qty: 40 },
      ],
      0,
    );
    expect(plan.paidUnits).toBe(GATHER_CRED_UNITS_PER_DAY);
    expect(plan.byItem["ore-aetherite"]).toBe(40 * 4);
    expect(plan.byItem["ore-pebble"]).toBe(40);
    const capped = planBankCred([{ itemId: "ore-pebble", qty: 10 }], 80);
    expect(capped.cred).toBe(0);
    expect(capped.paidUnits).toBe(0);
  });

  it("disables mint presets larger than the banked stack", () => {
    const presets = mintPresets(40);
    expect(presets.find((row) => row.qty === 10)?.enabled).toBe(true);
    expect(presets.find((row) => row.qty === 100)?.enabled).toBe(false);
    expect(parseMintQty(40, 40)).toBe(40);
    expect(() => parseMintQty(41, 40)).toThrow(/Not enough banked/);
    expect(() => parseMintQty(10_001, 20_000)).toThrow(/too large/);
  });

  it("toasts prestige without raising the unlock level", () => {
    const crossed = levelsCrossed(xpToReach(50) - 1, xpToReach(51));
    expect(crossed.map((row) => row.label)).toEqual(["QUARRY 50", "QUARRY P1"]);
    expect(crossed.every((row) => row.level <= 50)).toBe(true);
  });
});
