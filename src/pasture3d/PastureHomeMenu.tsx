import { useCallback, useEffect, useId, useRef, useState } from "react";
import { HOME_GRID } from "../housing";
import { app, notice } from "../ui/appRuntime";
import { run } from "../ui/careActions";
import {
  housingAct,
  loadHousingPlot,
  type HousingPlotView,
} from "../ui/pages/lifestylePage";

export function PastureHomeMenu({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [data, setData] = useState<HousingPlotView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const next = await loadHousingPlot(app.owner || null);
    setData(next);
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not load your plot");
    });
    closeRef.current?.focus();
  }, [reload]);

  const act = (kind: string, extra: Record<string, unknown> = {}) => {
    setError(null);
    setBusy(true);
    void run(async () => {
      await housingAct(kind, extra);
      await reload();
    })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Home update failed";
        setError(msg);
        notice(msg, true);
      })
      .finally(() => setBusy(false));
  };

  const grid = data?.grid || HOME_GRID;
  const byCell = new Map(
    (data?.placements || []).map((row) => [row.x + "," + row.y, row]),
  );

  let summary = "Connect Express to use your 4x4 home plot.";
  if (app.owner && !data?.plot)
    summary = "Hatch a buddy to unlock your home plot.";
  else if (data?.private) summary = "This home is private.";
  else if (data?.plot)
    summary =
      "Your plot is " +
      data.plot.visibility +
      ". Place furniture from the market, or pick up an item already on the grid.";

  return (
    <div
      className="pasture-station-menu pasture-home-menu"
      role="dialog"
      aria-labelledby={titleId}
    >
      <header>
        <div>
          <p className="eyebrow">HOUSING</p>
          <h2 id={titleId}>Home plot</h2>
        </div>
        <button
          type="button"
          className="quiet"
          ref={closeRef}
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <p className="subtle">{summary}</p>
      {error ? <p className="notice error">{error}</p> : null}
      <div
        className="home-grid"
        style={{ ["--home-grid" as string]: String(grid) }}
        aria-label="Home plot"
      >
        {Array.from({ length: grid * grid }, (_, index) => {
          const x = index % grid;
          const y = Math.floor(index / grid);
          const placed = byCell.get(x + "," + y);
          return (
            <button
              key={x + "," + y}
              type="button"
              className={"home-cell" + (placed ? " filled" : "")}
              disabled={busy || !data?.plot}
              title={
                placed
                  ? placed.item_id + " — click to pick up"
                  : "Empty (" + x + "," + y + ") — place selected furniture"
              }
              onClick={() => {
                if (placed) act("pickup", { placement_id: placed.id });
                else {
                  const itemId = selectRef.current?.value || "";
                  if (!itemId) {
                    setError("Select furniture to place first");
                    return;
                  }
                  act("place", { item_id: itemId, x, y });
                }
              }}
            >
              {placed ? placed.item_id.replace("furn-", "") : "·"}
            </button>
          );
        })}
      </div>
      <div className="social-form">
        <label>
          Furniture to place{" "}
          <select ref={selectRef} disabled={busy || !data?.plot}>
            <option value="">Select owned furniture…</option>
            {(data?.furniture || []).map((stack) => (
              <option key={stack.item_id} value={stack.item_id}>
                {stack.name} ×{stack.qty}
              </option>
            ))}
          </select>
        </label>
      </div>
      {data?.plot ? (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            act("set_visibility", {
              visibility:
                data.plot?.visibility === "public" ? "private" : "public",
            })
          }
        >
          {data.plot.visibility === "public"
            ? "Make private · sign"
            : "Make public · sign"}
        </button>
      ) : null}
      <p className="small">
        Same signatures as the housing page.{" "}
        <a href="/home.html">Open /home.html</a> if you prefer the 2D fallback.
      </p>
    </div>
  );
}
