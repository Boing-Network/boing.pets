import { describe, expect, it } from "vitest";
import {
  BAG_EMPTY_COPY,
  COLLECTION_EMPTY_COPY,
  LEADERBOARD_EMPTY_COPY,
  MARKET_EMPTY_COPY,
  bagEmptyCopy,
  skeletonClass,
  skeletonHtml,
} from "../src/ui/emptyStates";

describe("empty states and skeletons", () => {
  it("points an empty bag pocket at the place to get those items", () => {
    expect(bagEmptyCopy("items", false).title).toContain("Connect");
    expect(bagEmptyCopy("items", true).hint).toContain("Market Stall");
    expect(BAG_EMPTY_COPY.crops.hint).toContain("Garden Beds");
    expect(BAG_EMPTY_COPY.fish.hint).toContain("Pond Pier");
    expect(BAG_EMPTY_COPY.recipes.hint).toContain("Pasture Kitchen");
  });

  it("points empty market, collection, and leaderboard views at a next step", () => {
    expect(MARKET_EMPTY_COPY.none).toContain("bag");
    expect(MARKET_EMPTY_COPY.filters).toContain("Clear");
    expect(COLLECTION_EMPTY_COPY).toContain("pasture");
    expect(LEADERBOARD_EMPTY_COPY).toContain("Race Track");
    expect(LEADERBOARD_EMPTY_COPY).toContain("Pond Pier");
  });

  it("renders labeled skeleton placeholders for each panel", () => {
    const bag = skeletonHtml("bag-row", 4, "Loading bag");
    expect(bag).toContain('aria-label="Loading bag"');
    expect(bag.match(/ui-skeleton-row/g)?.length).toBe(4);
    expect(
      skeletonHtml("market-card", 3).match(/ui-skeleton-card/g)?.length,
    ).toBe(3);
    expect(skeletonHtml("collection-tile", 8)).toContain("collection-grid");
    expect(
      skeletonHtml("collection-tile", 8).match(/ui-skeleton-tile/g)?.length,
    ).toBe(8);
    expect(skeletonClass("leaderboard-card")).toContain("ui-skeleton-board");
    expect(
      skeletonHtml("leaderboard-card", 2).match(/ui-skeleton-board/g)?.length,
    ).toBe(2);
  });
});
