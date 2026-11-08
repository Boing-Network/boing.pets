import { describe, expect, it } from "vitest";
import { CARE_REWARDS } from "../src/core";
import {
  careEarnings,
  catalogItem,
  CATALOG,
  listingFee,
  netSellerProceeds,
} from "../src/economy";

describe("economy foundation", () => {
  it("keeps a cosmetics-only catalog with positive prices", () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(3);
    for (const item of CATALOG) {
      expect(item.priceBoinglets).toBeGreaterThan(0);
      expect(["pet_skin", "furniture", "profile"]).toContain(item.kind);
    }
    expect(catalogItem("missing")).toBeNull();
    expect(catalogItem(CATALOG[0].id)?.name).toBe(CATALOG[0].name);
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
