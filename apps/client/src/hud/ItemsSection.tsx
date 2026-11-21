import { useCallback, useEffect, useState } from "react";
import {
  ITEM_CATALOG,
  InfluenceKind,
  RECIPES,
  itemDef,
  type InventoryView,
  type ItemSlug,
  type TerritoryView,
} from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";

type Props = {
  ipc: IpcClient;
  /** Territory chosen in the influence panel (gather and territory items). */
  territory: TerritoryView | null;
  /** Lineage of the selected creature (vitality potions and relics). */
  lineageId: number | null;
  ticksPerDay?: number;
};

const REFRESH_MS = 5_000;

function itemName(slug: string): string {
  return itemDef(slug)?.displayName ?? slug;
}

function recipeText(output: ItemSlug): string {
  const recipe = RECIPES.find((row) => row.output === output);
  if (!recipe) return "";
  return recipe.inputs
    .map((input) => `${input.count} ${itemName(input.slug)}`)
    .join(" + ");
}

export function spoilText(
  nextSpoilTick: number | null,
  tick: number,
  ticksPerDay = 144,
): string {
  if (nextSpoilTick == null) return "keeps";
  const days = (nextSpoilTick - tick) / ticksPerDay;
  if (days < 1) return "spoils today";
  return `spoils in ${Math.floor(days)}d`;
}

/** "2 minted" when some units of a stack exist as LPIT (creatures skip them). */
export function mintedText(entry: { count: number; minted?: number }): string {
  const minted = entry.minted ?? 0;
  if (minted <= 0) return "";
  return minted >= entry.count ? "all minted" : `${minted} minted`;
}

/**
 * M22 bag: gather here, craft, use tools and potions, honor relics. Every
 * world action is an influence (shares the 3-per-day budget); crafting is not.
 *
 * Creatures also loot, craft and use items on their own (no budget). The two
 * toggles let a keeper stop them drawing on this bag; the buttons stay for
 * doing it yourself. Minted units are never used by creatures.
 */
export function ItemsSection({
  ipc,
  territory,
  lineageId,
  ticksPerDay = 144,
}: Props) {
  const [inventory, setInventory] = useState<InventoryView | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(() => {
    ipc
      .query({ message: "query.inventory", body: {} })
      .then((result) => {
        if (result.message === "query.inventory") {
          setInventory(result.body);
          setOffline(false);
        }
      })
      .catch(() => setOffline(true));
  }, [ipc]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const after = () => setTimeout(refresh, 400);

  if (offline && inventory == null) return null;
  if (inventory == null) {
    return <p className="influence-hint">Loading your bag…</p>;
  }

  const resource = territory?.resource ?? null;
  const tick = inventory.tick;

  return (
    <section className="items-section" aria-label="Items">
      <h3 className="influence-title">Items</h3>
      {!inventory.canHoldItems ? (
        <p className="influence-hint">
          Connect a wallet to gather, craft and use items.
        </p>
      ) : (
        <>
          <div className="influence-row">
            <button
              type="button"
              className="influence-btn"
              disabled={
                territory == null || resource == null || resource.free <= 0
              }
              title={
                resource == null
                  ? "Nothing grows here"
                  : "Uses one influence. Gathering eats into the food creatures forage."
              }
              onClick={() => {
                if (territory == null) return;
                ipc.send({
                  message: "influence.submit",
                  body: {
                    kind: InfluenceKind.GATHER_RESOURCE,
                    payload: {
                      territoryId: territory.id,
                      resource: (resource?.slug ?? "") as ItemSlug,
                      units: 1,
                    },
                  },
                });
                after();
              }}
            >
              Gather here
            </button>
            <span className="items-stock">
              {resource == null
                ? "nothing to gather here"
                : `${itemName(resource.slug)} ${resource.free}/${resource.cap}`}
            </span>
          </div>

          {inventory.autonomy != null ? (
            <div className="items-autonomy" aria-label="Creature autonomy">
              <label
                className="items-toggle"
                title="Your creatures craft Rations, Calm and tools from what you gather or they find. No influence used."
              >
                <input
                  type="checkbox"
                  checked={inventory.autonomy.autoCraft}
                  onChange={(event) => {
                    ipc.send({
                      message: "item.autonomy",
                      body: { autoCraft: event.target.checked },
                    });
                    after();
                  }}
                />
                Creatures craft from my bag
              </label>
              <label
                className="items-toggle"
                title="A hungry, hurt or frightened creature eats or drinks from your bag (up to 6 a day). Minted and listed items are never used."
              >
                <input
                  type="checkbox"
                  checked={inventory.autonomy.autoUse}
                  onChange={(event) => {
                    ipc.send({
                      message: "item.autonomy",
                      body: { autoUse: event.target.checked },
                    });
                    after();
                  }}
                />
                Creatures use items from my bag
              </label>
            </div>
          ) : null}

          {inventory.items.length === 0 ? (
            <p className="influence-hint">Your bag is empty.</p>
          ) : (
            <ul className="items-list">
              {inventory.items.map((entry) => {
                const def = itemDef(entry.slug);
                const usable = def?.effect != null;
                const target =
                  def?.target === "TERRITORY" ? territory?.id : lineageId;
                return (
                  <li key={entry.slug} className="items-entry">
                    <span className="items-name" title={def?.description}>
                      {itemName(entry.slug)} ×{entry.count}
                    </span>
                    <span className="items-meta">
                      {[
                        spoilText(entry.nextSpoilTick, tick, ticksPerDay),
                        mintedText(entry),
                      ]
                        .filter((part) => part !== "")
                        .join(" · ")}
                    </span>
                    {usable ? (
                      <button
                        type="button"
                        className="influence-btn items-use"
                        disabled={target == null}
                        title={def?.description}
                        onClick={() => {
                          if (target == null || def == null) return;
                          ipc.send({
                            message: "influence.submit",
                            body: {
                              kind: InfluenceKind.USE_ITEM,
                              payload:
                                def.target === "TERRITORY"
                                  ? { item: def.slug, territoryId: target }
                                  : { item: def.slug, lineageId: target },
                            },
                          });
                          after();
                        }}
                      >
                        {def?.target === "TERRITORY"
                          ? "Use here"
                          : "Use on lineage"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="items-craft">
            {RECIPES.map((recipe) => (
              <button
                key={recipe.output}
                type="button"
                className="influence-btn"
                disabled={!inventory.craftable.includes(recipe.output)}
                title={itemDef(recipe.output)?.description}
                onClick={() => {
                  ipc.send({
                    message: "item.craft",
                    body: { output: recipe.output },
                  });
                  after();
                }}
              >
                Craft {itemName(recipe.output)}
                <span className="items-recipe">
                  {recipeText(recipe.output)}
                </span>
              </button>
            ))}
          </div>

          {inventory.relics.length > 0 ? (
            <ul className="items-list">
              {inventory.relics.map((relic) => {
                const waiting =
                  relic.usableAtMs != null && relic.usableAtMs > Date.now();
                return (
                  <li
                    key={`${relic.slug}:${relic.lineageId}`}
                    className="items-entry"
                  >
                    <span className="items-name">
                      {itemName(relic.slug)} · lineage #{relic.lineageId}
                    </span>
                    <button
                      type="button"
                      className="influence-btn items-use"
                      disabled={waiting}
                      title="+25 favor for its lineage, once a week"
                      onClick={() => {
                        ipc.send({
                          message: "influence.submit",
                          body: {
                            kind: InfluenceKind.USE_ITEM,
                            payload: {
                              item: relic.slug,
                              lineageId: relic.lineageId,
                            },
                          },
                        });
                        after();
                      }}
                    >
                      {waiting ? "Honored this week" : "Honor (+25 favor)"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Catalog order for any UI that lists every item kind. */
export const ITEM_ORDER = ITEM_CATALOG.map((def) => def.slug);
