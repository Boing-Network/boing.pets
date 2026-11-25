import { useMemo, useState } from "react";
import { skinForSpecies } from "../view/species-skins";
import { creatureCondition, creaturesInNeed } from "./condition";
import {
  followedCreatures,
  groupCreatures,
  livingSpecies,
  needLabel,
  type FinderCreature,
} from "./finderGroups";

const NONE: ReadonlySet<number> = new Set();

type Props = {
  creatures: readonly FinderCreature[];
  /** Creatures the player follows: listed first, as "Your creatures". */
  followed?: ReadonlySet<number>;
  selectedId: number | null;
  onSelect: (id: number) => void;
};

/**
 * Search and species filter over every living creature, grouped by species
 * and tinted with each species' glow colour. Replaces a flat wall of names.
 */
export function CreatureFinder({
  creatures,
  followed = NONE,
  selectedId,
  onSelect,
}: Props) {
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
  const yours = useMemo(
    () => followedCreatures(creatures, followed),
    [creatures, followed],
  );
  const yoursInNeed = yours.filter((row) => inNeed.has(row.id)).length;
  const row = (creature: FinderCreature) => (
    <li key={creature.id}>
      <button
        type="button"
        className={
          creature.id === selectedId
            ? "inspect-picker-btn inspect-picker-btn--active"
            : "inspect-picker-btn"
        }
        aria-pressed={creature.id === selectedId}
        onClick={() => onSelect(creature.id)}
      >
        {inNeed.has(creature.id) ? (
          <span
            className="finder-need-dot"
            title={creatureCondition(creature).reasons.join(", ")}
          />
        ) : null}
        {creature.name}
      </button>
    </li>
  );

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
          {needLabel(inNeed.size, yoursInNeed)}
          <span className="finder-need-action">
            {filterNeed ? "Show all" : "Show"}
          </span>
        </button>
      ) : null}
      <p className="finder-count" aria-live="polite">
        {shown === 0 ? "No creatures match." : `${shown} shown`}
      </p>
      <div className="finder-list">
        {yours.length > 0 &&
        !filterNeed &&
        query === "" &&
        speciesId == null ? (
          <section className="finder-group finder-group--yours">
            <h4 className="finder-group-title">
              ★ Your creatures
              <span>{yours.length}</span>
            </h4>
            <ul className="inspect-picker">{yours.map(row)}</ul>
          </section>
        ) : null}
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
            <ul className="inspect-picker">{group.creatures.map(row)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
