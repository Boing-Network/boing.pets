import { useMemo, useState } from "react";
import { skinForSpecies } from "../view/species-skins";
import {
  groupCreatures,
  livingSpecies,
  type FinderCreature,
} from "./creatureFinder";

type Props = {
  creatures: readonly FinderCreature[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

/**
 * Search and species filter over every living creature, grouped by species
 * and tinted with each species' glow colour. Replaces a flat wall of names.
 */
export function CreatureFinder({ creatures, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [speciesId, setSpeciesId] = useState<number | null>(null);
  const species = useMemo(() => livingSpecies(creatures), [creatures]);
  const groups = useMemo(
    () => groupCreatures(creatures, query, speciesId),
    [creatures, query, speciesId],
  );
  const shown = groups.reduce((n, g) => n + g.creatures.length, 0);

  return (
    <div className="finder">
      <div className="finder-controls">
        <input
          className="finder-search"
          type="search"
          value={query}
          placeholder="Search name or species"
          aria-label="Search creatures"
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="finder-species"
          aria-label="Filter by species"
          value={speciesId ?? ""}
          onChange={(event) =>
            setSpeciesId(
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        >
          <option value="">All species ({species.length})</option>
          {species.map((row) => (
            <option key={row.speciesId} value={row.speciesId}>
              {row.label} ({row.count})
            </option>
          ))}
        </select>
      </div>
      <p className="finder-count" aria-live="polite">
        {shown === 0 ? "No creatures match." : `${shown} shown`}
      </p>
      <div className="finder-list">
        {groups.map((group) => (
          <section key={group.speciesId} className="finder-group">
            <h4
              className="finder-group-title"
              style={{
                ["--dot" as string]: skinForSpecies(group.speciesId).emissive,
              }}
            >
              {group.label}
              <span>{group.creatures.length}</span>
            </h4>
            <ul className="inspect-picker">
              {group.creatures.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={
                      row.id === selectedId
                        ? "inspect-picker-btn inspect-picker-btn--active"
                        : "inspect-picker-btn"
                    }
                    aria-pressed={row.id === selectedId}
                    onClick={() => onSelect(row.id)}
                  >
                    {row.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
