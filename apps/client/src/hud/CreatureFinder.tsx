import { useMemo, useState } from "react";
import { skinForSpecies } from "../view/species-skins";
import { creatureCondition, creaturesInNeed } from "./condition";
import {
  groupCreatures,
  livingSpecies,
  type FinderCreature,
} from "./finderGroups";

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
  const [needOnly, setNeedOnly] = useState(false);
  const inNeed = useMemo(
    () => new Set(creaturesInNeed(creatures).map((row) => row.id)),
    [creatures],
  );
  // Nothing left to help: fall back to the full list.
  const filterNeed = needOnly && inNeed.size > 0;
  const groups = useMemo(
    () =>
      groupCreatures(creatures, query, speciesId, filterNeed ? inNeed : null),
    [creatures, query, speciesId, filterNeed, inNeed],
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
      {inNeed.size > 0 ? (
        <button
          type="button"
          className={filterNeed ? "finder-need finder-need--on" : "finder-need"}
          aria-pressed={filterNeed}
          onClick={() => setNeedOnly(!filterNeed)}
        >
          <span className="finder-need-dot" aria-hidden="true" />
          {inNeed.size === 1
            ? "1 creature needs help"
            : `${inNeed.size} creatures need help`}
          <span className="finder-need-action">
            {filterNeed ? "Show all" : "Show"}
          </span>
        </button>
      ) : null}
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
                    {inNeed.has(row.id) ? (
                      <span
                        className="finder-need-dot"
                        title={creatureCondition(row).reasons.join(", ")}
                      />
                    ) : null}
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
