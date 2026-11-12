import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { itemDisplayName, itemRarity } from "../content/items";
import {
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
  MARKET_CATEGORIES,
  MARKET_CATEGORY_LABELS,
  type ItemRarity,
} from "../content/rarities";
import {
  formatMarketPriceBoing,
  isSellableItem,
  parseMarketPriceBoing,
} from "../market";
import {
  MARKET_SORT_LABELS,
  MARKET_SORTS,
  emptyMarketFilters,
  filterMarketListings,
  marketFiltersAreActive,
  type MarketFilterQuery,
  type MarketListingView,
} from "../marketFilters";
import { api, app, notice } from "../ui/appRuntime";
import { run } from "../ui/careActions";
import { economyAct } from "../ui/pages/progressPage";

type Listing = MarketListingView;

type Payout = {
  id: string;
  listing_id: string;
  kind: string;
  amount_boing: string;
  status: string;
  payout_tx: string | null;
  tx_url: string | null;
  last_error: string | null;
  updated_at: number;
};

type MarketPayload = {
  listings: Listing[];
  payouts?: Payout[];
  rules?: {
    feeBps: number;
    minPriceBoing: string;
    maxOpenListings?: number;
    settlement?: string;
  };
  writesEnabled?: boolean;
  gasReserve?: {
    ok: boolean;
    surplusBoing: string;
    requiredBoing: string;
    pendingLegs: number;
    floorBoing: string;
  };
};

type InventoryRow = { item_id: string; qty: number };

function priceLabel(price: string | null): string {
  if (!price) return "Relist in testnet BOING";
  try {
    return `${formatMarketPriceBoing(price)} testnet BOING`;
  } catch {
    return `${price} testnet BOING`;
  }
}

function rarityClass(id: string): string {
  const rarity = itemRarity(id);
  return rarity ? `rarity-badge rarity-${rarity}` : "rarity-badge";
}

export function PastureMarketMenu({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [market, setMarket] = useState<MarketPayload | null>(null);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [price, setPrice] = useState("0.1");
  const [qty, setQty] = useState("1");
  const [itemId, setItemId] = useState("");
  const [filters, setFilters] = useState<MarketFilterQuery>(emptyMarketFilters);
  const [buyerBalanceBoing, setBuyerBalanceBoing] = useState<string | null>(
    null,
  );

  const reload = useCallback(async () => {
    const desk = await api<MarketPayload>(
      "/api/marketplace" + (app.owner ? `?owner=${app.owner}` : ""),
    );
    setMarket(desk);
    if (!app.owner) {
      setInventory([]);
      return;
    }
    const bal = await api<{ inventory: InventoryRow[] }>(
      "/api/economy/balance?owner=" + app.owner,
    );
    setInventory(bal.inventory);
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Could not load the market",
      );
    });
    closeRef.current?.focus();
  }, [reload]);

  useEffect(() => {
    if (!app.owner || !app.provider) {
      setBuyerBalanceBoing(null);
      return;
    }
    let cancelled = false;
    void app.provider
      .request({ method: "boing_getBalance", params: [app.owner] })
      .then((value: unknown) => {
        if (cancelled) return;
        const raw =
          typeof value === "string"
            ? value
            : value && typeof value === "object" && "balance" in value
              ? String((value as { balance: unknown }).balance)
              : "";
        setBuyerBalanceBoing(raw || null);
      })
      .catch(() => {
        if (!cancelled) setBuyerBalanceBoing(null);
      });
    return () => {
      cancelled = true;
    };
  }, [app.owner]);

  const sellable = inventory.filter((row) => isSellableItem(row.item_id));
  const selected = itemId || sellable[0]?.item_id || "";

  const visibleListings = useMemo(() => {
    const rows = market?.listings || [];
    return filterMarketListings(rows, {
      ...filters,
      owner: app.owner,
      buyerBalanceBoing,
    });
  }, [market, filters, buyerBalanceBoing]);

  const updateFilter = <K extends keyof MarketFilterQuery>(
    key: K,
    value: MarketFilterQuery[K],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const act = (kind: string, extra: Record<string, unknown>, done: string) => {
    setError(null);
    setFlash(null);
    void run(async () => {
      await economyAct(kind, extra);
      await reload();
      setFlash(done);
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Market action failed";
      setError(msg);
      notice(msg, true);
    });
  };

  const paused =
    market?.writesEnabled === false || market?.gasReserve?.ok === false;

  return (
    <div
      className="pasture-station-menu market-station-menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="pasture-station-menu-head">
        <div>
          <p className="eyebrow">PASTURE STATION</p>
          <h2 id={titleId}>Market Stall</h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="quiet pasture-station-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <p className="subtle">
        Browse and trade in testnet BOING. Full desk also at{" "}
        <a href="/market.html">/market</a>.
      </p>
      {flash ? (
        <p className="pasture-station-flash" role="status">
          {flash}
        </p>
      ) : null}
      {error ? (
        <p className="pasture-station-error" role="alert">
          {error}
        </p>
      ) : null}
      {market?.gasReserve && !market.gasReserve.ok ? (
        <p className="small">
          Purchases are paused while the operator gas reserve is low.
        </p>
      ) : null}
      {market?.rules ? (
        <p className="small">
          Minimum listing {market.rules.minPriceBoing} testnet BOING.{" "}
          {market.rules.feeBps / 100}% sinks to the pasture treasury.
        </p>
      ) : null}

      <h3 className="market-sub">Player listings</h3>
      <form
        className="market-filters"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="market-filter-search">
          Search
          <input
            type="search"
            placeholder="Name or item id"
            value={filters.q || ""}
            onChange={(event) => updateFilter("q", event.target.value)}
          />
        </label>
        <label>
          Category
          <select
            value={filters.category || ""}
            onChange={(event) =>
              updateFilter(
                "category",
                event.target.value as MarketFilterQuery["category"],
              )
            }
          >
            <option value="">All categories</option>
            {MARKET_CATEGORIES.map((id) => (
              <option key={id} value={id}>
                {MARKET_CATEGORY_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rarity
          <select
            value={filters.rarity || ""}
            onChange={(event) =>
              updateFilter(
                "rarity",
                event.target.value as MarketFilterQuery["rarity"],
              )
            }
          >
            <option value="">All rarities</option>
            {ITEM_RARITIES.map((id) => (
              <option key={id} value={id}>
                {ITEM_RARITY_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Min price
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.1"
            value={filters.minPriceBoing || ""}
            onChange={(event) =>
              updateFilter("minPriceBoing", event.target.value)
            }
          />
        </label>
        <label>
          Max price
          <input
            type="text"
            inputMode="decimal"
            placeholder="100"
            value={filters.maxPriceBoing || ""}
            onChange={(event) =>
              updateFilter("maxPriceBoing", event.target.value)
            }
          />
        </label>
        <label>
          Sort
          <select
            value={filters.sort || "newest"}
            onChange={(event) =>
              updateFilter(
                "sort",
                event.target.value as MarketFilterQuery["sort"],
              )
            }
          >
            {MARKET_SORTS.map((id) => (
              <option key={id} value={id}>
                {MARKET_SORT_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Min qty
          <input
            type="number"
            min={0}
            max={20}
            placeholder="Any"
            value={filters.minQty ?? ""}
            onChange={(event) =>
              updateFilter(
                "minQty",
                event.target.value === "" ? "" : Number(event.target.value),
              )
            }
          />
        </label>
        <label className="market-filter-check">
          <input
            type="checkbox"
            checked={!!filters.mine}
            onChange={(event) => updateFilter("mine", event.target.checked)}
          />{" "}
          My listings
        </label>
        <label className="market-filter-check">
          <input
            type="checkbox"
            checked={!!filters.affordable}
            disabled={!buyerBalanceBoing}
            onChange={(event) =>
              updateFilter("affordable", event.target.checked)
            }
          />{" "}
          I can afford
        </label>
        <button
          type="button"
          className="quiet"
          onClick={() => setFilters(emptyMarketFilters())}
        >
          Clear filters
        </button>
      </form>
      <p className="small market-filter-status">
        {!market
          ? "Loading listings..."
          : visibleListings.length
            ? `${visibleListings.length} listing${visibleListings.length === 1 ? "" : "s"} shown`
            : marketFiltersAreActive(filters)
              ? "No listings match these filters."
              : "No player listings yet."}
      </p>
      <div className="pasture-station-list">
        {!market ? null : !visibleListings.length ? (
          <p className="small market-empty-state">
            {marketFiltersAreActive(filters)
              ? "Try clearing a filter or searching a different name."
              : "When players list resources or cosmetics, they will show up here."}
          </p>
        ) : (
          visibleListings.map((listing) => {
            const listingPrice = priceLabel(listing.price_boing);
            const mine = app.owner && listing.seller === app.owner;
            const rarity = (listing.rarity ||
              itemRarity(listing.item_id)) as ItemRarity | null;
            return (
              <article key={listing.id} className="market-card">
                <div className="market-card-top">
                  <h3>{listing.name || itemDisplayName(listing.item_id)}</h3>
                  {rarity ? (
                    <span className={rarityClass(listing.item_id)}>
                      {ITEM_RARITY_LABELS[rarity]}
                    </span>
                  ) : null}
                </div>
                <p className="subtle">
                  {listing.qty}x {listingPrice}
                </p>
                <p className="small">
                  {listing.seller.slice(0, 10)}...{" "}
                  {listing.expires_at
                    ? `Expires ${new Date(listing.expires_at).toLocaleDateString()}`
                    : "No expiry"}
                </p>
                {mine ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      act(
                        "cancel_listing",
                        { listing_id: listing.id },
                        "Listing canceled.",
                      )
                    }
                  >
                    Cancel / sign
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!app.owner || !listing.price_boing || paused}
                    onClick={() =>
                      act(
                        "buy_listing",
                        { listing_id: listing.id },
                        "Purchase submitted.",
                      )
                    }
                  >
                    {listing.price_boing
                      ? "Buy listing / pay BOING"
                      : "Relist required"}
                  </button>
                )}
              </article>
            );
          })
        )}
      </div>

      <h3 className="market-sub">List an item</h3>
      <form
        className="market-list-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!selected) return;
          try {
            parseMarketPriceBoing(price);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Invalid price";
            setError(msg);
            return;
          }
          act(
            "list",
            { item_id: selected, qty: Number(qty || "1"), price_boing: price },
            "Listed on the market.",
          );
        }}
      >
        <label>
          Item
          <select
            value={selected}
            onChange={(event) => setItemId(event.target.value)}
            disabled={!app.owner || !sellable.length}
          >
            {sellable.length ? (
              sellable.map((row) => (
                <option key={row.item_id} value={row.item_id}>
                  {itemDisplayName(row.item_id)} x {row.qty}
                </option>
              ))
            ) : (
              <option value="">
                {app.owner
                  ? "No sellable items in inventory"
                  : "Connect to list an item"}
              </option>
            )}
          </select>
        </label>
        <label>
          Qty
          <input
            type="number"
            min={1}
            max={20}
            value={qty}
            onChange={(event) => setQty(event.target.value)}
          />
        </label>
        <label>
          Price (testnet BOING)
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.1"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        <button type="submit" disabled={!app.owner || !sellable.length}>
          List / sign
        </button>
      </form>

      <h3 className="market-sub">Your payouts</h3>
      <div className="pasture-station-list">
        {!app.owner ? (
          <p className="small">Connect to see payout status.</p>
        ) : !(market?.payouts || []).length ? (
          <p className="small">No payouts yet.</p>
        ) : (
          (market?.payouts || []).map((row) => (
            <article key={row.id} className="market-card">
              <h3>{row.kind}</h3>
              <p className="subtle">
                {row.amount_boing} testnet BOING / {row.status}
              </p>
              {row.tx_url ? (
                <p className="small">
                  <a href={row.tx_url} target="_blank" rel="noreferrer">
                    View payout
                  </a>
                </p>
              ) : null}
              {row.last_error ? (
                <p className="small">{row.last_error}</p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
