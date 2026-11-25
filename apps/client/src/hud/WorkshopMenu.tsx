import { useCallback, useEffect, useRef, useState } from "react";
import { noteGoal } from "../state/goalStore";
import { creatureCondition } from "./condition";
import {
  CreatureStatus,
  InfluenceKind,
  itemDef,
  itemImageSrc,
  seasonAt,
  type InventoryView,
  type ItemSlug,
  type UseItemPayload,
} from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";
import { useUiStore } from "../state/uiStore";
import { useWorkshopStore } from "../state/workshopStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { speciesLabel } from "../view/species-skins";
import { SeasonLine } from "./SeasonLine";
import { abundanceLabel } from "./seasons";
import {
  RECIPE_FILTERS,
  filterRecipes,
  ingredientText,
  madeItems,
  materialRows,
  mintedText,
  missingText,
  readyCount,
  recipeRows,
  spoilText,
  useAction,
  type RecipeFilter,
} from "./workshop";
import "./workshop.css";

type Props = {
  ipc: IpcClient;
  ticksPerDay?: number;
};

const REFRESH_MS = 5_000;

function ItemThumb({ slug }: { slug: string }) {
  const src = itemImageSrc(slug);
  return src == null ? (
    <span className="ws-thumb ws-thumb--none" aria-hidden="true" />
  ) : (
    <img className="ws-thumb" src={src} alt="" loading="lazy" />
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/**
 * The Workshop: a button on the HUD and the menu it opens.
 *
 * Creatures find materials on their own while they forage (and keep finding
 * them while the player is away); here the player turns those into food,
 * potions, tools and tonics by hand, and gives them out. Nothing here has a
 * daily limit: gathering is bounded by a territory's stock, crafting by
 * materials, and using by the item itself.
 */
export function Workshop({ ipc, ticksPerDay = 144 }: Props) {
  const view = useWorldViewStore((s) => s.view);
  const selectedCreatureId = useUiStore((s) => s.selectedCreatureId);
  const selectCreature = useUiStore((s) => s.selectCreature);
  const open = useWorkshopStore((s) => s.open);
  const setOpen = useWorkshopStore((s) => s.setOpen);
  const toggle = useWorkshopStore((s) => s.toggle);

  const [inventory, setInventory] = useState<InventoryView | null>(null);
  const [filter, setFilter] = useState<RecipeFilter>("all");
  const [tab, setTab] = useState<"craft" | "bag">("craft");
  const [territoryId, setTerritoryId] = useState<number | "">("");
  const [status, setStatus] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(() => {
    ipc
      .query({ message: "query.inventory", body: {} })
      .then((result) => {
        if (result.message === "query.inventory") setInventory(result.body);
      })
      .catch(() => {
        // Offline or busy: keep showing the last bag; the next poll retries.
      });
  }, [ipc]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // W opens and closes it; Escape closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && useWorkshopStore.getState().open) {
        setOpen(false);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() !== "w" || isTyping(event.target)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen, toggle]);

  // Move focus into the menu when it opens and back to the button after.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      refresh();
      menuRef.current?.focus();
    } else if (wasOpen.current) {
      launcherRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open, refresh]);

  if (!view) return null;

  const season = seasonAt(view.world.lastTick, ticksPerDay).season;
  const items = inventory?.items ?? [];
  const ready = readyCount(items);
  const canCraft = inventory?.canHoldItems ?? false;

  const launcher = (
    <button
      ref={launcherRef}
      type="button"
      className={`ws-launcher${ready > 0 ? " ws-launcher--ready" : ""}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      title="Open the workshop (W)"
      onClick={toggle}
    >
      <span className="ws-launcher-icon" aria-hidden="true">
        ⚗
      </span>
      Workshop
      {ready > 0 ? (
        <span className="ws-badge" aria-label={`${ready} recipes ready`}>
          {ready}
        </span>
      ) : null}
    </button>
  );

  if (!open) return launcher;

  const living = view.creatures
    .filter((row) => row.status === CreatureStatus.ALIVE)
    .sort((a, b) => a.name.localeCompare(b.name));
  const creature = living.find((row) => row.id === selectedCreatureId) ?? null;
  const territories = view.territories;
  const territory =
    territories.find(
      (row) =>
        row.id ===
        (territoryId === ""
          ? (creature?.territoryId ?? territories[0]?.id)
          : territoryId),
    ) ?? null;
  const territoryNames = Object.fromEntries(
    territories.map((row) => [row.slug, row.name]),
  );
  const where = (slugs: readonly string[]) =>
    slugs.map((slug) => territoryNames[slug] ?? slug).join(" and ");

  const materials = materialRows(items);
  const recipes = recipeRows(items);
  const shown = filterRecipes(recipes, filter);
  const crafted = madeItems(items);
  const resource = territory?.resource ?? null;
  const tick = inventory?.tick ?? view.world.lastTick;
  const after = () => setTimeout(refresh, 400);

  const use = (payload: UseItemPayload, done: string) => {
    if (payload.creatureId != null) {
      noteGoal("gave");
      const target = view.creatures.find((c) => c.id === payload.creatureId);
      if (target && creatureCondition(target).level > 0) noteGoal("helped");
    }
    ipc.send({
      message: "influence.submit",
      body: { kind: InfluenceKind.USE_ITEM, payload },
    });
    setStatus(done);
    after();
  };

  // Keep Tab inside the menu while it is open.
  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || menuRef.current == null) return;
    const focusable = menuRef.current.querySelectorAll<HTMLElement>(
      "button:not(:disabled), select, input, [href]",
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first == null || last == null) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {launcher}
      <div
        className="ws-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div
          ref={menuRef}
          className="ws-menu"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ws-title"
          tabIndex={-1}
          data-tab={tab}
          onKeyDown={trapTab}
        >
          <header className="ws-head">
            <div>
              <h2 id="ws-title" className="ws-title">
                Workshop
              </h2>
              <p className="ws-sub">
                Your creatures bring back materials as they forage, even while
                you are away. Craft them into food, potions and tonics.
              </p>
            </div>
            <button
              type="button"
              className="ws-close"
              aria-label="Close the workshop"
              title="Close (Esc)"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </header>

          <div className="ws-tabs" role="tablist" aria-label="Workshop view">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "craft"}
              className="ws-tab"
              onClick={() => setTab("craft")}
            >
              Recipes{ready > 0 ? ` · ${ready} ready` : ""}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "bag"}
              className="ws-tab"
              onClick={() => setTab("bag")}
            >
              Bag{crafted.length > 0 ? ` · ${crafted.length} to use` : ""}
            </button>
          </div>

          {inventory == null ? (
            <p className="ws-empty">Opening the workshop…</p>
          ) : (
            <div className="ws-body">
              <section className="ws-bag" aria-label="Your bag">
                <SeasonLine ticksPerDay={ticksPerDay} />
                <h3 className="ws-heading">Materials</h3>
                <ul className="ws-materials">
                  {materials.map((row) => (
                    <li
                      key={row.slug}
                      className={`ws-material${row.count > 0 ? "" : " is-none"}`}
                      title={itemDef(row.slug)?.description}
                    >
                      <ItemThumb slug={row.slug} />
                      <span className="ws-material-count">{row.count}</span>
                      <span className="ws-material-name">{row.name}</span>
                      <span className="ws-material-where">
                        {where(row.sources)}
                      </span>
                      {abundanceLabel(row.slug, season) !== "" ? (
                        <span
                          className={`ws-material-season is-${abundanceLabel(row.slug, season)}`}
                        >
                          {abundanceLabel(row.slug, season)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {canCraft ? (
                  <>
                    <h3 className="ws-heading">Gather by hand</h3>
                    <div className="ws-field">
                      <select
                        className="influence-select"
                        aria-label="Territory"
                        value={territory?.id ?? ""}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setTerritoryId(Number.isFinite(next) ? next : "");
                        }}
                      >
                        {territories.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="influence-btn"
                        disabled={
                          territory == null ||
                          resource == null ||
                          resource.free <= 0
                        }
                        title="Gathering eats into the food creatures forage here."
                        onClick={() => {
                          if (territory == null || resource == null) return;
                          noteGoal("gathered");
                          ipc.send({
                            message: "influence.submit",
                            body: {
                              kind: InfluenceKind.GATHER_RESOURCE,
                              payload: {
                                territoryId: territory.id,
                                resource: resource.slug as ItemSlug,
                                units: 1,
                              },
                            },
                          });
                          setStatus(
                            `Gathering ${itemDef(resource.slug)?.displayName ?? "materials"} in ${territory.name}.`,
                          );
                          after();
                        }}
                      >
                        Gather
                      </button>
                    </div>
                    <p className="ws-note">
                      {resource == null
                        ? "Nothing grows here."
                        : resource.free <= 0
                          ? `${itemDef(resource.slug)?.displayName ?? "It"} is picked clean here; it regrows.`
                          : `${itemDef(resource.slug)?.displayName ?? "Stock"}: ${resource.free} of ${resource.cap} left to gather.`}
                    </p>

                    <h3 className="ws-heading">Ready to use</h3>
                    <div className="ws-field">
                      <label className="ws-label" htmlFor="ws-creature">
                        Give to
                      </label>
                      <select
                        id="ws-creature"
                        className="influence-select"
                        value={creature?.id ?? ""}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          selectCreature(
                            event.target.value === "" || !Number.isFinite(next)
                              ? null
                              : next,
                          );
                        }}
                      >
                        <option value="">Choose a creature…</option>
                        {living.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name} · {speciesLabel(row.speciesId)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {crafted.length === 0 ? (
                      <p className="ws-note">
                        Nothing made yet. Craft something from the recipes.
                      </p>
                    ) : (
                      <ul className="ws-made">
                        {crafted.map((entry) => {
                          const def = itemDef(entry.slug);
                          if (def == null || def.effect == null) return null;
                          const action = useAction(def, {
                            territoryName: territory?.name ?? null,
                            creatureName: creature?.name ?? null,
                            hasLineage: creature != null,
                          });
                          const meta = [
                            spoilText(entry.nextSpoilTick, tick, ticksPerDay),
                            mintedText(entry),
                          ]
                            .filter((part) => part !== "")
                            .join(" · ");
                          return (
                            <li key={entry.slug} className="ws-made-row">
                              <ItemThumb slug={entry.slug} />
                              <div className="ws-made-text">
                                <span className="ws-made-name">
                                  {def.displayName}
                                  <span className="ws-count">
                                    ×{entry.count}
                                  </span>
                                </span>
                                <span className="ws-note">{meta}</span>
                              </div>
                              <button
                                type="button"
                                className="influence-btn ws-primary"
                                disabled={!action.ready}
                                title={
                                  action.ready ? def.description : action.hint
                                }
                                onClick={() => {
                                  if (
                                    def.target === "TERRITORY" &&
                                    territory != null
                                  ) {
                                    use(
                                      {
                                        item: def.slug,
                                        territoryId: territory.id,
                                      },
                                      `${def.displayName} used in ${territory.name}.`,
                                    );
                                  } else if (
                                    def.target === "CREATURE" &&
                                    creature
                                  ) {
                                    use(
                                      {
                                        item: def.slug,
                                        creatureId: creature.id,
                                      },
                                      `${def.displayName} given to ${creature.name}.`,
                                    );
                                  } else if (
                                    def.target === "LINEAGE" &&
                                    creature
                                  ) {
                                    use(
                                      {
                                        item: def.slug,
                                        lineageId: creature.family.lineageId,
                                      },
                                      `${def.displayName} used on ${creature.name}'s line.`,
                                    );
                                  }
                                }}
                              >
                                {action.label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {inventory.relics.length > 0 ? (
                      <>
                        <h3 className="ws-heading">Relics</h3>
                        <ul className="ws-made">
                          {inventory.relics.map((relic) => {
                            const waiting =
                              relic.usableAtMs != null &&
                              relic.usableAtMs > Date.now();
                            return (
                              <li
                                key={`${relic.slug}:${relic.lineageId}`}
                                className="ws-made-row"
                              >
                                <ItemThumb slug={relic.slug} />
                                <div className="ws-made-text">
                                  <span className="ws-made-name">
                                    {itemDef(relic.slug)?.displayName ??
                                      relic.slug}
                                  </span>
                                  <span className="ws-note">
                                    lineage #{relic.lineageId}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="influence-btn"
                                  disabled={waiting}
                                  title="+25 favor for its lineage, once a week"
                                  onClick={() =>
                                    use(
                                      {
                                        item: relic.slug,
                                        lineageId: relic.lineageId,
                                      },
                                      "Relic honored: +25 favor.",
                                    )
                                  }
                                >
                                  {waiting ? "Honored this week" : "Honor"}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : null}
                  </>
                ) : null}
              </section>

              <section className="ws-craft" aria-label="Recipes">
                {!canCraft ? (
                  <p className="ws-banner">
                    Sign in with Boing to keep a bag and craft. You can still
                    browse the recipe book.
                  </p>
                ) : null}
                <div
                  className="ws-filters"
                  role="group"
                  aria-label="Show recipes"
                >
                  {RECIPE_FILTERS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="ws-chip"
                      aria-pressed={filter === option.id}
                      onClick={() => setFilter(option.id)}
                    >
                      {option.title}
                      <span className="ws-chip-count">
                        {filterRecipes(recipes, option.id).length}
                      </span>
                    </button>
                  ))}
                </div>
                {shown.length === 0 ? (
                  <p className="ws-empty">
                    Nothing to craft yet. Your creatures are still out
                    gathering; check the recipes under “All” to see what each
                    one needs.
                  </p>
                ) : (
                  <ul className="ws-recipes">
                    {shown.map((row) => (
                      <li
                        key={row.output}
                        className={`ws-recipe${row.ready ? " is-ready" : ""}`}
                      >
                        <ItemThumb slug={row.output} />
                        <div className="ws-recipe-text">
                          <span className="ws-recipe-name">
                            {row.name}
                            {row.owned > 0 ? (
                              <span className="ws-count">
                                {row.owned} in bag
                              </span>
                            ) : null}
                          </span>
                          <p className="ws-recipe-effect">{row.description}</p>
                          <ul className="ws-needs">
                            {row.inputs.map((input) => (
                              <li
                                key={input.slug}
                                className={
                                  input.have >= input.need
                                    ? "is-met"
                                    : "is-short"
                                }
                              >
                                {ingredientText(input)}
                              </li>
                            ))}
                          </ul>
                          {row.ready ? null : (
                            <p className="ws-note">
                              Still needs {missingText(row, territoryNames)}.
                            </p>
                          )}
                        </div>
                        {canCraft ? (
                          <button
                            type="button"
                            className="influence-btn ws-primary ws-craft-btn"
                            disabled={!row.ready}
                            title={
                              row.ready
                                ? `You can make ${row.makes}.`
                                : "Missing ingredients"
                            }
                            onClick={() => {
                              noteGoal("crafted");
                              ipc.send({
                                message: "item.craft",
                                body: { output: row.output },
                              });
                              setStatus(`Crafted ${row.name}.`);
                              after();
                            }}
                          >
                            Craft{" "}
                            {row.makes > 1 ? (
                              <span className="ws-craft-makes">
                                ×{row.makes} possible
                              </span>
                            ) : null}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          <footer className="ws-foot">
            <p className="ws-status" role="status" aria-live="polite">
              {status}
            </p>
            {canCraft && inventory?.autonomy != null ? (
              <div className="ws-toggles" aria-label="Creature autonomy">
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
          </footer>
        </div>
      </div>
    </>
  );
}
