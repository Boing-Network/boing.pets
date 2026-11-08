import { describe, expect, it } from "vitest";
import { CARE_REWARDS } from "../src/core";
import {
  careEarnings,
  catalogItem,
  catalogPrice,
  CATALOG,
  listingFee,
  netSellerProceeds,
  SPARKLES_DAILY,
} from "../src/economy";

describe("economy foundation", () => {
  it("keeps a cosmetics-only catalog with boinglets or sparkles prices", () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(3);
    for (const item of CATALOG) {
      const priced = catalogPrice(item);
      expect(priced.amount).toBeGreaterThan(0);
      expect(["boinglets", "sparkles"]).toContain(priced.currency);
      expect(["pet_skin", "furniture", "profile"]).toContain(item.kind);
    }
    expect(catalogItem("missing")).toBeNull();
    expect(catalogItem(CATALOG[0]!.id)?.name).toBe(CATALOG[0]!.name);
    expect(catalogPrice(catalogItem("hat-stardust")!).currency).toBe(
      "sparkles",
    );
    expect(SPARKLES_DAILY).toBe(10);
  });

  it("derives care earnings from the same Phase 1 reward table", () => {
    expect(
      careEarnings([
        { action: "hatch", created_at: 1 },
        { action: "feed", created_at: 2 },
      ]),
    ).toBe(CARE_REWARDS.hatch.boinglets + CARE_REWARDS.feed.boinglets);
  });

  it("applies a marketplace fee sink without zeroing the seller", () => {
    expect(listingFee(100)).toBe(5);
    expect(netSellerProceeds(100)).toBe(95);
    expect(netSellerProceeds(5)).toBe(4);
  });
});
