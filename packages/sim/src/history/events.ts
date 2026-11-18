import {
  EventKind,
  EventTemplate,
  type GeneticProfile,
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

export function discoveryEvent(input: {
  id: number;
  worldId: number;
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
    tick: 0,
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
