/**
 * Postgres-backed WorldRepository. Explicit ids only; one transaction per commit.
 * Host rate-limit accept times live in a sidecar JSON file (not a sim table).
 */
import {
  assetMintLinkToDb,
  catchupReportToDb,
  compatibilityToDb,
  createDbClient,
  creatureNftLinkToDb,
  creatureToDb,
  influenceToDb,
  lineageToDb,
  mapAssetMintLink,
  mapCatchupReport,
  mapCompatibility,
  mapCreature,
  mapCreatureNftLink,
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
import type { AssetMintLinkRow } from "../boing/asset-mint-link";
import type {
  InfluenceAccountRow,
  InventoryLotRow,
  ItemChange,
} from "../items/types";
import type { CreatureNftLinkRow } from "../boing/nft-link";
import type { HostMetaStore } from "./host-meta";
import type {
  CommitBatch,
  DurableTables,
  PersistedHostClock,
  WorldRepository,
} from "./repository";

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

    // NFT links live outside the hot snapshot; load empty here and use
    // readCreatureNftLinks / upsertCreatureNftLink for the mint edge.
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
      influenceAcceptedByAccount: { ...hostMeta.influenceAcceptedByAccount },
      hostClock: hostMeta.hostClock ?? null,
      events: events.map(mapWorldEvent),
      catchups: catchups.map(mapCatchupReport),
      creatureNftLinks: [],
      assetMintLinks: [],
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
      hostClock: tables.hostClock ?? null,
      influenceAcceptedAtMs: [...tables.influenceAcceptedAtMs],
      influenceAcceptedByAccount: {
        ...(tables.influenceAcceptedByAccount ?? {
          local: [...tables.influenceAcceptedAtMs],
        }),
      },
    });
  }

  async commit(batch: CommitBatch): Promise<void> {
    const worldId = toBigInt(batch.world.id);

    await this.#client.$transaction(async (tx) => {
      await tx.world.update({
        where: { id: worldId },
        data: worldHeaderUpdateToDb(batch.world, batch.ruleset),
      });

      // Introduce-species migration: species, compatibility, and the new
      // founders' lineages must exist before the creatures that reference
      // them (creature → species / lineage foreign keys).
      for (const row of batch.upsertSpecies ?? []) {
        const data = speciesToDb(row);
        await tx.species.upsert({
          where: { id: toBigInt(row.id) },
          create: data,
          update: { diet: data.diet },
        });
      }
      if (batch.insertCompatibility && batch.insertCompatibility.length > 0) {
        await tx.speciesCompatibility.createMany({
          data: batch.insertCompatibility.map(compatibilityToDb),
        });
      }
      const newLineageIds = new Set(
        batch.insertCreatures.map((row) => row.lineageId),
      );
      for (const row of batch.upsertLineages) {
        if (!newLineageIds.has(row.id)) continue;
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

    if (
      batch.influenceAcceptedAtMs != null ||
      batch.influenceAcceptedByAccount != null
    ) {
      const current = await this.#hostMeta.read();
      const byAccount = {
        ...current.influenceAcceptedByAccount,
        ...(batch.influenceAcceptedByAccount ?? {}),
      };
      if (
        batch.influenceAcceptedAtMs != null &&
        batch.influenceAcceptedByAccount == null
      ) {
        byAccount.local = [...batch.influenceAcceptedAtMs];
      }
      const local = byAccount.local ?? batch.influenceAcceptedAtMs ?? [];
      await this.#hostMeta.write({
        ...current,
        influenceAcceptedAtMs: [...local],
        influenceAcceptedByAccount: byAccount,
      });
    }
  }

  async readHostClock(): Promise<PersistedHostClock | null> {
    return (await this.#hostMeta.read()).hostClock ?? null;
  }

  async writeHostClock(clock: PersistedHostClock): Promise<void> {
    const current = await this.#hostMeta.read();
    await this.#hostMeta.write({
      ...current,
      hostClock: { scale: clock.scale },
    });
  }

  async readCreatureNftLinks(): Promise<CreatureNftLinkRow[]> {
    const rows = await this.#client.creatureNftLink.findMany({
      orderBy: { creatureId: "asc" },
    });
    return rows.map(mapCreatureNftLink);
  }

  async upsertCreatureNftLink(row: CreatureNftLinkRow): Promise<void> {
    const data = creatureNftLinkToDb(row);
    await this.#client.creatureNftLink.upsert({
      where: { creatureId: data.creatureId },
      create: data,
      update: {
        birthEventId: data.birthEventId,
        genesis: data.genesis,
        collectionHex: data.collectionHex,
        tokenIdHex: data.tokenIdHex,
        chainId: data.chainId,
        templateArtifact: data.templateArtifact,
        templateVersion: data.templateVersion,
        mintTxHex: data.mintTxHex,
        status: data.status,
        lastError: data.lastError,
        updatedAt: data.updatedAt,
      },
    });
  }

  async readAssetMintLinks(): Promise<AssetMintLinkRow[]> {
    const rows = await this.#client.assetMintLink.findMany({
      orderBy: [{ worldId: "asc" }, { tokenClass: "asc" }, { mintKey: "asc" }],
    });
    return rows.map(mapAssetMintLink);
  }

  async upsertAssetMintLink(row: AssetMintLinkRow): Promise<void> {
    const data = assetMintLinkToDb(row);
    await this.#client.assetMintLink.upsert({
      where: {
        worldId_tokenClass_mintKey: {
          worldId: data.worldId,
          tokenClass: data.tokenClass,
          mintKey: data.mintKey,
        },
      },
      create: data,
      update: {
        lineageId: data.lineageId,
        artifactKind: data.artifactKind,
        tokenSerial: data.tokenSerial,
        itemKindId: data.itemKindId,
        amount: data.amount,
        itemSlug: data.itemSlug,
        recipientHex: data.recipientHex,
        collectionHex: data.collectionHex,
        tokenIdHex: data.tokenIdHex,
        chainId: data.chainId,
        templateArtifact: data.templateArtifact,
        templateVersion: data.templateVersion,
        mintTxHex: data.mintTxHex,
        status: data.status,
        lastError: data.lastError,
        updatedAt: data.updatedAt,
      },
    });
  }

  async readInventoryLots(worldId: number): Promise<InventoryLotRow[]> {
    const rows = await this.#client.inventoryLot.findMany({
      where: { worldId: BigInt(worldId) },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => ({
      id: Number(row.id),
      worldId: Number(row.worldId),
      accountId: row.accountId,
      sourceKey: row.sourceKey,
      itemSlug: row.itemSlug,
      amount: row.amount,
      remaining: row.remaining,
      gainedTick: Number(row.gainedTick),
      spoilsAtTick: row.spoilsAtTick == null ? null : Number(row.spoilsAtTick),
      createdAtMs: row.createdAt.getTime(),
      updatedAtMs: row.updatedAt.getTime(),
    }));
  }

  async readInfluenceAccounts(worldId: number): Promise<InfluenceAccountRow[]> {
    const rows = await this.#client.influenceAccount.findMany({
      where: { worldId: BigInt(worldId) },
      orderBy: { influenceId: "asc" },
    });
    return rows.map((row) => ({
      influenceId: Number(row.influenceId),
      worldId: Number(row.worldId),
      accountId: row.accountId,
      kind: row.kind,
      lineageId: row.lineageId == null ? null : Number(row.lineageId),
      territoryId: row.territoryId == null ? null : Number(row.territoryId),
      itemSlug: row.itemSlug,
      acceptedAtMs: row.acceptedAt.getTime(),
    }));
  }

  async commitItems(change: ItemChange): Promise<void> {
    await this.#client.$transaction(async (tx) => {
      for (const row of change.upsertLots) {
        await tx.inventoryLot.upsert({
          where: {
            worldId_sourceKey: {
              worldId: BigInt(row.worldId),
              sourceKey: row.sourceKey,
            },
          },
          create: {
            id: BigInt(row.id),
            worldId: BigInt(row.worldId),
            accountId: row.accountId,
            sourceKey: row.sourceKey,
            itemSlug: row.itemSlug,
            amount: row.amount,
            remaining: row.remaining,
            gainedTick: BigInt(row.gainedTick),
            spoilsAtTick:
              row.spoilsAtTick == null ? null : BigInt(row.spoilsAtTick),
            createdAt: new Date(row.createdAtMs),
            updatedAt: new Date(row.updatedAtMs),
          },
          update: {
            remaining: row.remaining,
            updatedAt: new Date(row.updatedAtMs),
          },
        });
      }
      if (change.insertInfluenceAccounts.length > 0) {
        await tx.influenceAccount.createMany({
          data: change.insertInfluenceAccounts.map((row) => ({
            influenceId: BigInt(row.influenceId),
            worldId: BigInt(row.worldId),
            accountId: row.accountId,
            kind: row.kind,
            lineageId: row.lineageId == null ? null : BigInt(row.lineageId),
            territoryId:
              row.territoryId == null ? null : BigInt(row.territoryId),
            itemSlug: row.itemSlug,
            acceptedAt: new Date(row.acceptedAtMs),
          })),
          skipDuplicates: true,
        });
      }
    });
  }
}
