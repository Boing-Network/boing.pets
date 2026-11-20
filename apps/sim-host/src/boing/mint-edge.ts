/**
 * Host mint edge. M20 queues unique creature NFT mints after BIRTH commit.
 * M21 adds taxonomy hooks for UNIQUE_LINEAGE_ARTIFACT and COMPRESSED_ITEM.
 * Never invoked from packages/sim or step().
 */
import {
  ensure0xHex,
  hexToBytes,
  senderHexFromSecretKey,
} from "@boing-network/boing-sdk";
import {
  assetMintLinkId,
  MemoryAssetMintLinkStore,
  NftMintStatus,
  tokenIdHexForArtifactSerial,
  tokenIdHexForCompressedItem,
  UNCONFIGURED_COLLECTION_HEX,
  type AssetMintLinkRow,
  type AssetMintLinkStore,
} from "./asset-mint-link";
import { resolveArtifactCollectionHex, type BoingNftConfig } from "./config";
import {
  isRetryableMintStatus,
  isTerminalMintStatus,
  MemoryCreatureNftLinkStore,
  tokenIdHexForCreature,
  type CreatureNftLinkRow,
  type CreatureNftLinkStore,
} from "./nft-link";
import { AssetMintClass, profileForAssetMintClass } from "./taxonomy";
import type { BoingNftClient } from "./types";
import type {
  CompressedItemMintJob,
  CreatureMintJob,
  LineageArtifactMintJob,
} from "./types";

export type QueuedCreatureMint = CreatureMintJob & {
  queuedAtMs: number;
};

export type QueuedLineageArtifactMint = LineageArtifactMintJob & {
  queuedAtMs: number;
};

export type QueuedCompressedItemMint = CompressedItemMintJob & {
  queuedAtMs: number;
};

export type MintEdge = {
  readonly enabled: boolean;
  readonly config: BoingNftConfig;
  readonly client: BoingNftClient;
  /**
   * Enqueue a creature mint after durable BIRTH commit.
   * When disabled, no-ops (no network, no link rows).
   */
  queueCreatureMint(job: CreatureMintJob, nowMs?: number): Promise<void>;
  /** M21: queue a unique lineage/story artifact mint (host hook). */
  queueLineageArtifactMint(
    job: LineageArtifactMintJob,
    nowMs?: number,
  ): Promise<void>;
  /** M21: queue a compressed / fungible-like item mint (host hook). */
  queueCompressedItemMint(
    job: CompressedItemMintJob,
    nowMs?: number,
  ): Promise<void>;
  /**
   * Retry PENDING/FAILED links across all token classes. Safe to call from a
   * timer; never blocks ticks if the caller does not await it on the hot path.
   */
  drain(nowMs?: number): Promise<void>;
  pendingJobs(): readonly QueuedCreatureMint[];
  pendingArtifactJobs(): readonly QueuedLineageArtifactMint[];
  pendingItemJobs(): readonly QueuedCompressedItemMint[];
  listLinks(): Promise<readonly CreatureNftLinkRow[]>;
  listAssetLinks(): Promise<readonly AssetMintLinkRow[]>;
};

export type CreateMintEdgeOptions = {
  config: BoingNftConfig;
  client: BoingNftClient;
  linkStore?: CreatureNftLinkStore;
  assetLinkStore?: AssetMintLinkStore;
};

async function resolveRecipientHex(
  config: BoingNftConfig,
): Promise<string | null> {
  if (config.recipientHex != null) {
    return ensure0xHex(config.recipientHex);
  }
  if (config.secretHex == null) return null;
  const secretKey32 = hexToBytes(ensure0xHex(config.secretHex));
  if (secretKey32.length !== 32) return null;
  return senderHexFromSecretKey(secretKey32);
}

export function createMintEdge(
  config: BoingNftConfig,
  client: BoingNftClient,
  linkStore: CreatureNftLinkStore = new MemoryCreatureNftLinkStore(),
  assetLinkStore: AssetMintLinkStore = new MemoryAssetMintLinkStore(),
): MintEdge {
  const pending: QueuedCreatureMint[] = [];
  const pendingArtifacts: QueuedLineageArtifactMint[] = [];
  const pendingItems: QueuedCompressedItemMint[] = [];
  const inFlightCreatures = new Set<number>();
  const inFlightAssets = new Set<string>();

  function assetFlightKey(
    worldId: number,
    tokenClass: string,
    mintKey: string,
  ): string {
    return `${worldId}|${tokenClass}|${mintKey}`;
  }

  async function ensurePendingCreatureLink(
    job: CreatureMintJob,
    nowMs: number,
  ): Promise<CreatureNftLinkRow | null> {
    const existing = await linkStore.getByCreatureId(job.creatureId);
    if (existing != null) {
      if (isTerminalMintStatus(existing.status)) {
        return existing;
      }
      if (
        job.birthEventId != null &&
        existing.birthEventId !== job.birthEventId
      ) {
        const updated: CreatureNftLinkRow = {
          ...existing,
          birthEventId: job.birthEventId,
          updatedAtMs: nowMs,
        };
        await linkStore.upsert(updated);
        return updated;
      }
      return existing;
    }

    const collectionHex =
      config.collectionHex != null
        ? ensure0xHex(config.collectionHex)
        : UNCONFIGURED_COLLECTION_HEX;
    const row: CreatureNftLinkRow = {
      id: job.creatureId,
      worldId: job.worldId,
      creatureId: job.creatureId,
      birthEventId: job.birthEventId,
      collectionHex,
      tokenIdHex: tokenIdHexForCreature(job.creatureId),
      chainId: String(config.chainIdDecimal),
      templateArtifact: config.templateArtifactId,
      templateVersion: config.templateVersion,
      mintTxHex: null,
      status: NftMintStatus.PENDING,
      lastError: null,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    await linkStore.upsert(row);
    return row;
  }

  async function processCreature(
    creatureId: number,
    metadataHashHex: string | null,
    nowMs: number,
  ): Promise<void> {
    if (inFlightCreatures.has(creatureId)) return;
    inFlightCreatures.add(creatureId);
    try {
      const link = await linkStore.getByCreatureId(creatureId);
      if (link == null) return;
      if (!isRetryableMintStatus(link.status)) return;

      const collectionHex = config.collectionHex;
      if (collectionHex == null) {
        await linkStore.upsert({
          ...link,
          status: NftMintStatus.FAILED,
          lastError: "LIVING_PETS_BOING_NFT_COLLECTION_HEX required",
          updatedAtMs: nowMs,
        });
        return;
      }

      if (config.secretHex == null) {
        await linkStore.upsert({
          ...link,
          status: NftMintStatus.FAILED,
          lastError: "BOING_SECRET_HEX required to submit mint",
          updatedAtMs: nowMs,
        });
        return;
      }

      let toHex: string;
      try {
        const resolved = await resolveRecipientHex(config);
        if (resolved == null) {
          throw new Error("mint recipient unresolved");
        }
        toHex = resolved;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "recipient resolve failed";
        await linkStore.upsert({
          ...link,
          status: NftMintStatus.FAILED,
          lastError: message,
          updatedAtMs: nowMs,
        });
        return;
      }

      try {
        const plan = client.planCreatureMint({
          collectionHex,
          toHex,
          creatureId,
          metadataHashHex,
        });
        const result = await client.submitCreatureMint(plan);
        await linkStore.upsert({
          ...link,
          collectionHex: result.collectionHex,
          tokenIdHex: result.tokenIdHex,
          mintTxHex: result.txHash,
          status: NftMintStatus.CONFIRMED,
          lastError: null,
          updatedAtMs: nowMs,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "mint submit failed";
        await linkStore.upsert({
          ...link,
          status: NftMintStatus.FAILED,
          lastError: message,
          updatedAtMs: nowMs,
        });
      }
    } finally {
      inFlightCreatures.delete(creatureId);
    }
  }

  async function ensurePendingAssetLink(
    row: AssetMintLinkRow,
  ): Promise<AssetMintLinkRow> {
    const existing = await assetLinkStore.getByMintKey(
      row.worldId,
      row.tokenClass,
      row.mintKey,
    );
    if (existing != null) {
      if (isTerminalMintStatus(existing.status)) return existing;
      return existing;
    }
    await assetLinkStore.upsert(row);
    return row;
  }

  async function processAssetLink(
    worldId: number,
    tokenClass: AssetMintLinkRow["tokenClass"],
    mintKey: string,
    metadataHashHex: string | null,
    nowMs: number,
  ): Promise<void> {
    const flight = assetFlightKey(worldId, tokenClass, mintKey);
    if (inFlightAssets.has(flight)) return;
    inFlightAssets.add(flight);
    try {
      const link = await assetLinkStore.getByMintKey(
        worldId,
        tokenClass,
        mintKey,
      );
      if (link == null) return;
      if (!isRetryableMintStatus(link.status)) return;

      const collectionHex =
        tokenClass === AssetMintClass.COMPRESSED_ITEM
          ? config.itemCollectionHex
          : resolveArtifactCollectionHex(config);

      if (collectionHex == null) {
        const envName =
          tokenClass === AssetMintClass.COMPRESSED_ITEM
            ? "LIVING_PETS_BOING_ITEM_COLLECTION_HEX"
            : "LIVING_PETS_BOING_ARTIFACT_COLLECTION_HEX (or NFT_COLLECTION_HEX)";
        await assetLinkStore.upsert({
          ...link,
          status: NftMintStatus.FAILED,
          lastError: `${envName} required`,
          updatedAtMs: nowMs,
        });
        return;
      }

      if (config.secretHex == null) {
        await assetLinkStore.upsert({
          ...link,
          status: NftMintStatus.FAILED,
          lastError: "BOING_SECRET_HEX required to submit mint",
          updatedAtMs: nowMs,
        });
        return;
      }

      let toHex: string;
      try {
        // Player-earned assets go to the player's wallet, not the operator.
        const resolved =
          link.recipientHex != null
            ? ensure0xHex(link.recipientHex)
            : await resolveRecipientHex(config);
        if (resolved == null) {
          throw new Error("mint recipient unresolved");
        }
        toHex = resolved;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "recipient resolve failed";
        await assetLinkStore.upsert({
          ...link,
          status: NftMintStatus.FAILED,
          lastError: message,
          updatedAtMs: nowMs,
        });
        return;
      }

      try {
        if (tokenClass === AssetMintClass.COMPRESSED_ITEM) {
          if (link.itemKindId == null || link.amount == null) {
            throw new Error("compressed item link missing itemKindId/amount");
          }
          const plan = client.planCompressedItemMint({
            collectionHex,
            toHex,
            itemKindId: link.itemKindId,
            amount: link.amount,
          });
          const result = await client.submitCompressedItemMint(plan);
          await assetLinkStore.upsert({
            ...link,
            collectionHex: result.collectionHex,
            tokenIdHex: result.tokenIdHex,
            mintTxHex: result.txHash,
            status: NftMintStatus.CONFIRMED,
            lastError: null,
            updatedAtMs: nowMs,
          });
        } else {
          // UNIQUE_LINEAGE_ARTIFACT
          if (link.tokenSerial == null || link.tokenSerial < 1) {
            throw new Error("artifact link missing tokenSerial");
          }
          const plan = client.planLineageArtifactMint({
            collectionHex,
            toHex,
            tokenSerial: link.tokenSerial,
            metadataHashHex,
          });
          const result = await client.submitLineageArtifactMint(plan);
          await assetLinkStore.upsert({
            ...link,
            collectionHex: result.collectionHex,
            tokenIdHex: result.tokenIdHex,
            mintTxHex: result.txHash,
            status: NftMintStatus.CONFIRMED,
            lastError: null,
            updatedAtMs: nowMs,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "mint submit failed";
        await assetLinkStore.upsert({
          ...link,
          status: NftMintStatus.FAILED,
          lastError: message,
          updatedAtMs: nowMs,
        });
      }
    } finally {
      inFlightAssets.delete(flight);
    }
  }

  return {
    enabled: config.enabled,
    config,
    client,
    async queueCreatureMint(job, nowMs = Date.now()) {
      if (!config.enabled) return;
      pending.push({ ...job, queuedAtMs: nowMs });
      try {
        await ensurePendingCreatureLink(job, nowMs);
        await processCreature(job.creatureId, job.metadataHashHex, nowMs);
      } catch {
        // Persist/retry errors must not escape to the birth commit path.
      }
    },
    async queueLineageArtifactMint(job, nowMs = Date.now()) {
      if (!config.enabled) return;
      pendingArtifacts.push({ ...job, queuedAtMs: nowMs });
      try {
        const profile = profileForAssetMintClass(
          AssetMintClass.UNIQUE_LINEAGE_ARTIFACT,
        );
        const collectionHex =
          resolveArtifactCollectionHex(config) != null
            ? ensure0xHex(resolveArtifactCollectionHex(config)!)
            : UNCONFIGURED_COLLECTION_HEX;
        const row: AssetMintLinkRow = {
          id: assetMintLinkId(
            job.worldId,
            AssetMintClass.UNIQUE_LINEAGE_ARTIFACT,
            job.mintKey,
          ),
          worldId: job.worldId,
          tokenClass: AssetMintClass.UNIQUE_LINEAGE_ARTIFACT,
          mintKey: job.mintKey,
          lineageId: job.lineageId,
          artifactKind: job.artifactKind,
          tokenSerial: job.tokenSerial,
          itemKindId: null,
          amount: null,
          itemSlug: null,
          recipientHex: job.recipientHex ?? null,
          collectionHex,
          tokenIdHex: tokenIdHexForArtifactSerial(job.tokenSerial),
          chainId: String(config.chainIdDecimal),
          templateArtifact: profile.templateArtifactId,
          templateVersion: profile.templateVersion,
          mintTxHex: null,
          status: NftMintStatus.PENDING,
          lastError: null,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        };
        await ensurePendingAssetLink(row);
        await processAssetLink(
          job.worldId,
          AssetMintClass.UNIQUE_LINEAGE_ARTIFACT,
          job.mintKey,
          job.metadataHashHex,
          nowMs,
        );
      } catch {
        // Host hooks must not throw into gameplay paths.
      }
    },
    async queueCompressedItemMint(job, nowMs = Date.now()) {
      if (!config.enabled) return;
      pendingItems.push({ ...job, queuedAtMs: nowMs });
      try {
        const profile = profileForAssetMintClass(
          AssetMintClass.COMPRESSED_ITEM,
        );
        const collectionHex =
          config.itemCollectionHex != null
            ? ensure0xHex(config.itemCollectionHex)
            : UNCONFIGURED_COLLECTION_HEX;
        const row: AssetMintLinkRow = {
          id: assetMintLinkId(
            job.worldId,
            AssetMintClass.COMPRESSED_ITEM,
            job.mintKey,
          ),
          worldId: job.worldId,
          tokenClass: AssetMintClass.COMPRESSED_ITEM,
          mintKey: job.mintKey,
          lineageId: null,
          artifactKind: null,
          tokenSerial: null,
          itemKindId: job.itemKindId,
          amount: job.amount,
          itemSlug: job.itemSlug,
          recipientHex: job.recipientHex ?? null,
          collectionHex,
          tokenIdHex: tokenIdHexForCompressedItem(job.itemKindId),
          chainId: String(config.chainIdDecimal),
          templateArtifact: profile.templateArtifactId,
          templateVersion: profile.templateVersion,
          mintTxHex: null,
          status: NftMintStatus.PENDING,
          lastError: null,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        };
        await ensurePendingAssetLink(row);
        await processAssetLink(
          job.worldId,
          AssetMintClass.COMPRESSED_ITEM,
          job.mintKey,
          job.metadataHashHex,
          nowMs,
        );
      } catch {
        // Host hooks must not throw into gameplay paths.
      }
    },
    async drain(nowMs = Date.now()) {
      if (!config.enabled) return;
      const creatureLinks = await linkStore.list();
      for (const link of creatureLinks) {
        if (!isRetryableMintStatus(link.status)) continue;
        await processCreature(link.creatureId, null, nowMs);
      }
      const assetLinks = await assetLinkStore.list();
      for (const link of assetLinks) {
        if (!isRetryableMintStatus(link.status)) continue;
        await processAssetLink(
          link.worldId,
          link.tokenClass,
          link.mintKey,
          null,
          nowMs,
        );
      }
    },
    pendingJobs() {
      return pending;
    },
    pendingArtifactJobs() {
      return pendingArtifacts;
    },
    pendingItemJobs() {
      return pendingItems;
    },
    async listLinks() {
      return linkStore.list();
    },
    async listAssetLinks() {
      return assetLinkStore.list();
    },
  };
}
