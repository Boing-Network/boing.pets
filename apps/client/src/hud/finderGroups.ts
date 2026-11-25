/**
 * Creature finder logic: filter and group living creatures by species so a
 * world with dozens of them stays navigable. Pure, so it is unit-tested.
 */
import { CreatureStatus } from "@boing-pets/contract";
import { speciesLabel } from "../view/species-skins";

export type FinderCreature = {
  id: number;
  name: string;
  speciesId: number;
  status: string;
  territoryId: number | null;
  health?: number;
  needs?: { hunger: number; thirst: number };
};

export type FinderGroup = {
  speciesId: number;
  label: string;
  creatures: FinderCreature[];
};

export function groupCreatures(
  creatures: readonly FinderCreature[],
  query: string,
  speciesFilter: number | null,
  /** When set, only these creature ids are listed. */
  only: ReadonlySet<number> | null = null,
): FinderGroup[] {
  const q = query.trim().toLowerCase();
  const groups = new Map<number, FinderGroup>();
  for (const creature of creatures) {
    if (creature.status !== CreatureStatus.ALIVE) continue;
    if (speciesFilter != null && creature.speciesId !== speciesFilter) continue;
    if (only != null && !only.has(creature.id)) continue;
    const label = speciesLabel(creature.speciesId);
    if (
      q &&
      !creature.name.toLowerCase().includes(q) &&
      !label.toLowerCase().includes(q)
    ) {
      continue;
    }
    const group = groups.get(creature.speciesId) ?? {
      speciesId: creature.speciesId,
      label,
      creatures: [],
    };
    group.creatures.push(creature);
    groups.set(creature.speciesId, group);
  }
  const out = [...groups.values()];
  for (const group of out) {
    group.creatures.sort((a, b) => a.name.localeCompare(b.name));
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/** Species that have at least one living creature, with counts, A–Z. */
export function livingSpecies(
  creatures: readonly FinderCreature[],
): Array<{ speciesId: number; label: string; count: number }> {
  const counts = new Map<number, number>();
  for (const creature of creatures) {
    if (creature.status !== CreatureStatus.ALIVE) continue;
    counts.set(creature.speciesId, (counts.get(creature.speciesId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([speciesId, count]) => ({
      speciesId,
      label: speciesLabel(speciesId),
      count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
