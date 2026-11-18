import {
  DeathCause,
  EventKind,
  EventTemplate,
  type GeneticProfile,
  type MigrationReason,
} from "@boing-pets/contract";
import type { WorldEvent } from "../types";

/** `{name} founded the {lineage} line in {territory}.` */
export function founderBirthSummary(
  name: string,
  lineageStem: string,
  territoryName: string,
): string {
  return `${name} founded the ${lineageStem} line in ${territoryName}.`;
}

/** `{name} of {lineage} discovered {territory}.` `{lineage}` is the stored line name. */
export function discoverySummary(
  name: string,
  lineageName: string,
  territoryName: string,
): string {
  return `${name} of ${lineageName} discovered ${territoryName}.`;
}

export function founderBirthEvent(input: {
  id: number;
  worldId: number;
  creatureId: number;
  lineageId: number;
  speciesId: number;
  territoryId: number;
  name: string;
  lineageStem: string;
  territoryName: string;
  genes: GeneticProfile;
}): WorldEvent {
  return {
    id: input.id,
    worldId: input.worldId,
    tick: 0,
    kind: EventKind.BIRTH,
    actorId: input.creatureId,
    subjectId: null,
    territoryId: input.territoryId,
    lineageId: input.lineageId,
    summary: founderBirthSummary(
      input.name,
      input.lineageStem,
      input.territoryName,
    ),
    payload: {
      template: EventTemplate.BIRTH_FOUNDER,
      motherId: null,
      fatherId: null,
      lineageId: input.lineageId,
      speciesId: input.speciesId,
      genes: input.genes,
      mutations: [],
      territoryId: input.territoryId,
    },
  };
}

function deathCausePhrase(cause: DeathCause): string {
  switch (cause) {
    case DeathCause.OLD_AGE:
      return "old age";
    case DeathCause.STARVATION:
      return "starvation";
    case DeathCause.THIRST:
      return "thirst";
    case DeathCause.ILLNESS:
      return "illness";
    case DeathCause.INJURY:
      return "injury";
    default: {
      const never: never = cause;
      return never;
    }
  }
}

/** `{name} died of {cause} in {territory} at age {ageDays}.` */
export function deathSummary(
  name: string,
  cause: DeathCause,
  territoryName: string,
  ageDays: number,
): string {
  return `${name} died of ${deathCausePhrase(cause)} in ${territoryName} at age ${ageDays}.`;
}

export function deathEvent(input: {
  id: number;
  worldId: number;
  tick: number;
  creatureId: number;
  lineageId: number;
  territoryId: number;
  name: string;
  cause: DeathCause;
  territoryName: string;
  ageDays: number;
  gestationLost: boolean;
}): WorldEvent {
  return {
    id: input.id,
    worldId: input.worldId,
    tick: input.tick,
    kind: EventKind.DEATH,
    actorId: input.creatureId,
    subjectId: null,
    territoryId: input.territoryId,
    lineageId: input.lineageId,
    summary: deathSummary(
      input.name,
      input.cause,
      input.territoryName,
      input.ageDays,
    ),
    payload: {
      template: EventTemplate.DEATH,
      cause: input.cause,
      ageDays: input.ageDays,
      territoryId: input.territoryId,
      gestationLost: input.gestationLost,
    },
  };
}

/** `{name} moved from {from} to {to}.` */
export function migrationSummary(
  name: string,
  fromTerritory: string,
  toTerritory: string,
): string {
  return `${name} moved from ${fromTerritory} to ${toTerritory}.`;
}

export function migrationEvent(input: {
  id: number;
  worldId: number;
  tick: number;
  creatureId: number;
  lineageId: number;
  fromTerritoryId: number;
  toTerritoryId: number;
  name: string;
  fromTerritory: string;
  toTerritory: string;
  reason: MigrationReason;
}): WorldEvent {
  return {
    id: input.id,
    worldId: input.worldId,
    tick: input.tick,
    kind: EventKind.MIGRATION,
    actorId: input.creatureId,
    subjectId: null,
    territoryId: input.toTerritoryId,
    lineageId: input.lineageId,
    summary: migrationSummary(
      input.name,
      input.fromTerritory,
      input.toTerritory,
    ),
    payload: {
      template: EventTemplate.MIGRATION,
      creatureId: input.creatureId,
      fromTerritoryId: input.fromTerritoryId,
      toTerritoryId: input.toTerritoryId,
      reason: input.reason,
    },
  };
}

export function discoveryEvent(input: {
  id: number;
  worldId: number;
  tick: number;
  creatureId: number;
  lineageId: number;
  territoryId: number;
  name: string;
  lineageName: string;
  territoryName: string;
}): WorldEvent {
  return {
    id: input.id,
    worldId: input.worldId,
    tick: input.tick,
    kind: EventKind.DISCOVERY,
    actorId: input.creatureId,
    subjectId: null,
    territoryId: input.territoryId,
    lineageId: input.lineageId,
    summary: discoverySummary(
      input.name,
      input.lineageName,
      input.territoryName,
    ),
    payload: {
      template: EventTemplate.DISCOVERY,
      creatureId: input.creatureId,
      territoryId: input.territoryId,
      lineageId: input.lineageId,
    },
  };
}
