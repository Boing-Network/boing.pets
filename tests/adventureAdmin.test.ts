import { describe, expect, it } from "vitest";
import {
  ADVENTURE_ICONIC_CEILING_WEIGHT,
  ADVENTURE_MYTHIC_CEILING_WEIGHT,
  ADVENTURE_RARITY_WEIGHTS,
  STYLE_LUCK_MULTIPLIER_CAP,
} from "../src/content/adventures";
import {
  AdventureAdminValidationError,
  buildAdventureAdminMessage,
  clampIconicWeight,
  effectivePityGrants,
  mergeRarityWeights,
  mergeStyleLuckCap,
  popupStatusAt,
  utcDayKey,
  validatePityGrants,
  validatePopupEvent,
  validateRarityOverride,
  validateStyleLuckOverride,
} from "../src/content/adventureAdmin";

describe("adventure admin validation", () => {
  it("refuses an Iconic weight above the hard ceiling", () => {
    expect(() =>
      validateRarityOverride({
        weights: { iconic: ADVENTURE_ICONIC_CEILING_WEIGHT + 1 },
      }),
    ).toThrow(/Iconic cannot be set above the hard ceiling/);
    expect(clampIconicWeight(10_000)).toBe(ADVENTURE_ICONIC_CEILING_WEIGHT);
  });

  it("refuses a Mythic weight above its ceiling and pity that grants Grail or Vaulted", () => {
    expect(() =>
      validateRarityOverride({
        weights: { mythic: ADVENTURE_MYTHIC_CEILING_WEIGHT + 1 },
      }),
    ).toThrow(/Mythic cannot be set above the hard ceiling/);
    expect(() => validatePityGrants("mythic")).toThrow(
      /Pity can never include Mythic or Iconic/,
    );
    expect(() => validatePityGrants("iconic")).toThrow(
      /Pity can never include Mythic or Iconic/,
    );
    expect(validatePityGrants("legendary")).toBe("legendary");
  });

  it("falls back to code rarity defaults when an override is missing or partial", () => {
    expect(mergeRarityWeights(null)).toEqual(ADVENTURE_RARITY_WEIGHTS);
    const merged = mergeRarityWeights({ weights: { rare: 120000 } });
    expect(merged.rare).toBe(120000);
    expect(merged.common).toBe(ADVENTURE_RARITY_WEIGHTS.common);
    expect(effectivePityGrants({ pityGrants: "iconic" })).toBe("legendary");
    expect(effectivePityGrants(null)).toBe("legendary");
  });

  it("keeps Style Luck under the code cap", () => {
    expect(() =>
      validateStyleLuckOverride({
        multiplierCap: STYLE_LUCK_MULTIPLIER_CAP + 1,
      }),
    ).toThrow(/multiplierCap/);
    expect(mergeStyleLuckCap({ multiplierCap: 1.5 })).toBe(1.5);
    expect(mergeStyleLuckCap(null)).toBe(STYLE_LUCK_MULTIPLIER_CAP);
  });

  it("validates Pop-Up windows and builds a stable admin message", () => {
    const event = validatePopupEvent({
      id: "summer-popup",
      name: "Summer Drop",
      startsAt: 1_000,
      endsAt: 2_000,
      pool: [{ itemId: "popup-guest-pass", rarity: "rare" }],
    });
    expect(event.status).toBe("scheduled");
    expect(popupStatusAt({ ...event, status: "scheduled" }, 1_500)).toBe(
      "live",
    );
    expect(popupStatusAt({ ...event, status: "ended" }, 1_500)).toBe("ended");
    expect(() =>
      validatePopupEvent({ name: "Bad", startsAt: 5, endsAt: 1 }),
    ).toThrow(/start and a later end/);
    const message = buildAdventureAdminMessage({
      origin: "http://localhost:5177",
      issuedAt: 42,
      action: "analytics",
    });
    expect(message).toContain("Boing Pets adventure admin v1");
    expect(message).toContain("Action: analytics");
    expect(utcDayKey(Date.UTC(2026, 10, 14, 12))).toBe("2026-11-14");
  });

  it("rejects unknown rarities and empty overrides", () => {
    expect(() =>
      validateRarityOverride({ weights: { ultra: 1 } as never }),
    ).toThrow(AdventureAdminValidationError);
    expect(() => validateRarityOverride({})).toThrow(/needs weights/);
  });
});
