import { describe, expect, it } from "vitest";
import { parseBoing } from "@boing-network/boing-sdk";
import {
  emptyMarketFilters,
  filterMarketListings,
  marketFilterQueryString,
  marketFiltersAreActive,
  marketFiltersFromSearchParams,
  type MarketListingView,
} from "../src/marketFilters";
import {
  itemGuide,
  itemMarketCategory,
  itemRarity,
} from "../src/content/items";
import { isSellableItem } from "../src/market";
import { ONCHAIN_RESERVED_ITEM_IDS } from "../src/content/onchainItems";

function listing(
  partial: Partial<MarketListingView> & { id: string; item_id: string },
): MarketListingView {
  return {
    seller: "0x" + "aa".repeat(32),
    qty: 1,
    price_boing: parseBoing("0.2").toString(),
    expires_at: 1_000,
    created_at: 100,
    ...partial,
  };
}

const listings: MarketListingView[] = [
  listing({
    id: "a",
    item_id: "ore-pebble",
    price_boing: parseBoing("0.2").toString(),
    created_at: 100,
    expires_at: 5_000,
    qty: 2,
  }),
  listing({
    id: "b",
    item_id: "hat-stardust",
    price_boing: parseBoing("1.5").toString(),
    created_at: 300,
    expires_at: 9_000,
    qty: 1,
    seller: "0x" + "bb".repeat(32),
  }),
  listing({
    id: "c",
    item_id: "fish-starfin",
    price_boing: parseBoing("0.4").toString(),
    created_at: 200,
    expires_at: 2_000,
    qty: 4,
  }),
  listing({
    id: "d",
    item_id: "furn-lantern",
    price_boing: parseBoing("0.8").toString(),
    created_at: 250,
    expires_at: 8_000,
    qty: 1,
  }),
];

describe("market listing filters", () => {
  it("searches by name and item id, case-insensitive", () => {
    const byName = filterMarketListings(listings, { q: "pasture pebble" });
    expect(byName.map((row) => row.id)).toEqual(["a"]);
    const byId = filterMarketListings(listings, { q: "HAT-STARDUST" });
    expect(byId.map((row) => row.id)).toEqual(["b"]);
  });

  it("filters by category and by rarity", () => {
    expect(
      filterMarketListings(listings, { category: "ores" }).map((row) => row.id),
    ).toEqual(["a"]);
    expect(
      filterMarketListings(listings, { category: "furniture" }).map(
        (row) => row.id,
      ),
    ).toEqual(["d"]);
    expect(
      filterMarketListings(listings, { rarity: "legendary" }).map(
        (row) => row.id,
      ),
    ).toEqual(["b"]);
    expect(
      filterMarketListings(listings, { rarity: "epic" }).map((row) => row.id),
    ).toEqual(["c"]);
  });

  it("filters by price range, quantity, and affordability", () => {
    expect(
      filterMarketListings(listings, {
        minPriceBoing: "0.5",
        maxPriceBoing: "1",
      }).map((row) => row.id),
    ).toEqual(["d"]);
    expect(
      filterMarketListings(listings, { minQty: 3 }).map((row) => row.id),
    ).toEqual(["c"]);
    const affordable = filterMarketListings(listings, {
      affordable: true,
      buyerBalanceBoing: "0.4",
    });
    expect(affordable.map((row) => row.id).sort()).toEqual(["a", "c"]);
  });

  it("sorts by newest, ending soon, price, and name", () => {
    expect(
      filterMarketListings(listings, { sort: "newest" }).map((row) => row.id),
    ).toEqual(["b", "d", "c", "a"]);
    expect(
      filterMarketListings(listings, { sort: "ending" }).map((row) => row.id),
    ).toEqual(["c", "a", "d", "b"]);
    expect(
      filterMarketListings(listings, { sort: "price-asc" }).map(
        (row) => row.id,
      ),
    ).toEqual(["a", "c", "d", "b"]);
    expect(
      filterMarketListings(listings, { sort: "price-desc" }).map(
        (row) => row.id,
      ),
    ).toEqual(["b", "d", "c", "a"]);
    expect(
      filterMarketListings(listings, { sort: "name" }).map(
        (row) => row.item_id,
      ),
    ).toEqual(["furn-lantern", "ore-pebble", "hat-stardust", "fish-starfin"]);
  });

  it("returns an empty list when nothing matches and tracks active filters", () => {
    const none = filterMarketListings(listings, {
      q: "no-such-item",
      category: "food",
    });
    expect(none).toEqual([]);
    expect(marketFiltersAreActive(emptyMarketFilters())).toBe(false);
    expect(marketFiltersAreActive({ q: "koi" })).toBe(true);
  });

  it("limits to the caller's own listings", () => {
    const owner = "0x" + "bb".repeat(32);
    expect(
      filterMarketListings(listings, { mine: true, owner }).map(
        (row) => row.id,
      ),
    ).toEqual(["b"]);
  });

  it("round-trips filter query params", () => {
    const qs = marketFilterQueryString(
      {
        q: "ember",
        category: "ores",
        rarity: "rare",
        minPriceBoing: "0.1",
        sort: "price-asc",
        mine: true,
        minQty: 2,
      },
      "0xabc",
    );
    const parsed = marketFiltersFromSearchParams(
      new URLSearchParams(qs.slice(1)),
    );
    expect(parsed.q).toBe("ember");
    expect(parsed.category).toBe("ores");
    expect(parsed.rarity).toBe("rare");
    expect(parsed.sort).toBe("price-asc");
    expect(parsed.mine).toBe(true);
    expect(parsed.minQty).toBe(2);
  });
});

describe("item guide membership", () => {
  it("assigns a rarity and market category to every mapped item", () => {
    const rows = itemGuide().filter((row) => row.onChain);
    expect(rows.length).toBe(38);
    for (const row of rows) {
      expect(row.rarity).toBeTruthy();
      expect(row.category).toBeTruthy();
      expect(row.itemId).toBeGreaterThan(0);
    }
    expect(itemMarketCategory("ore-emberite")).toBe("ores");
    expect(itemRarity("ore-aetherite")).toBe("epic");
    expect(itemRarity("hat-stardust")).toBe("legendary");
    expect(itemMarketCategory("furn-lantern")).toBe("furniture");
    expect(itemMarketCategory("hat-leaf")).toBe("cosmetics");
  });

  it("keeps reserved ids off the market and off the on-chain map", () => {
    for (const reserved of ONCHAIN_RESERVED_ITEM_IDS) {
      expect(isSellableItem(reserved.gameItemId)).toBe(false);
      const row = itemGuide().find(
        (item) => item.gameItemId === reserved.gameItemId,
      );
      expect(row?.onChain).toBe(false);
      expect(row?.sellable).toBe(false);
    }
    expect(isSellableItem("ore-emberite")).toBe(true);
    expect(isSellableItem("hat-comet")).toBe(true);
    expect(isSellableItem("tool-pick-aether")).toBe(true);
    expect(isSellableItem("tool-pick-wood")).toBe(false);
  });
});
