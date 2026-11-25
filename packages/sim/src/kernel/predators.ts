/**
 * Predators: when a hazard strikes where a stronger meat-eater of another
 * species is about, the blow is often its doing. The predator is fed by it,
 * the victim remembers who it was, and the news names them both.
 *
 * This puts a face on a hazard hit; it adds no hits of its own, so the odds
 * of being hurt stay those of `HAZARD_RULES`.
 */
import {
  Action,
  CreatureStatus,
  Diet,
  MemoryKind,
  MemoryTag,
} from "@boing-pets/contract";
import { rememberFor } from "../ai/actions";
import { clamp } from "../math";
import { rngInt } from "../rng";
import type { CreatureRow, SpeciesRow, WorldSnapshot } from "../types";
import { dietOf } from "./biology";

export const PREDATOR_RULES = {
  /** Share of hits that are a predator's, per cent, when one is about. */
  attackPercent: 60,
  /** Hunger a predator sheds for a wounding attack and for a kill. */
  hungerReliefHurt: 150,
  hungerReliefKill: 350,
  /** The victim's THREAT memory of the attacker. */
  memoryImportance: 45,
  memoryEmotion: -700,
} as const;

/** Living meat-eaters by territory id, each list in id order. */
export function carnivoresByTerritory(
  creatures: readonly CreatureRow[],
  speciesById: ReadonlyMap<number, SpeciesRow>,
): Map<number, CreatureRow[]> {
  const out = new Map<number, CreatureRow[]>();
  for (const creature of creatures) {
    if (creature.status !== CreatureStatus.ALIVE) continue;
    const diet = dietOf(
      speciesById.get(creature.speciesId),
      creature.speciesId,
    );
    if (diet !== Diet.CARNIVORE) continue;
    const list = out.get(creature.territoryId);
    if (list) list.push(creature);
    else out.set(creature.territoryId, [creature]);
  }
  for (const list of out.values()) list.sort((a, b) => a.id - b.id);
  return out;
}

/**
 * The predator behind this tick's hit on `victim`, or null when it was the
 * land itself. A predator is a living meat-eater of another species, at
 * least as strong as the victim, that is neither nursing nor on the road.
 */
export function pickPredator(
  victim: CreatureRow,
  carnivores: readonly CreatureRow[] | undefined,
  seed: number,
  tick: number,
): CreatureRow | null {
  if (!carnivores || carnivores.length === 0) return null;
  const able = carnivores.filter(
    (row) =>
      row.id !== victim.id &&
      row.status === CreatureStatus.ALIVE &&
      row.speciesId !== victim.speciesId &&
      row.territoryId === victim.territoryId &&
      row.currentAction !== Action.NURSE &&
      row.currentAction !== Action.RELOCATE &&
      row.geneStrength >= victim.geneStrength,
  );
  if (able.length === 0) return null;
  if (
    rngInt(seed, tick, "hazard", victim.id, 2, 0, 99) >=
    PREDATOR_RULES.attackPercent
  ) {
    return null;
  }
  return able[rngInt(seed, tick, "hazard", victim.id, 3, 0, able.length - 1)]!;
}

/** Feed the predator; a surviving victim remembers the attack. */
export function resolveAttack(
  snapshot: WorldSnapshot,
  predator: CreatureRow,
  victim: CreatureRow,
  tick: number,
  killed: boolean,
): void {
  predator.hunger = clamp(
    predator.hunger -
      (killed
        ? PREDATOR_RULES.hungerReliefKill
        : PREDATOR_RULES.hungerReliefHurt),
    0,
    1000,
  );
  if (killed) return;
  rememberFor(
    snapshot,
    victim,
    tick,
    MemoryKind.THREAT,
    PREDATOR_RULES.memoryImportance,
    PREDATOR_RULES.memoryEmotion,
    predator.id,
    victim.territoryId,
    [MemoryTag.INJURY],
    "threat.attack.v1",
  );
}
