import { describe, expect, it } from "vitest";
import {
  CHARACTER_LEVEL_CAP,
  characterLevelLabel,
  characterLevelsCrossed,
  characterProgress,
  characterTotalXp,
  characterXpBar,
  stageLabel,
  stageUpLabel,
  xpToReach,
} from "../src/content/character";

describe("characterProgress", () => {
  it("starts at level 1 with zero XP", () => {
    const p = characterProgress(0, 0);
    expect(p.level).toBe(1);
    expect(p.totalXp).toBe(0);
    expect(p.careXp).toBe(0);
    expect(p.adventureXp).toBe(0);
    expect(p.prestige).toBe(0);
  });

  it("sums care and adventure XP only", () => {
    expect(characterTotalXp(25, 40)).toBe(65);
    const p = characterProgress(25, 40);
    expect(p.totalXp).toBe(65);
    expect(p.careXp).toBe(25);
    expect(p.adventureXp).toBe(40);
  });

  it("ignores negative or non-finite pools", () => {
    expect(characterProgress(-10, Number.NaN).totalXp).toBe(0);
  });

  it("uses the OSRS table shared with gathering", () => {
    const at5 = xpToReach(5);
    const p = characterProgress(at5, 0);
    expect(p.level).toBe(5);
    expect(p.xpAtLevel).toBe(at5);
  });

  it("caps unlock level at 50 with prestige beyond", () => {
    const at51 = xpToReach(51);
    const p = characterProgress(at51, 0);
    expect(p.level).toBe(CHARACTER_LEVEL_CAP);
    expect(p.virtual).toBe(51);
    expect(p.prestige).toBe(1);
    expect(characterLevelLabel(p.level, p.prestige)).toBe("LEVEL P1");
  });

  it("reports crossed levels with character labels", () => {
    const before = xpToReach(2);
    const after = xpToReach(4);
    expect(characterLevelsCrossed(before, after)).toEqual([
      { level: 3, prestige: 0, label: "LEVEL 3" },
      { level: 4, prestige: 0, label: "LEVEL 4" },
    ]);
  });

  it("fills the XP bar within the current level", () => {
    const at3 = xpToReach(3);
    const at4 = xpToReach(4);
    const mid = at3 + Math.floor((at4 - at3) / 2);
    const bar = characterXpBar(characterProgress(mid, 0));
    expect(bar.ratio).toBeGreaterThan(0.4);
    expect(bar.ratio).toBeLessThan(0.6);
  });
});

describe("stage labels", () => {
  it("title-cases known stages", () => {
    expect(stageLabel("teen")).toBe("Teen");
    expect(stageUpLabel("adult")).toBe("STAGE UP · ADULT");
  });
});
