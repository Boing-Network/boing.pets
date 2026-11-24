import { useCallback, useEffect, useState } from "react";
import {
  ITEM_CATALOG,
  InfluenceKind,
  itemDef,
  type InventoryView,
  type ItemSlug,
  type TerritoryView,
  type UseItemPayload,
} from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";
import {
  RECIPE_GROUPS,
  ingredientText,
  madeItems,
  materialRows,
  recipeRows,
  useAction,
} from "./workshop";

type Props = {
  ipc: IpcClient;
  /** Territory chosen in the influence panel (gather and territory items). */
  territory: TerritoryView | null;
  /** The selected creature: potions and tonics are given to it. */
  creature: { id: number; name: string; lineageId: number } | null;
  /** Territory names by slug, to say where a material grows. */
  territoryNames: Readonly<Record<string, string>>;
  ticksPerDay?: number;
};

const REFRESH_MS = 5_000;

function itemName(slug: string): string {
  return itemDef(slug)?.displayName ?? slug;
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
 * The workshop. Creatures find materials on their own while they forage (and
 * keep finding them while the player is away); here the player turns those
 * into food, potions, tools and tonics by hand, and gives them out.
 *
 * Crafting is free. Gathering by hand and using an item are world actions
 * and share the 3-per-day influence budget.
 */
export function ItemsSection({
  ipc,
  territory,
  creature,
  territoryNames,
  ticksPerDay = 144,
}: Props) {
  const [inventory, setInventory] = useState<InventoryView | null>(null);
  const [offline, setOffline] = useState(false);
  const [made, setMade] = useState<string | null>(null);

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
    return <p className="influence-hint">Opening the workshop…</p>;
  }

  const resource = territory?.resource ?? null;
  const tick = inventory.tick;
  const canCraft = inventory.canHoldItems;
  const materials = materialRows(inventory.items);
  const recipes = recipeRows(inventory.items);
  const crafted = madeItems(inventory.items);
  const where = (slugs: readonly string[]) =>
    slugs.map((slug) => territoryNames[slug] ?? slug).join(" and ");

  const use = (payload: UseItemPayload) => {
    ipc.send({
      message: "influence.submit",
      body: { kind: InfluenceKind.USE_ITEM, payload },
    });
    after();
  };

  return (
    <section className="items-section" aria-label="Workshop">
      <h3 className="influence-title">Workshop</h3>
      <p className="influence-hint">
        Your creatures bring back materials as they forage, even while you are
        away. Craft them into food, potions and tonics here.
      </p>
      {!canCraft ? (
        <p className="influence-reason">
          Sign in with Boing to keep a bag and craft. The recipe book is below.
        </p>
      ) : null}

      <ul className="workshop-materials" aria-label="Materials">
        {materials.map((row) => (
          <li
            key={row.slug}
            className={
              row.count > 0 ? "workshop-material" : "workshop-material is-none"
            }
            title={`${itemDef(row.slug)?.description ?? ""} Found in ${where(row.sources)}.`}
          >
            <span className="workshop-count">{row.count}</span>
            {row.name}
          </li>
        ))}
      </ul>

      {canCraft ? (
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
      ) : null}

      {crafted.length > 0 ? (
        <>
          <h4 className="workshop-heading">Ready to use</h4>
          <ul className="items-list">
            {crafted.map((entry) => {
              const def = itemDef(entry.slug);
              if (def == null || def.effect == null) return null;
              const action = useAction(def, {
                territoryName: territory?.name ?? null,
                creatureName: creature?.name ?? null,
                hasLineage: creature != null,
              });
              return (
                <li key={entry.slug} className="items-entry">
                  <span className="items-name" title={def.description}>
                    {def.displayName} ×{entry.count}
                  </span>
                  <span className="items-meta">
                    {[
                      spoilText(entry.nextSpoilTick, tick, ticksPerDay),
                      mintedText(entry),
                    ]
                      .filter((part) => part !== "")
                      .join(" · ")}
                  </span>
                  <button
                    type="button"
                    className="influence-btn items-use"
                    disabled={!action.ready}
                    title={
                      action.ready
                        ? `${def.description} Uses one influence.`
                        : action.hint
                    }
                    onClick={() => {
                      if (def.target === "TERRITORY" && territory != null) {
                        use({ item: def.slug, territoryId: territory.id });
                      } else if (def.target === "CREATURE" && creature) {
                        use({ item: def.slug, creatureId: creature.id });
                      } else if (def.target === "LINEAGE" && creature) {
                        use({ item: def.slug, lineageId: creature.lineageId });
                      }
                    }}
                  >
                    {action.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <h4 className="workshop-heading">Recipe book</h4>
      {RECIPE_GROUPS.map((group) => {
        const rows = recipes.filter((row) => row.group === group.id);
        if (rows.length === 0) return null;
        const ready = rows.filter((row) => row.ready).length;
        return (
          <details
            key={group.id}
            className="workshop-group"
            open={ready > 0 || group.id === "remedies"}
          >
            <summary>
              {group.title}
              <span className="items-meta">
                {ready > 0 ? ` · ${ready} ready` : ""}
              </span>
            </summary>
            <ul className="workshop-recipes">
              {rows.map((row) => (
                <li
                  key={row.output}
                  className={
                    row.ready ? "workshop-recipe is-ready" : "workshop-recipe"
                  }
                >
                  <div className="workshop-recipe-head">
                    <span className="items-name">
                      {row.name}
                      {row.owned > 0 ? ` ×${row.owned}` : ""}
                    </span>
                    {canCraft ? (
                      <button
                        type="button"
                        className="influence-btn"
                        disabled={!row.ready}
                        title={
                          row.ready
                            ? `Free to craft. You can make ${row.makes}.`
                            : "Missing ingredients"
                        }
                        onClick={() => {
                          ipc.send({
                            message: "item.craft",
                            body: { output: row.output },
                          });
                          setMade(`Crafted ${row.name}.`);
                          after();
                        }}
                      >
                        Craft
                      </button>
                    ) : null}
                  </div>
                  <p className="workshop-effect">{row.description}</p>
                  <p className="workshop-needs">
                    {row.inputs.map((input) => (
                      <span
                        key={input.slug}
                        className={
                          input.have >= input.need ? "is-met" : "is-short"
                        }
                      >
                        {ingredientText(input)}
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      <p className="influence-notice" role="status" aria-live="polite">
        {made ?? ""}
      </p>

      {canCraft && inventory.autonomy != null ? (
        <div className="items-autonomy" aria-label="Creature autonomy">
          <label
            className="items-toggle"
            title="Off: you do the crafting. On: your creatures also craft food, potions and tools they can use themselves. Tonics are always yours to make."
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
            Let my creatures craft too
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
            Creatures help themselves from my bag
          </label>
        </div>
      ) : null}

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
                  onClick={() =>
                    use({ item: relic.slug, lineageId: relic.lineageId })
                  }
                >
                  {waiting ? "Honored this week" : "Honor (+25 favor)"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/** Catalog order for any UI that lists every item kind. */
export const ITEM_ORDER = ITEM_CATALOG.map((def) => def.slug);
