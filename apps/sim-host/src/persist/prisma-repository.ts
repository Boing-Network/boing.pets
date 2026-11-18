/**
 * Postgres-backed WorldRepository. Explicit ids only; one transaction per commit.
 * Host rate-limit accept times live in a sidecar JSON file (not a sim table).
 */
import {
  catchupReportToDb,
  compatibilityToDb,
  createDbClient,
  creatureToDb,
  influenceToDb,
  lineageToDb,
  mapCatchupReport,
  mapCompatibility,
  mapCreature,
  mapInfluence,
  mapLineage,
  mapMemory,
  mapRelationship,
  mapRuleset,
  mapSpecies,
  mapTerritory,
  mapTerritoryLink,
  mapTerritoryModifier,
  mapWorldEvent,
  mapWorldHeader,
  memoryToDb,
  relationshipToDb,
  speciesToDb,
  territoryLinkToDb,
  territoryModifierToDb,
  territoryToDb,
  toBigInt,
  worldEventToDb,
  worldHeaderToDb,
  worldHeaderUpdateToDb,
  type DbClient,
} from "@boing-pets/db";
import type { HostMetaStore } from "./host-meta";
import type { CommitBatch, DurableTables, WorldRepository } from "./repository";

export type PrismaWorldRepositoryOptions = {
  client?: DbClient;
  hostMeta: HostMetaStore;
};

export class PrismaWorldRepository implements WorldRepository {
  readonly #client: DbClient;
  readonly #hostMeta: HostMetaStore;
  readonly #ownsClient: boolean;

  constructor(options: PrismaWorldRepositoryOptions) {
    this.#ownsClient = options.client == null;
    this.#client = options.client ?? createDbClient();
    this.#hostMeta = options.hostMeta;
  }

  get client(): DbClient {
    return this.#client;
  }

  async dispose(): Promise<void> {
    if (this.#ownsClient) {
      await this.#client.$disconnect();
    }
  }

  async readTables(): Promise<DurableTables | null> {
    const world = await this.#client.world.findFirst({
      orderBy: { id: "asc" },
    });
    if (world == null) return null;

    const worldId = world.id;
    const [
      species,
      compatibility,
      territories,
      links,
      modifiers,
      lineages,
      creatures,
      relationships,
      memories,
      influences,
      events,
      catchups,
      hostMeta,
    ] = await Promise.all([
      this.#client.species.findMany({
        where: { worldId },
        orderBy: { id: "asc" },
      }),
      this.#client.speciesCompatibility.findMany({
        where: { worldId },
        orderBy: [{ speciesLowId: "asc" }, { speciesHighId: "asc" }],
      }),
      this.#client.territory.findMany({
        where: { worldId },
        orderBy: { id: "asc" },
      }),
      this.#client.territoryLink.findMany({
        where: { worldId },
        orderBy: [{ fromId: "asc" }, { toId: "asc" }],
      }),
      this.#client.territoryModifier.findMany({
        where: { worldId },
        orderBy: { id: "asc" },
      }),
      this.#client.lineage.findMany({
        where: { worldId },
        orderBy: { id: "asc" },
      }),
      this.#client.creature.findMany({
        where: { worldId },
        orderBy: { id: "asc" },
      }),
      this.#client.relationship.findMany({
        where: { worldId },
        orderBy: { id: "asc" },
      }),
      this.#client.memory.findMany({
        where: { worldId },
        orderBy: { id: "asc" },
      }),
      this.#client.playerInfluence.findMany({
        where: { worldId },
        orderBy: { id: "asc" },
      }),
      this.#client.worldEvent.findMany({
        where: { worldId },
        orderBy: [{ tick: "asc" }, { id: "asc" }],
      }),
      this.#client.catchupReport.findMany({
        where: { worldId },
        orderBy: { id: "asc" },
      }),
      this.#hostMeta.read(),
    ]);

    return {
      world: mapWorldHeader(world),
      ruleset: mapRuleset(world),
      species: species.map(mapSpecies),
      compatibility: compatibility.map(mapCompatibility),
      territories: territories.map(mapTerritory),
      links: links.map(mapTerritoryLink),
      modifiers: modifiers.map(mapTerritoryModifier),
      lineages: lineages.map(mapLineage),
      creatures: creatures.map(mapCreature),
      relationships: relationships.map(mapRelationship),
      memories: memories.map(mapMemory),
      influences: influences.map(mapInfluence),
      influenceAcceptedAtMs: [...hostMeta.influenceAcceptedAtMs],
      events: events.map(mapWorldEvent),
      catchups: catchups.map(mapCatchupReport),
    };
  }

  async insertWorld(tables: DurableTables): Promise<void> {
    const existing = await this.#client.world.count();
    if (existing > 0) throw new Error("world already exists");

    await this.#client.$transaction(async (tx) => {
      await tx.world.create({
        data: worldHeaderToDb(tables.world, tables.ruleset),
      });
      if (tables.species.length > 0) {
        await tx.species.createMany({
          data: tables.species.map(speciesToDb),
        });
      }
      if (tables.compatibility.length > 0) {
        await tx.speciesCompatibility.createMany({
          data: tables.compatibility.map(compatibilityToDb),
        });
      }
      if (tables.territories.length > 0) {
        await tx.territory.createMany({
          data: tables.territories.map(territoryToDb),
        });
      }
      if (tables.links.length > 0) {
        await tx.territoryLink.createMany({
          data: tables.links.map(territoryLinkToDb),
        });
      }
      if (tables.lineages.length > 0) {
        await tx.lineage.createMany({
          data: tables.lineages.map(lineageToDb),
        });
      }
      if (tables.creatures.length > 0) {
        await tx.creature.createMany({
          data: tables.creatures.map(creatureToDb),
        });
      }
      if (tables.relationships.length > 0) {
        await tx.relationship.createMany({
          data: tables.relationships.map(relationshipToDb),
        });
      }
      if (tables.memories.length > 0) {
        await tx.memory.createMany({
          data: tables.memories.map(memoryToDb),
        });
      }
      if (tables.modifiers.length > 0) {
        await tx.territoryModifier.createMany({
          data: tables.modifiers.map(territoryModifierToDb),
        });
      }
      if (tables.influences.length > 0) {
        await tx.playerInfluence.createMany({
          data: tables.influences.map(influenceToDb),
        });
      }
      if (tables.events.length > 0) {
        await tx.worldEvent.createMany({
          data: tables.events.map(worldEventToDb),
        });
      }
      if (tables.catchups.length > 0) {
        await tx.catchupReport.createMany({
          data: tables.catchups.map(catchupReportToDb),
        });
      }
    });

    await this.#hostMeta.write({
      influenceAcceptedAtMs: [...tables.influenceAcceptedAtMs],
    });
  }

  async commit(batch: CommitBatch): Promise<void> {
    const worldId = toBigInt(batch.world.id);

    await this.#client.$transaction(async (tx) => {
      await tx.world.update({
        where: { id: worldId },
        data: worldHeaderUpdateToDb(batch.world, batch.ruleset),
      });

      if (batch.insertCreatures.length > 0) {
        await tx.creature.createMany({
          data: batch.insertCreatures.map(creatureToDb),
        });
      }
      for (const row of batch.updateCreatures) {
        const { id: _id, worldId: _worldId, ...data } = creatureToDb(row);
        void _id;
        void _worldId;
        await tx.creature.update({
          where: { id: toBigInt(row.id) },
          data,
        });
      }

      if (batch.insertRelationships.length > 0) {
        await tx.relationship.createMany({
          data: batch.insertRelationships.map(relationshipToDb),
        });
      }
      for (const row of batch.updateRelationships) {
        const {
          id: _id,
          worldId: _worldId,
          creatureAId: _a,
          creatureBId: _b,
          ...data
        } = relationshipToDb(row);
        void _id;
        void _worldId;
        void _a;
        void _b;
        await tx.relationship.update({
          where: { id: toBigInt(row.id) },
          data,
        });
      }

      if (batch.insertMemories.length > 0) {
        await tx.memory.createMany({
          data: batch.insertMemories.map(memoryToDb),
        });
      }
      if (batch.archiveMemoryIds.length > 0) {
        await tx.memory.updateMany({
          where: { id: { in: batch.archiveMemoryIds.map(toBigInt) } },
          data: { archived: true },
        });
      }

      if (batch.insertModifiers.length > 0) {
        await tx.territoryModifier.createMany({
          data: batch.insertModifiers.map(territoryModifierToDb),
        });
      }

      for (const row of batch.upsertLineages) {
        await tx.lineage.upsert({
          where: { id: toBigInt(row.id) },
          create: lineageToDb(row),
          update: {
            name: row.name,
            playerFavor: row.playerFavor,
            founderCreatureId: lineageToDb(row).founderCreatureId,
          },
        });
      }

      if (batch.insertEvents.length > 0) {
        await tx.worldEvent.createMany({
          data: batch.insertEvents.map(worldEventToDb),
        });
      }

      if (batch.insertInfluences.length > 0) {
        await tx.playerInfluence.createMany({
          data: batch.insertInfluences.map(influenceToDb),
        });
      }
      if (batch.appliedInfluenceIds.length > 0) {
        await tx.playerInfluence.updateMany({
          where: { id: { in: batch.appliedInfluenceIds.map(toBigInt) } },
          data: { applied: true },
        });
      }

      if (batch.insertCatchup != null) {
        await tx.catchupReport.create({
          data: catchupReportToDb(batch.insertCatchup),
        });
      }
    });

    if (batch.influenceAcceptedAtMs != null) {
      await this.#hostMeta.write({
        influenceAcceptedAtMs: [...batch.influenceAcceptedAtMs],
      });
    }
  }
}
