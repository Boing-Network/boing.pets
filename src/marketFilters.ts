/** Pure marketplace listing filters, shared by the stall, /market, and the API. */

import { parseBoing } from "@boing-network/boing-sdk";
import {
  itemDisplayName,
  itemMarketCategory,
  itemRarity,
} from "./content/items";
import {
  type ItemRarity,
  type MarketCategory,
  isItemRarity,
  isMarketCategory,
} from "./content/rarities";

export const MARKET_SORTS = [
  "newest",
  "ending",
  "price-asc",
  "price-desc",
  "name",
] as const;

export type MarketSort = (typeof MARKET_SORTS)[number];

export function isMarketSort(value: unknown): value is MarketSort {
  return (
    typeof value === "string" &&
    (MARKET_SORTS as readonly string[]).includes(value)
  );
}

export const MARKET_SORT_LABELS: Record<MarketSort, string> = {
  newest: "Newest",
  ending: "Ending soon",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  name: "Name",
};

export type MarketListingView = {
  id: string;
  seller: string;
  item_id: string;
  qty: number;
  price_boing: string | null;
  expires_at: number | null;
  created_at?: number | null;
  name?: string;
  category?: MarketCategory | null;
  rarity?: ItemRarity | null;
};

export type MarketFilterQuery = {
  q?: string;
  category?: MarketCategory | "";
  rarity?: ItemRarity | "";
  minPriceBoing?: string;
  maxPriceBoing?: string;
  sort?: MarketSort;
  mine?: boolean;
  owner?: string | null;
  affordable?: boolean;
  buyerBalanceBoing?: string | null;
  minQty?: number | "";
};

export type ParsedMarketFilters = {
  q: string;
  category: MarketCategory | "";
  rarity: ItemRarity | "";
  minPrice: bigint | null;
  maxPrice: bigint | null;
  sort: MarketSort;
  mine: boolean;
  owner: string | null;
  affordable: boolean;
  buyerBalance: bigint | null;
  minQty: number;
};

function parseOptionalBoing(text: string | undefined | null): bigint | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  try {
    return parseBoing(raw);
  } catch {
    return null;
  }
}

export function parseMarketFilters(
  input: MarketFilterQuery,
): ParsedMarketFilters {
  const minQtyRaw = input.minQty;
  const minQty =
    typeof minQtyRaw === "number" && Number.isSafeInteger(minQtyRaw)
      ? Math.max(0, minQtyRaw)
      : Number.isFinite(Number(minQtyRaw)) && String(minQtyRaw) !== ""
        ? Math.max(0, Math.floor(Number(minQtyRaw)))
        : 0;
  return {
    q: String(input.q ?? "")
      .trim()
      .toLowerCase(),
    category: isMarketCategory(input.category) ? input.category : "",
    rarity: isItemRarity(input.rarity) ? input.rarity : "",
    minPrice: parseOptionalBoing(input.minPriceBoing),
    maxPrice: parseOptionalBoing(input.maxPriceBoing),
    sort: isMarketSort(input.sort) ? input.sort : "newest",
    mine: !!input.mine,
    owner: input.owner ? String(input.owner).toLowerCase() : null,
    affordable: !!input.affordable,
    buyerBalance: parseOptionalBoing(input.buyerBalanceBoing),
    minQty,
  };
}

export function enrichMarketListing(
  listing: MarketListingView,
): MarketListingView {
  return {
    ...listing,
    name: listing.name || itemDisplayName(listing.item_id),
    category: listing.category ?? itemMarketCategory(listing.item_id),
    rarity: listing.rarity ?? itemRarity(listing.item_id),
  };
}

function priceOf(listing: MarketListingView): bigint | null {
  if (!listing.price_boing) return null;
  try {
    return BigInt(listing.price_boing);
  } catch {
    return parseOptionalBoing(listing.price_boing);
  }
}

export function listingMatchesFilters(
  listing: MarketListingView,
  filters: ParsedMarketFilters,
): boolean {
  const row = enrichMarketListing(listing);
  if (filters.q) {
    const hay = `${row.name} ${row.item_id}`.toLowerCase();
    if (!hay.includes(filters.q)) return false;
  }
  if (filters.category && row.category !== filters.category) return false;
  if (filters.rarity && row.rarity !== filters.rarity) return false;
  const price = priceOf(row);
  if (filters.minPrice !== null && (price === null || price < filters.minPrice))
    return false;
  if (filters.maxPrice !== null && (price === null || price > filters.maxPrice))
    return false;
  if (filters.mine) {
    if (!filters.owner || row.seller.toLowerCase() !== filters.owner)
      return false;
  }
  if (filters.affordable) {
    if (filters.buyerBalance === null || price === null) return false;
    if (price > filters.buyerBalance) return false;
  }
  if (filters.minQty > 0 && row.qty < filters.minQty) return false;
  return true;
}

function createdAt(listing: MarketListingView): number {
  return listing.created_at ?? 0;
}

function compareListings(
  a: MarketListingView,
  b: MarketListingView,
  sort: MarketSort,
): number {
  const pa = priceOf(a);
  const pb = priceOf(b);
  const na = (a.name || itemDisplayName(a.item_id)).toLowerCase();
  const nb = (b.name || itemDisplayName(b.item_id)).toLowerCase();
  if (sort === "price-asc") {
    if (pa === null && pb === null) return na.localeCompare(nb);
    if (pa === null) return 1;
    if (pb === null) return -1;
    if (pa === pb) return na.localeCompare(nb);
    return pa < pb ? -1 : 1;
  }
  if (sort === "price-desc") {
    if (pa === null && pb === null) return na.localeCompare(nb);
    if (pa === null) return 1;
    if (pb === null) return -1;
    if (pa === pb) return na.localeCompare(nb);
    return pa > pb ? -1 : 1;
  }
  if (sort === "name") return na.localeCompare(nb) || b.id.localeCompare(a.id);
  if (sort === "ending") {
    const ea = a.expires_at ?? Number.MAX_SAFE_INTEGER;
    const eb = b.expires_at ?? Number.MAX_SAFE_INTEGER;
    if (ea !== eb) return ea - eb;
    return createdAt(b) - createdAt(a);
  }
  const ca = createdAt(a);
  const cb = createdAt(b);
  if (ca !== cb) return cb - ca;
  return b.id.localeCompare(a.id);
}

export function filterMarketListings<T extends MarketListingView>(
  listings: readonly T[],
  input: MarketFilterQuery,
): Array<T & MarketListingView> {
  const filters = parseMarketFilters(input);
  return listings
    .map((listing) => enrichMarketListing(listing) as T & MarketListingView)
    .filter((listing) => listingMatchesFilters(listing, filters))
    .sort((a, b) => compareListings(a, b, filters.sort));
}

export function emptyMarketFilters(): MarketFilterQuery {
  return {
    q: "",
    category: "",
    rarity: "",
    minPriceBoing: "",
    maxPriceBoing: "",
    sort: "newest",
    mine: false,
    affordable: false,
    minQty: "",
  };
}

export function marketFiltersAreActive(input: MarketFilterQuery): boolean {
  const filters = parseMarketFilters(input);
  return !!(
    filters.q ||
    filters.category ||
    filters.rarity ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.mine ||
    filters.affordable ||
    filters.minQty > 0 ||
    (filters.sort && filters.sort !== "newest")
  );
}

export function marketFilterQueryString(
  input: MarketFilterQuery,
  owner?: string | null,
): string {
  const filters = parseMarketFilters({ ...input, owner: input.owner ?? owner });
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.rarity) params.set("rarity", filters.rarity);
  if (input.minPriceBoing?.trim())
    params.set("min_price", input.minPriceBoing.trim());
  if (input.maxPriceBoing?.trim())
    params.set("max_price", input.maxPriceBoing.trim());
  if (filters.sort && filters.sort !== "newest")
    params.set("sort", filters.sort);
  if (filters.mine) params.set("mine", "1");
  if (filters.affordable) params.set("affordable", "1");
  if (filters.minQty > 0) params.set("min_qty", String(filters.minQty));
  if (filters.owner) params.set("owner", filters.owner);
  if (input.buyerBalanceBoing)
    params.set("buyer_balance", input.buyerBalanceBoing);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function marketFiltersFromSearchParams(
  params: URLSearchParams,
): MarketFilterQuery {
  const mine = params.get("mine");
  const affordable = params.get("affordable");
  const minQty = params.get("min_qty");
  return {
    q: params.get("q") || "",
    category: isMarketCategory(params.get("category"))
      ? (params.get("category") as MarketCategory)
      : "",
    rarity: isItemRarity(params.get("rarity"))
      ? (params.get("rarity") as ItemRarity)
      : "",
    minPriceBoing: params.get("min_price") || "",
    maxPriceBoing: params.get("max_price") || "",
    sort: isMarketSort(params.get("sort"))
      ? (params.get("sort") as MarketSort)
      : "newest",
    mine: mine === "1" || mine === "true",
    affordable: affordable === "1" || affordable === "true",
    buyerBalanceBoing: params.get("buyer_balance") || "",
    minQty: minQty ? Number(minQty) : "",
    owner: params.get("owner") || "",
  };
}
