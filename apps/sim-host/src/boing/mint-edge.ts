/**
 * Host mint edge. M20 queues a unique NFT mint after every durable BIRTH
 * commit, persists creatureId ↔ tokenId, and retries without blocking ticks.
 * Never invoked from packages/sim or step().
 */
import {
  ensure0xHex,
  hexToBytes,
  senderHexFromSecretKey,
} from "@boing-network/boing-sdk";
import type { BoingNftConfig } from "./config";
import {
  isRetryableMintStatus,
  isTerminalMintStatus,
  NftMintStatus,
  tokenIdHexForCreature,
  UNCONFIGURED_COLLECTION_HEX,
  type CreatureNftLinkRow,
  type CreatureNftLinkStore,
  MemoryCreatureNftLinkStore,
} from "./nft-link";
import type { BoingNftClient } from "./types";
import type { CreatureMintJob } from "./types";

export type QueuedCreatureMint = CreatureMintJob & {
  queuedAtMs: number;
};

export type MintEdge = {
  readonly enabled: boolean;
  readonly config: BoingNftConfig;
  readonly client: BoingNftClient;
  /**
   * Enqueue a creature mint after durable BIRTH commit.
   * When disabled, no-ops (no network, no link rows).
   * When enabled, upserts a PENDING link (idempotent by creatureId) and
   * attempts submit without throwing to the caller.
   */
  queueCreatureMint(job: CreatureMintJob, nowMs?: number): Promise<void>;
  /**
   * Retry PENDING/FAILED links. Safe to call from a timer; never blocks ticks
   * if the caller does not await it on the hot path.
   */
  drain(nowMs?: number): Promise<void>;
  /** In-memory jobs recorded this process (debug / tests). */
  pendingJobs(): readonly QueuedCreatureMint[];
  /** Durable links from the store. */
  listLinks(): Promise<readonly CreatureNftLinkRow[]>;
};

export type CreateMintEdgeOptions = {
  config: BoingNftConfig;
  client: BoingNftClient;
  linkStore?: CreatureNftLinkStore;
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
): MintEdge {
  const pending: QueuedCreatureMint[] = [];
  /** In-flight creature ids so concurrent drain/queue do not double-submit. */
  const inFlight = new Set<number>();

  async function ensurePendingLink(
    job: CreatureMintJob,
    nowMs: number,
  ): Promise<CreatureNftLinkRow | null> {
    const existing = await linkStore.getByCreatureId(job.creatureId);
    if (existing != null) {
      if (isTerminalMintStatus(existing.status)) {
        return existing;
      }
      // Refresh birthEventId if we learned it later; keep status for retry.
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
    if (inFlight.has(creatureId)) return;
    inFlight.add(creatureId);
    try {
      const link = await linkStore.getByCreatureId(creatureId);
      if (link == null) return;
      if (!isRetryableMintStatus(link.status)) return;

      const collectionHex = config.collectionHex;
      if (collectionHex == null) {
        const failed: CreatureNftLinkRow = {
          ...link,
          status: NftMintStatus.FAILED,
          lastError: "LIVING_PETS_BOING_NFT_COLLECTION_HEX required",
          updatedAtMs: nowMs,
        };
        await linkStore.upsert(failed);
        return;
      }

      if (config.secretHex == null) {
        const failed: CreatureNftLinkRow = {
          ...link,
          status: NftMintStatus.FAILED,
          lastError: "BOING_SECRET_HEX required to submit mint",
          updatedAtMs: nowMs,
        };
        await linkStore.upsert(failed);
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
      inFlight.delete(creatureId);
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
        await ensurePendingLink(job, nowMs);
        await processCreature(job.creatureId, job.metadataHashHex, nowMs);
      } catch {
        // Persist/retry errors must not escape to the birth commit path.
      }
    },
    async drain(nowMs = Date.now()) {
      if (!config.enabled) return;
      const links = await linkStore.list();
      for (const link of links) {
        if (!isRetryableMintStatus(link.status)) continue;
        await processCreature(link.creatureId, null, nowMs);
      }
    },
    pendingJobs() {
      return pending;
    },
    async listLinks() {
      return linkStore.list();
    },
  };
}
