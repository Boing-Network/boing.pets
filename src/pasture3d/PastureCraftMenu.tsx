import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  canCraftRecipe,
  craftItemName,
  missingIngredients,
  type CraftRecipe,
} from "../content/crafting";
import { playSfx } from "../audio";
import { app, notice } from "../ui/appRuntime";
import { run } from "../ui/careActions";
import {
  craftRecipe,
  loadCraftStatus,
  type CraftStatus,
} from "../ui/craftClient";

export function PastureCraftMenu({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<CraftStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const next = await loadCraftStatus(app.owner || null);
    setStatus(next);
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not load recipes");
    });
    closeRef.current?.focus();
  }, [reload]);

  const craft = (recipe: CraftRecipe) => {
    setError(null);
    setFlash(null);
    setBusyId(recipe.id);
    void run(async () => {
      notice("Approve the crafting signature in Express...");
      await craftRecipe(recipe.id);
      await reload();
      const label = craftItemName(recipe.outputItemId);
      const msg = `Crafted ${recipe.outputQty}x ${label}.`;
      setFlash(msg);
      notice(msg);
      playSfx("craft");
    })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Craft failed";
        setError(msg);
        notice(msg, true);
      })
      .finally(() => setBusyId(null));
  };

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
          <h2 id={titleId}>Crafting Station</h2>
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
        Combine activity resources into catalog items. Cooked snacks stay in the
        Kitchen. The full table is also at <a href="/craft.html">/craft</a>.
      </p>
      {status ? (
        <p className="small">
          {status.craftedToday} / {status.dailyCap} crafts today (UTC).
        </p>
      ) : (
        <p className="small">Loading recipes...</p>
      )}
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
      <div className="pasture-station-list">
        {(status?.recipes || []).map((recipe) => {
          const inv = status?.inventory || {};
          const can = canCraftRecipe(recipe, inv);
          const missing = missingIngredients(recipe, inv);
          const capped = (status?.craftedToday || 0) >= (status?.dailyCap || 0);
          return (
            <article key={recipe.id} className="market-card">
              <h3>{recipe.name}</h3>
              <p className="subtle">{recipe.description}</p>
              <ul className="pasture-station-ings">
                {recipe.inputs.map((ing) => {
                  const have = inv[ing.itemId] || 0;
                  const ok = have >= ing.qty;
                  return (
                    <li key={ing.itemId} className={ok ? "" : "is-short"}>
                      {craftItemName(ing.itemId)} {have}/{ing.qty}
                    </li>
                  );
                })}
              </ul>
              <p className="small">
                Makes {recipe.outputQty}x {craftItemName(recipe.outputItemId)}
              </p>
              {missing.length && !can ? (
                <p className="small">Need more ingredients to craft this.</p>
              ) : null}
              <button
                type="button"
                className="secondary"
                disabled={!!busyId || !app.owner || !can || capped}
                onClick={() => craft(recipe)}
              >
                {busyId === recipe.id ? "Crafting..." : "Craft / sign"}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
