import { useCallback, useEffect, useState } from "react";
import { itemIconSvg } from "../ui/itemIcons";
import { api, app } from "../ui/appRuntime";
import { run } from "../ui/careActions";
import { economyAct } from "../ui/pages/progressPage";
import {
  buildInventoryEntries,
  entriesForTab,
  INVENTORY_TABS,
  PASTURE_INVENTORY_LIST_PRICE,
  type InventoryEntry,
  type InventoryRow,
  type InventoryTab,
  type InventoryUseArea,
} from "./inventoryPanel";

export function PastureInventory({
  owner,
  open,
  onToggle,
  onUseArea,
}: {
  owner: string | null;
  open: boolean;
  onToggle: () => void;
  onUseArea: (area: InventoryUseArea) => void;
}) {
  const [tab, setTab] = useState<InventoryTab>("items");
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!owner) {
      setEntries(buildInventoryEntries([]));
      setError("Connect Boing Express to see your bag.");
      return;
    }
    try {
      const bal = await api<{ inventory: InventoryRow[] }>(
        "/api/economy/balance?owner=" + owner,
      );
      setEntries(buildInventoryEntries(bal.inventory || []));
      setError(null);
    } catch (err) {
      setEntries(buildInventoryEntries([]));
      setError(err instanceof Error ? err.message : "Bag unavailable.");
    }
  }, [owner]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const visible = entriesForTab(entries, tab);

  const sell = (entry: InventoryEntry) => {
    void run(async () => {
      await economyAct("list", {
        item_id: entry.id,
        qty: 1,
        price_boing: PASTURE_INVENTORY_LIST_PRICE,
      });
      await reload();
      setFlash(
        `Listed 1 ${entry.name} for ${PASTURE_INVENTORY_LIST_PRICE} BOING.`,
      );
    });
  };

  return (
    <>
      <button
        type="button"
        className="pasture-inventory-btn"
        data-hud="inventory"
        aria-expanded={open}
        aria-controls="pasture-inventory-panel"
        onClick={onToggle}
      >
        Bag
      </button>
      {open ? (
        <div
          id="pasture-inventory-panel"
          className="pasture-inventory-panel"
          role="dialog"
          aria-label="Your bag"
        >
          <div className="pasture-inventory-head">
            <div>
              <p className="eyebrow">YOUR BAG</p>
              <h2>Items, crops, fish, recipes</h2>
            </div>
            <button type="button" className="quiet" onClick={onToggle}>
              Close
            </button>
          </div>
          {error ? <p className="pasture-inventory-error">{error}</p> : null}
          {flash ? <p className="pasture-inventory-flash">{flash}</p> : null}
          <div className="pasture-inventory-tabs" role="tablist">
            {INVENTORY_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "is-active" : ""}
                onClick={() => setTab(id)}
              >
                {id === "items"
                  ? "Items"
                  : id === "crops"
                    ? "Crops"
                    : id === "fish"
                      ? "Fish"
                      : "Recipes"}
              </button>
            ))}
          </div>
          <ul className="pasture-inventory-list">
            {visible.length === 0 ? (
              <li className="pasture-inventory-empty">
                {owner
                  ? "Nothing in this pocket yet."
                  : "Connect to load your bag."}
              </li>
            ) : (
              visible.map((entry) => (
                <li key={entry.id} className="pasture-inventory-row">
                  <span
                    className="pasture-inventory-icon"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{
                      __html: itemIconSvg(entry.iconId),
                    }}
                  />
                  <div className="pasture-inventory-copy">
                    <strong>{entry.name}</strong>
                    <span>
                      {entry.tab === "recipes"
                        ? entry.ready
                          ? "Ready to cook"
                          : "Need ingredients"
                        : `x${entry.qty}`}
                    </span>
                  </div>
                  <div className="pasture-inventory-actions">
                    {entry.useArea ? (
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => onUseArea(entry.useArea!)}
                      >
                        Use
                      </button>
                    ) : null}
                    {entry.sellable ? (
                      <button
                        type="button"
                        className="quiet"
                        disabled={!app.owner}
                        onClick={() => sell(entry)}
                      >
                        Sell
                      </button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </>
  );
}
