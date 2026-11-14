import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { playSfx } from "../audio";
import {
  ADVENTURE_DURATIONS,
  ADVENTURE_LOCATIONS,
  STYLE_SETS,
  STYLE_LUCK_MULTIPLIER_CAP,
  type AdventureDurationId,
} from "../content/adventures";
import { itemDisplayName } from "../content/items";
import { ITEM_RARITY_LABELS } from "../content/rarities";
import { adventurePosterSvg } from "../content/adventurePosters";
import {
  claimAdventure,
  claimAllAdventures,
  fetchAdventureHistory,
  fetchAdventuresDesk,
  setAdventureDevNow,
  startAdventure,
  type AdventuresDesk,
} from "../ui/adventureClient";
import {
  activeRunForLocation,
  allDurationIds,
  cardMatchesFilters,
  durationLabel,
  emptyDispatchFilters,
  exclusiveCollectionFallback,
  filterSummary,
  FILTER_RARITIES,
  historyRowFromRun,
  formatAdventureClock,
  formatCountdown,
  lockedSlotMilestones,
  luckCompareForLocations,
  percentLabel,
  previewFor,
  readyRunCount,
  runProgress,
  stylePointsFromEquipped,
  type AdventureRunView,
  type DispatchFilters,
} from "../ui/adventureHub";
import { buildAdventureReveal, rarityStickerSvg } from "../ui/adventureReveal";
import { showRewardModal } from "../ui/rewardModal";
import { app } from "../ui/appRuntime";
import { AdventureTutorialCard } from "./AdventureTutorialCard";

function Poster({ locationId, title }: { locationId: string; title: string }) {
  return (
    <div
      className="adventure-poster"
      role="img"
      aria-label={`${title} poster`}
      dangerouslySetInnerHTML={{ __html: adventurePosterSvg(locationId) }}
    />
  );
}

function revealFromRun(run: AdventureRunView) {
  const source =
    ADVENTURE_LOCATIONS.find((row) => row.id === run.locationId)?.name ??
    "Dispatch";
  const rewards = (run.rewards ?? []).map((row) =>
    buildAdventureReveal({
      gameItemId: row.gameItemId,
      rarity: row.rarity,
      kind: row.kind,
      currency: row.currency,
      qty: row.qty,
      dropSource: `${source} · Dispatch`,
      acquiredAt: run.claimedAt ?? run.completedAt,
      ownerCount: row.ownerCount ?? null,
      mintStatus: row.mintStatus,
    }),
  );
  showRewardModal(null, {
    chainStatus: rewards.some((row) => row.mintStatus === "pending")
      ? "pending"
      : rewards.some((row) => row.mintStatus === "failed")
        ? "failed"
        : "confirmed",
    adventureRewards: rewards,
    activityTitle: `${source} haul`,
  });
}

export function PastureDispatchMenu({
  onClose,
  desk: deskProp,
  onDesk,
}: {
  onClose: () => void;
  desk?: AdventuresDesk | null;
  onDesk?: (desk: AdventuresDesk) => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [desk, setDesk] = useState<AdventuresDesk | null>(deskProp ?? null);
  const [history, setHistory] = useState<AdventureRunView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<DispatchFilters>(
    emptyDispatchFilters(),
  );
  const [pickedDuration, setPickedDuration] =
    useState<AdventureDurationId>("quick");
  const [now, setNow] = useState(() => Date.now());
  const [panel, setPanel] = useState<
    "trips" | "luck" | "rates" | "collection" | "history"
  >("trips");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const applyDesk = useCallback(
    (next: AdventuresDesk) => {
      setDesk(next);
      onDesk?.(next);
    },
    [onDesk],
  );

  const reload = useCallback(async () => {
    const next = await fetchAdventuresDesk();
    applyDesk(next);
    if (app.owner) {
      const rows = await fetchAdventureHistory().catch(() => []);
      setHistory(rows);
    }
  }, [applyDesk]);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not load Dispatch");
    });
    closeRef.current?.focus();
  }, [reload]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const runs = desk?.runs ?? [];
  const previews = desk?.preview ?? [];
  const style = desk?.styleLuck ?? null;
  const slots = desk?.slots ?? 1;
  const completed = desk?.completed ?? 0;
  const ready = readyRunCount(runs);
  const popupEvent = desk?.events?.[0];
  const collection = desk?.collection ?? exclusiveCollectionFallback(new Set());
  const lockedSlots = lockedSlotMilestones(slots);
  const durationFilter =
    filters.durationId === "all" ? pickedDuration : filters.durationId;
  const luckCompare = luckCompareForLocations(style, previews, durationFilter);
  const equippedRows = stylePointsFromEquipped(style?.cosmeticIds ?? []);
  const visibleLocations = useMemo(
    () =>
      ADVENTURE_LOCATIONS.filter((location) =>
        cardMatchesFilters(
          location.id,
          durationFilter,
          filters,
          previewFor(previews, location.id, durationFilter),
        ),
      ),
    [filters, durationFilter, previews],
  );

  const act = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await work();
      setFlash(done);
      playSfx("ui-click");
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Dispatch request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="pasture-station-menu dispatch-station-menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="pasture-station-menu-head">
        <div>
          <p className="eyebrow">DISPATCH STATION</p>
          <h2 id={titleId}>Idle Adventures</h2>
        </div>
        <div className="adventure-head-actions">
          {ready > 0 ? (
            <button
              type="button"
              className="adventure-claim-all"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const result = await claimAllAdventures();
                  for (const run of result.claimed) revealFromRun(run);
                }, "Claimed the ready trips.")
              }
            >
              Claim all ({ready})
            </button>
          ) : null}
          <button
            type="button"
            className="quiet pasture-station-close"
            ref={closeRef}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
      <p className="subtle">
        Off-map trips from the depot. Time is real. The bag is not guaranteed.
      </p>
      <AdventureTutorialCard enabled />
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

      {panel === "trips" && popupEvent ? (
        <section
          className="adventure-popup-strip"
          aria-label="Worldwide Pop-Up"
        >
          <Poster locationId="worldwide-pop-up" title="Worldwide Pop-Up" />
          <div>
            <p className="eyebrow">Featured limited-time drops</p>
            <h3>Worldwide Pop-Up · {popupEvent.name}</h3>
            <p className="small">
              Event-exclusive stock while the overlay is live. Ends{" "}
              {formatAdventureClock(popupEvent.endsAt)} (America/New_York).
            </p>
          </div>
        </section>
      ) : panel === "trips" ? (
        <p className="small adventure-popup-dark">
          Worldwide Pop-Up is dark until a seasonal overlay goes live.
        </p>
      ) : null}

      <div
        className="adventure-toolbar"
        role="toolbar"
        aria-label="Dispatch views"
      >
        {(
          [
            ["trips", "Trips"],
            ["luck", "Style Luck"],
            ["rates", "Drop rates"],
            ["collection", "Collection"],
            ["history", "History"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={panel === id ? "is-on" : ""}
            aria-pressed={panel === id}
            onClick={() => setPanel(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {panel === "trips" ? (
        <>
          <button
            type="button"
            className="adventure-filter-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters · {filterSummary(filters)}
          </button>
          <div
            className={"adventure-filters" + (filtersOpen ? " is-open" : "")}
            id="adventure-filters"
          >
            <fieldset>
              <legend>Duration</legend>
              <button
                type="button"
                className={filters.durationId === "all" ? "is-on" : ""}
                aria-pressed={filters.durationId === "all"}
                onClick={() =>
                  setFilters((cur) => ({ ...cur, durationId: "all" }))
                }
              >
                All
              </button>
              {allDurationIds().map((id) => (
                <button
                  key={id}
                  type="button"
                  className={
                    (
                      filters.durationId === "all"
                        ? pickedDuration === id
                        : filters.durationId === id
                    )
                      ? "is-on"
                      : ""
                  }
                  aria-pressed={
                    filters.durationId === "all"
                      ? pickedDuration === id
                      : filters.durationId === id
                  }
                  onClick={() => {
                    setPickedDuration(id);
                    setFilters((cur) => ({ ...cur, durationId: id }));
                  }}
                >
                  {durationLabel(id)}
                </button>
              ))}
            </fieldset>
            <fieldset>
              <legend>Rarity</legend>
              {FILTER_RARITIES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={filters.rarity === id ? "is-on" : ""}
                  aria-pressed={filters.rarity === id}
                  onClick={() => setFilters((cur) => ({ ...cur, rarity: id }))}
                >
                  {id === "all"
                    ? "All"
                    : id === "mythic"
                      ? "Grail"
                      : id === "iconic"
                        ? "Vaulted"
                        : ITEM_RARITY_LABELS[id]}
                </button>
              ))}
            </fieldset>
          </div>

          {lockedSlots.length ? (
            <ul className="adventure-locked-slots">
              {lockedSlots.map((row) => (
                <li key={row.slots}>
                  Slot {row.slots} locked · finish {row.completed} trips to open
                  it ({completed}/{row.completed})
                </li>
              ))}
            </ul>
          ) : null}

          <div className="adventure-card-grid">
            {visibleLocations.map((location) => {
              const run = activeRunForLocation(runs, location.id);
              const preview = previewFor(previews, location.id, durationFilter);
              const duration = ADVENTURE_DURATIONS.find(
                (row) => row.id === durationFilter,
              );
              const locked = preview ? !preview.available : false;
              const success = preview
                ? Math.round(preview.outcomes.success * 100)
                : 0;
              const bonus = preview
                ? Math.round(preview.outcomes.bonus * 100)
                : 0;
              const luckBonus = preview
                ? Math.round((preview.styleLuck.multiplier - 1) * 100)
                : 0;
              return (
                <article
                  key={location.id}
                  className={
                    "adventure-card" +
                    (run?.status === "ready" ? " is-ready" : "") +
                    (locked ? " is-locked" : "")
                  }
                  data-location={location.id}
                >
                  <Poster locationId={location.id} title={location.name} />
                  <div className="adventure-card-body">
                    <p className="eyebrow">{location.theme.split(",")[0]}</p>
                    <h3>{location.name}</h3>
                    <p className="small">{location.blurb}</p>
                    <p className="adventure-rewards-preview">
                      {location.theme}
                    </p>
                    {run ? (
                      <>
                        <p className="small">
                          Started {formatAdventureClock(run.startedAt)} · done{" "}
                          {formatAdventureClock(run.endsAt)}
                        </p>
                        <div
                          className="adventure-progress"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(
                            runProgress(run, now) * 100,
                          )}
                          aria-label={`${location.name} progress`}
                        >
                          <span
                            style={{ width: `${runProgress(run, now) * 100}%` }}
                          />
                        </div>
                        <p className="adventure-countdown">
                          {run.status === "ready"
                            ? "Landed. Claim it."
                            : `T-minus ${formatCountdown(run.endsAt - now)}`}
                        </p>
                        <div className="adventure-card-actions">
                          {run.status === "ready" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void act(async () => {
                                  const result = await claimAdventure(run.id);
                                  revealFromRun(result.run);
                                }, "Claimed.")
                              }
                            >
                              Claim
                            </button>
                          ) : desk?.devClock ? (
                            <button
                              type="button"
                              className="quiet"
                              disabled={busy}
                              onClick={() => {
                                setAdventureDevNow(run.endsAt + 1000);
                                void reload();
                              }}
                            >
                              Skip wait (local)
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="small">
                          Duration:{" "}
                          {duration?.name ?? durationLabel(durationFilter)}.
                          Estimate before launch:{" "}
                          {preview
                            ? `${success}% success, ${bonus}% bonus hit.`
                            : "Connect to see the estimate."}
                        </p>
                        <p className="small">
                          Success {success}% · bonus from equipped cosmetics +
                          {luckBonus}% luck, {bonus}% bonus chance.
                        </p>
                        {locked ? (
                          <p className="adventure-lock">
                            {preview?.lockedReason}
                          </p>
                        ) : (
                          <div className="adventure-card-actions">
                            <button
                              type="button"
                              disabled={busy || !app.owner}
                              onClick={() =>
                                void act(async () => {
                                  await startAdventure({
                                    locationId: location.id,
                                    durationId: durationFilter,
                                  });
                                }, `Sent them to ${location.name}.`)
                              }
                            >
                              Launch {duration?.name ?? "trip"}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}

      {panel === "luck" ? (
        <section className="adventure-panel" aria-label="Style Luck">
          <h3>Style Luck</h3>
          <p className="small">
            Equipped cosmetics add points (Common +1, Uncommon +2, Rare +4, Epic
            +7, Legendary +12, Mythic +20). Linear 0.02 per point until 40, then
            0.008, cap {STYLE_LUCK_MULTIPLIER_CAP}×. Final chance = base × luck
            × adventure bonus. Grail and Vaulted stay under a hard ceiling and
            are never guaranteed, including at cap. Pity never grants them.
          </p>
          <ul className="adventure-equipped">
            {equippedRows.length ? (
              equippedRows.map((row) => (
                <li key={row.id}>
                  {itemDisplayName(row.id)} · {row.rarity ?? "unknown"} · +
                  {row.points}
                </li>
              ))
            ) : (
              <li>Nothing equipped. Fitting Room is down the avenue.</li>
            )}
          </ul>
          <h4>Set bonuses</h4>
          <ul>
            {Object.entries(STYLE_SETS).map(([id, row]) => (
              <li
                key={id}
                className={style?.sets.includes(id as never) ? "is-on" : ""}
              >
                <strong>{row.name}</strong> +{row.points} · {row.blurb}
                {style?.sets.includes(id as never) ? " · active" : ""}
              </li>
            ))}
          </ul>
          <h4>This fit, per destination</h4>
          <ul className="adventure-luck-compare">
            {luckCompare.map((row) => (
              <li key={row.locationId}>
                {row.name}: {row.multiplier.toFixed(2)}× luck ·{" "}
                {row.bonus.toFixed(2)}× destination
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {panel === "rates" ? (
        <section
          className="adventure-panel adventure-rates"
          aria-label="Drop rates"
        >
          <h3>Drop rates</h3>
          <p className="small">
            Exact table from /rates. Weights are per 1,000,000 so 0.01% is
            exact. Same-location repeats lose 18% yield down to a 35% floor,
            then a daily cap of 6 hard-stops inflation.
          </p>
          <table>
            <thead>
              <tr>
                <th>Rarity</th>
                <th>Weight</th>
                <th>Base</th>
              </tr>
            </thead>
            <tbody>
              {(
                (desk?.rates?.rarities as {
                  id: string;
                  weight: number;
                  chance: number;
                  label?: string;
                }[]) ?? []
              ).map((row) => (
                <tr key={row.id}>
                  <td>{row.label ?? row.id}</td>
                  <td>{row.weight}</td>
                  <td>{percentLabel(row.chance, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">
            Pity cap{" "}
            {(desk?.rates as { pityCap?: number } | undefined)?.pityCap ?? 40}{" "}
            grants Legendary only. Style Luck ceilings: Grail{" "}
            {percentLabel(
              Number(
                (desk?.rates as { mythicCeiling?: number })?.mythicCeiling ??
                  0.0038,
              ),
              3,
            )}
            , Vaulted{" "}
            {percentLabel(
              Number(
                (desk?.rates as { iconicCeiling?: number })?.iconicCeiling ??
                  0.0002,
              ),
              3,
            )}
            .
          </p>
        </section>
      ) : null}

      {panel === "collection" ? (
        <section className="adventure-panel" aria-label="Collection progress">
          <h3>
            Collection {collection.found} / {collection.total}
          </h3>
          <div
            className="adventure-progress"
            role="progressbar"
            aria-valuenow={collection.found}
            aria-valuemin={0}
            aria-valuemax={collection.total}
          >
            <span
              style={{
                width: `${collection.total ? (collection.found / collection.total) * 100 : 0}%`,
              }}
            />
          </div>
          <ul className="adventure-collection">
            {collection.items.map((item) => (
              <li key={item.id} className={item.owned ? "is-owned" : ""}>
                {item.name} · {item.rarity}
                {item.owned ? " · in the stash" : " · still out there"}
                {item.ownerCount != null ? (
                  <span className="adventure-collection-owners">
                    {" "}
                    · {item.ownerCount} holders
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {panel === "history" ? (
        <section className="adventure-panel" aria-label="Adventure history">
          <h3>History</h3>
          {!history.length ? (
            <p className="adventure-history-empty">
              The log is clean. Launch a trip from Dispatch and come back to see
              what you pulled, how rare it was, and who else is holding it.
            </p>
          ) : (
            <ul className="adventure-history">
              {history.map((run) => {
                const row = historyRowFromRun(run);
                return (
                  <li key={run.id} className="adventure-history-row">
                    <span
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{
                        __html: rarityStickerSvg(row.rarity),
                      }}
                    />
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => revealFromRun(run)}
                    >
                      <strong>
                        {row.locationName} · {row.durationName}
                      </strong>
                      {row.rewardName}
                    </button>
                    <div className="adventure-history-meta">
                      <span
                        className="adventure-rarity-pill"
                        style={{ color: row.rarityColor }}
                      >
                        {row.rarityName}
                      </span>
                      <span className="adventure-outcome-pill">
                        {row.outcomeLabel}
                      </span>
                      <time
                        dateTime={new Date(row.acquiredAt ?? 0).toISOString()}
                      >
                        {row.acquiredLabel}
                      </time>
                      <span className="adventure-history-owners">
                        {row.ownerCountLabel}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </section>
  );
}
