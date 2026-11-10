import { describe, expect, it } from "vitest";
import {
  DROP_TABLE,
  dropDigest,
  publicDropTable,
  rollCosmeticDrop,
  utcDayKey,
} from "../src/drops";

const emptyPity = { hitsSinceRare: 0, hitsSincePremium: 0 };

describe("cosmetic drop table", () => {
  it("keeps official odds for items 70-76 that sum to 1000", () => {
    const table = publicDropTable();
    expect(table.version).toBe("drop:v1");
    expect(table.hitChanceBps).toBe(1500);
    expect(DROP_TABLE.reduce((s, e) => s + e.weight, 0)).toBe(1000);
    expect(table.entries.map((e) => e.itemId).sort((a, b) => a - b)).toEqual([
      70, 71, 72, 73, 74, 75, 76,
    ]);
    const ribbon = table.entries.find((e) => e.itemId === 70);
    expect(ribbon?.oddsPerMille).toBe(400);
    const aurora = table.entries.find((e) => e.itemId === 74);
    expect(aurora?.oddsPerMille).toBe(12);
  });

  it("is deterministic and auditable from the blake3 seed", () => {
    const input = {
      owner: "0x" + "ab".repeat(32),
      source: "feed",
      day: "2026-11-10",
      nonce: "nonce-1",
      pity: emptyPity,
      dropsToday: 0,
      premiumsThisWeek: 0,
    };
    const a = rollCosmeticDrop(input);
    const b = rollCosmeticDrop(input);
    expect(a).toEqual(b);
    const digest = dropDigest(input);
    expect(a.digestHex).toBe(
      [...digest].map((x) => x.toString(16).padStart(2, "0")).join(""),
    );
  });

  it("respects the daily cap and premium pity", () => {
    const capped = rollCosmeticDrop({
      owner: "0x" + "cd".repeat(32),
      source: "play",
      day: utcDayKey(Date.UTC(2026, 10, 10)),
      nonce: "cap",
      pity: emptyPity,
      dropsToday: 5,
      premiumsThisWeek: 0,
    });
    expect(capped.hit).toBe(false);
    expect(capped.reason).toBe("capped-day");

    const pity = rollCosmeticDrop({
      owner: "0x" + "ef".repeat(32),
      source: "groom",
      day: "2026-11-10",
      nonce: "pity-premium",
      pity: { hitsSinceRare: 0, hitsSincePremium: 79 },
      dropsToday: 0,
      premiumsThisWeek: 0,
    });
    expect(pity.hit).toBe(true);
    expect(pity.entry?.tier).toBe("premium");
    expect(pity.reason).toBe("pity-premium");
    expect(pity.pity.hitsSincePremium).toBe(0);

    const downgrade = rollCosmeticDrop({
      owner: "0x" + "11".repeat(32),
      source: "checkin",
      day: "2026-11-10",
      nonce: "pity-capped",
      pity: { hitsSinceRare: 0, hitsSincePremium: 79 },
      dropsToday: 0,
      premiumsThisWeek: 1,
    });
    expect(downgrade.hit).toBe(true);
    expect(downgrade.entry?.tier).toBe("rare");
    expect(downgrade.reason).toBe("capped-premium-downgrade");
  });
});
