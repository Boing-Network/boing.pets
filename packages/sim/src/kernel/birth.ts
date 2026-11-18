/**
 * Birth phase: mothers with `gestationEndTick == tick` deliver one child.
 * Litter size is ruleset-driven; v1 freezes it at 1.
 */
import {
  Action,
  ActionTargetKind,
  CreatureStatus,
  Gender,
  Goal,
  MemoryKind,
} from "@boing-pets/contract";
import {
  generateName,
  inheritGenes,
  inheritPersonality,
  rollGender,
} from "../genetics/inherit";
import { birthEvent } from "../history/events";
import { initialMemoryStrength } from "../memories/strength";
import { createParentChildRelationship } from "../relationships/delta";
import type { CreatureRow, WorldEvent, WorldSnapshot } from "../types";

const FIRST_CHILD_IMPORTANCE = 80;
const FIRST_CHILD_EMOTION = 850;

function take(
  snapshot: WorldSnapshot,
  key: "nextCreatureId" | "nextEventId" | "nextMemoryId",
): number {
  const id = snapshot.world[key];
  snapshot.world[key] = id + 1;
  return id;
}

function usedNames(snapshot: WorldSnapshot): Set<string> {
  return new Set(snapshot.creatures.map((creature) => creature.name));
}

function hasFirstChildMemory(
  snapshot: WorldSnapshot,
  parentId: number,
): boolean {
  return snapshot.memories.some(
    (memory) =>
      memory.creatureId === parentId && memory.kind === MemoryKind.FIRST_CHILD,
  );
}

function rememberFirstChild(
  snapshot: WorldSnapshot,
  parent: CreatureRow,
  childId: number,
  tick: number,
): void {
  if (hasFirstChildMemory(snapshot, parent.id)) return;
  snapshot.memories.push({
    id: take(snapshot, "nextMemoryId"),
    worldId: snapshot.world.id,
    creatureId: parent.id,
    tick,
    kind: MemoryKind.FIRST_CHILD,
    importance: FIRST_CHILD_IMPORTANCE,
    emotionalValue: FIRST_CHILD_EMOTION,
    initialStrength: initialMemoryStrength(
      FIRST_CHILD_IMPORTANCE,
      snapshot.ruleset,
    ),
    subjectCreatureId: childId,
    territoryId: null,
    payload: { tags: [], template: "first_child.v1" },
    archived: false,
  });
}

function deliverChild(
  snapshot: WorldSnapshot,
  mother: CreatureRow,
  father: CreatureRow,
  tick: number,
  events: WorldEvent[],
): void {
  const rules = snapshot.ruleset;
  if (rules.litterSize !== 1) throw new Error("litterSize");
  const species = snapshot.species.find((row) => row.id === mother.speciesId);
  const territory = snapshot.territories.find(
    (row) => row.id === mother.territoryId,
  );
  if (!species || !territory) throw new Error("birth");

  const childId = take(snapshot, "nextCreatureId");
  const seed = snapshot.world.seed;
  const { genes, mutations } = inheritGenes(
    seed,
    tick,
    childId,
    mother,
    father,
    rules,
  );
  const personality = inheritPersonality(
    seed,
    tick,
    childId,
    mother,
    father,
    species,
    genes,
    rules,
  );
  const names = usedNames(snapshot);
  const name = generateName(seed, tick, childId, names);
  const gender = rollGender(seed, tick, childId);
  const generation = Math.max(mother.generation, father.generation) + 1;

  const child: CreatureRow = {
    id: childId,
    worldId: snapshot.world.id,
    name,
    nameGivenByPlayer: false,
    speciesId: mother.speciesId,
    gender,
    status: CreatureStatus.ALIVE,
    birthTick: tick,
    deathTick: null,
    deathCause: null,
    territoryId: mother.territoryId,
    lineageId: mother.lineageId,
    motherId: mother.id,
    fatherId: father.id,
    generation,
    geneStrength: genes.strength,
    geneSpeed: genes.speed,
    geneIntelligence: genes.intelligence,
    geneCuriosity: genes.curiosity,
    geneSociability: genes.sociability,
    genesExtra: { ...genes.extra },
    traitCuriosity: personality.curiosity,
    traitAggression: personality.aggression,
    traitLoyalty: personality.loyalty,
    traitSociability: personality.sociability,
    traitBravery: personality.bravery,
    traitRiskTaking: personality.riskTaking,
    personalityExtra: { ...personality.extra },
    hunger: 200,
    thirst: 200,
    fatigue: 100,
    discomfort: 100,
    unsafety: 100,
    loneliness: 300,
    health: 800,
    currentGoal: Goal.IDLE,
    currentAction: Action.NURSE,
    actionTargetKind: ActionTargetKind.NONE,
    actionTargetId: null,
    actionStartedTick: tick,
    actionEndsTick: tick + 1,
    gestationSireId: null,
    gestationEndTick: null,
    mateCooldownUntilTick: null,
  };

  snapshot.creatures.push(child);
  createParentChildRelationship(snapshot, mother.id, childId, tick);
  createParentChildRelationship(snapshot, father.id, childId, tick);
  rememberFirstChild(snapshot, mother, childId, tick);
  rememberFirstChild(snapshot, father, childId, tick);

  events.push(
    birthEvent({
      id: take(snapshot, "nextEventId"),
      worldId: snapshot.world.id,
      tick,
      childId,
      motherId: mother.id,
      fatherId: father.id,
      lineageId: mother.lineageId,
      speciesId: mother.speciesId,
      territoryId: mother.territoryId,
      name: child.name,
      motherName: mother.name,
      fatherName: father.name,
      territoryName: territory.name,
      genes,
      mutations,
    }),
  );

  mother.gestationSireId = null;
  mother.gestationEndTick = null;
}

/**
 * Phase 4. Mothers still ALIVE with `gestationEndTick == tick`, ascending id.
 * A mother who died in phase 3 does not deliver.
 */
export function resolveBirths(
  snapshot: WorldSnapshot,
  tick: number,
  events: WorldEvent[],
): void {
  const mothers = snapshot.creatures
    .filter(
      (creature) =>
        creature.status === CreatureStatus.ALIVE &&
        creature.gender === Gender.FEMALE &&
        creature.gestationEndTick === tick,
    )
    .sort((a, b) => a.id - b.id);

  for (const mother of mothers) {
    const sireId = mother.gestationSireId;
    if (sireId == null) throw new Error("gestationSireId");
    const father = snapshot.creatures.find((row) => row.id === sireId);
    if (!father) throw new Error("sire");
    deliverChild(snapshot, mother, father, tick, events);
  }
}
