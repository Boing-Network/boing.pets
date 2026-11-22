import { useMemo, useState } from "react";
import { type SpeciesSlug } from "@boing-pets/contract";
import { SiteNav } from "../hud/SiteNav";
import {
  BESTIARY_SPECIES,
  BESTIARY_TERRITORIES,
  DEFAULT_BESTIARY_FILTERS,
  DIETS,
  DIET_LABEL,
  GAIT_LABEL,
  bestiaryHref,
  filterBestiary,
  territoryName,
  type BestiaryFilters,
  type BestiarySort,
} from "./bestiary-data";
import type { SpeciesLiveCounts } from "./bestiary-live";
import { SpeciesPortrait } from "./SpeciesPortrait";

type Props = {
  unknownSlug?: string;
  live?: ReadonlyMap<string, SpeciesLiveCounts> | null;
  onOpen: (slug: string) => void;
};

export function BestiaryIndex({ unknownSlug, live, onOpen }: Props) {
  const [filters, setFilters] = useState<BestiaryFilters>(
    DEFAULT_BESTIARY_FILTERS,
  );
  const shown = useMemo(
    () => filterBestiary(BESTIARY_SPECIES, filters),
    [filters],
  );
  const patch = (next: Partial<BestiaryFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));

  return (
    <div className="bestiary-page">
      <header className="bestiary-top">
        <a className="brand" href="/">
          Living Pets
        </a>
        <SiteNav current="bestiary" />
      </header>
      <main className="bestiary-main">
        <header className="bestiary-intro">
          <h1>Bestiary</h1>
          <p className="lede">
            All {BESTIARY_SPECIES.length} species of the Living Pets world, with
            the diet, movement, habitat and lifespan from the world catalog.
            Portraits are in-game stills, taken under the same moonlight.
          </p>
        </header>
        {unknownSlug ? (
          <p className="bestiary-notice" role="status">
            No species named “{unknownSlug}”. Browse the catalog below.
          </p>
        ) : null}
        <div className="bestiary-controls">
          <input
            type="search"
            value={filters.query}
            onChange={(event) => patch({ query: event.target.value })}
            placeholder="Search by name, diet or habitat"
            aria-label="Search species"
          />
          <label>
            Diet
            <select
              value={filters.diet}
              onChange={(event) =>
                patch({ diet: event.target.value as BestiaryFilters["diet"] })
              }
              aria-label="Filter by diet"
            >
              <option value="">All diets</option>
              {DIETS.map((diet) => (
                <option key={diet} value={diet}>
                  {DIET_LABEL[diet]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select
              value={filters.sort}
              onChange={(event) =>
                patch({ sort: event.target.value as BestiarySort })
              }
              aria-label="Sort species"
            >
              <option value="catalog">Catalog order</option>
              <option value="name">Name</option>
              <option value="habitat">Habitat</option>
              <option value="diet">Diet</option>
              <option value="lifespan">Lifespan</option>
            </select>
          </label>
        </div>
        <div className="filters" role="toolbar" aria-label="Filter by habitat">
          <HabitatChip
            label={`All ${BESTIARY_SPECIES.length}`}
            pressed={filters.habitat === ""}
            onClick={() => patch({ habitat: "" })}
          />
          {BESTIARY_TERRITORIES.map((territory) => (
            <HabitatChip
              key={territory.slug}
              label={territory.name}
              pressed={filters.habitat === territory.slug}
              onClick={() => patch({ habitat: territory.slug })}
            />
          ))}
        </div>
        <p className="bestiary-count" aria-live="polite">
          {shown.length === BESTIARY_SPECIES.length
            ? `${shown.length} species`
            : `${shown.length} of ${BESTIARY_SPECIES.length} species`}
        </p>
        {shown.length === 0 ? (
          <p className="bestiary-empty">No species match those filters.</p>
        ) : (
          <ul className="bestiary-gallery">
            {shown.map((row) => {
              const counts = live?.get(row.slug);
              return (
                <li key={row.slug}>
                  <a
                    className="card"
                    href={bestiaryHref(row.slug)}
                    onClick={(event) => {
                      if (
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey ||
                        event.button !== 0
                      ) {
                        return;
                      }
                      event.preventDefault();
                      onOpen(row.slug);
                    }}
                  >
                    <SpeciesPortrait
                      slug={row.slug as SpeciesSlug}
                      name={row.displayName}
                    />
                    <h2>{row.displayName}</h2>
                    <p className="meta">
                      {DIET_LABEL[row.diet]} · {GAIT_LABEL[row.gait]} ·{" "}
                      {territoryName(row.home)}
                    </p>
                    <p className="meta sub">
                      Lives {row.baseLifespanDays} days
                      {counts ? ` · ${counts.living} living` : ""}
                    </p>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function HabitatChip({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
