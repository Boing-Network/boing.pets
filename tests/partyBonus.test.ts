import { describe, expect, it } from "vitest";
import {
  computePartyBonus,
  partyBonusPercent,
  PARTY_BONUS_CAP,
  PARTY_BONUS_DAILY_CAP_BOINGLETS,
  VARIETY_DAY_MIN_KINDS,
  VARIETY_DAY_REWARD_BOINGLETS,
} from "../src/partyBonus";

describe("party bonus math", () => {
  it("scales with party size and caps", () => {
    expect(partyBonusPercent(1, false)).toBe(0);
    expect(partyBonusPercent(2, false)).toBe(0.1);
    expect(partyBonusPercent(3, false)).toBe(0.2);
    expect(partyBonusPercent(4, false)).toBe(PARTY_BONUS_CAP);
    expect(partyBonusPercent(4, true)).toBe(PARTY_BONUS_CAP);
    expect(partyBonusPercent(2, true)).toBe(0.15);
  });

  it("applies daily cap and floors amounts", () => {
    const open = computePartyBonus({
      partySize: 3,
      together: false,
      baseReward: 40,
      bonusGrantedToday: 0,
    });
    expect(open.amount).toBe(8); // 20% of 40
    expect(open.eligible).toBe(true);

    const capped = computePartyBonus({
      partySize: 4,
      together: true,
      baseReward: 200,
      bonusGrantedToday: PARTY_BONUS_DAILY_CAP_BOINGLETS - 2,
    });
    expect(capped.amount).toBe(2);
    expect(capped.cappedByDaily).toBe(true);
  });

  it("keeps variety constants coherent", () => {
    expect(VARIETY_DAY_MIN_KINDS).toBe(3);
    expect(VARIETY_DAY_REWARD_BOINGLETS).toBe(10);
  });

  it("grants at least 1 Boinglet on small catches", () => {
    const tiny = computePartyBonus({
      partySize: 2,
      together: false,
      baseReward: 4,
      bonusGrantedToday: 0,
    });
    expect(tiny.amount).toBe(1);
    expect(tiny.eligible).toBe(true);
  });
});
