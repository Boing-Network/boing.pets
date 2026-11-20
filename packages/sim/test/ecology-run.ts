/**
 * Ecology harness: run a whole world for many sim days. Memories and dead
 * rows are pruned every 50 ticks the way the host does after a commit, so
 * the run costs what a live world costs.
 */
import {
  CreatureStatus,
  EventKind,
  SPECIES_CATALOG,
} from "@boing-pets/contract";
import {
  createWorld,
  memoryStrength,
  step,
  type WorldSnapshot,
} from "../src/index";

export type EcologyRun = {
  counts: Map<number, number>;
  minSeen: Map<number, number>;
  maxSeen: Map<number, number>;
  births: number;
  deaths: Record<string, number>;
  total: number;
};

function prune(snapshot: WorldSnapshot, tick: number): void {
  const rules = snapshot.ruleset;
  snapshot.creatures = snapshot.creatures.filter(
    (row) => row.status === CreatureStatus.ALIVE,
  );
  const alive = new Set(snapshot.creatures.map((row) => row.id));
  snapshot.relationships = snapshot.relationships.filter(
    (row) => alive.has(row.creatureAId) && alive.has(row.creatureBId),
  );
  snapshot.memories = snapshot.memories.filter(
    (row) =>
      alive.has(row.creatureId) &&
      (row.importance >= rules.majorImportanceMin ||
        memoryStrength(row, tick, rules) !== 0),
  );
}

export function runEcology(seed: number, days: number): EcologyRun {
  const { snapshot } = createWorld(seed);
  const ticks = days * snapshot.ruleset.ticksPerDay;
  const minSeen = new Map<number, number>();
  const maxSeen = new Map<number, number>();
  const deaths: Record<string, number> = {};
  let births = 0;
  for (let i = 1; i <= ticks; i += 1) {
    const { events } = step(snapshot);
    for (const event of events) {
      if (event.kind === EventKind.BIRTH) births += 1;
      if (event.kind === EventKind.DEATH) {
        const cause = String(
          (event.payload as { cause?: string }).cause ?? "?",
        );
        deaths[cause] = (deaths[cause] ?? 0) + 1;
      }
    }
    if (i % 50 === 0 || i === ticks) {
      prune(snapshot, snapshot.world.lastTick);
      const counts = new Map<number, number>();
      for (const creature of snapshot.creatures) {
        counts.set(
          creature.speciesId,
          (counts.get(creature.speciesId) ?? 0) + 1,
        );
      }
      for (const species of SPECIES_CATALOG) {
        const n = counts.get(species.id) ?? 0;
        minSeen.set(species.id, Math.min(minSeen.get(species.id) ?? n, n));
        maxSeen.set(species.id, Math.max(maxSeen.get(species.id) ?? n, n));
      }
    }
  }
  const counts = new Map<number, number>();
  for (const creature of snapshot.creatures) {
    counts.set(creature.speciesId, (counts.get(creature.speciesId) ?? 0) + 1);
  }
  return {
    counts,
    minSeen,
    maxSeen,
    births,
    deaths,
    total: snapshot.creatures.length,
  };
}
