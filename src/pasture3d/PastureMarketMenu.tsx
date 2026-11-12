import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ONCHAIN_ITEMS } from "../content/onchainItems";
import { CATALOG } from "../economy";
import {
  formatMarketPriceBoing,
  isSellableItem,
  parseMarketPriceBoing,
} from "../market";
import { api, app, notice } from "../ui/appRuntime";
import { run } from "../ui/careActions";
import { economyAct } from "../ui/pages/progressPage";
import { craftItemName } from "../content/crafting";

type Listing = {
  id: string;
  seller: string;
  item_id: string;
  qty: number;
  price_boing: string | null;
  expires_at: number | null;
};

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

function marketItemName(id: string): string {
  return (
    CATALOG.find((c) => c.id === id)?.name ||
    ONCHAIN_ITEMS.find((c) => c.gameItemId === id)?.name ||
    craftItemName(id)
  );
}

function priceLabel(price: string | null): string {
  if (!price) return "Relist in testnet BOING";
  try {
    return `${formatMarketPriceBoing(price)} testnet BOING`;
  } catch {
    return `${price} testnet BOING`;
  }
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

  const sellable = inventory.filter((row) => isSellableItem(row.item_id));
  const selected = itemId || sellable[0]?.item_id || "";

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
      className="pasture-station-menu"
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
          className="quiet"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <p className="subtle">
        Browse, list, and buy in testnet BOING. This uses the live player
        market, not a second shop. The full desk is also at{" "}
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
                  {marketItemName(row.item_id)} x {row.qty}
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

      <h3 className="market-sub">Player listings</h3>
      <div className="pasture-station-list">
        {!market ? (
          <p className="small">Loading listings...</p>
        ) : !market.listings.length ? (
          <p className="small">No player listings yet.</p>
        ) : (
          market.listings.map((listing) => {
            const listingPrice = priceLabel(listing.price_boing);
            const mine = app.owner && listing.seller === app.owner;
            return (
              <article key={listing.id} className="market-card">
                <h3>{marketItemName(listing.item_id)}</h3>
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
                    className="secondary"
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
