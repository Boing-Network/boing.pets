/**
 * In-game mint triggers: a wallet player whose influence lands earns a token
 * minted to their own wallet. Behind LIVING_PETS_BOING_MINTING (off by
 * default) like every mint; guests and owner-key sessions earn nothing, so
 * nothing ever defaults to the operator address.
 *
 * - Enrich a territory  -> 1 Rations Pack   (compressed item)
 * - Calm a territory    -> 1 Calm Potion    (compressed item)
 * - Favor a bloodline   -> 1 Vitality Potion (compressed item)
 * - Name a lineage      -> that lineage's Keepsake (unique artifact, one per
 *   lineage: the first wallet to name it keeps it)
 * - Name a creature     -> nothing (creatures already mint at birth)
 *
 * Mint keys are derived from the influence id (or lineage id), so a retried
 * submit or a host restart never mints twice. Never called from the sim.
 */
import { InfluenceKind, type InfluenceSubmit } from "@boing-pets/contract";
import type { MintEdge } from "./mint-edge";
import { CompressedItemKind, LineageArtifactKind } from "./taxonomy";
import type { CompressedItemMintJob, LineageArtifactMintJob } from "./types";

const WALLET_ACCOUNT = /^w:([0-9a-f]{64})$/;

/** Wallet address for a wallet-signed account id (`w:<64 hex>`), else null. */
export function walletFromAccountId(
  accountId: string | null | undefined,
): string | null {
  const match = WALLET_ACCOUNT.exec(accountId ?? "");
  return match == null ? null : `0x${match[1]}`;
}

const ARTIFACT_KIND_SLOT: Record<string, number> = {
  [LineageArtifactKind.LINEAGE_KEEPSAKE]: 1,
  [LineageArtifactKind.FIRST_CHILD_COMMEMORATIVE]: 2,
  [LineageArtifactKind.GRIEF_COMMEMORATIVE]: 3,
};

/** Unique artifact serial per (lineage, kind): lineageId * 4 + slot (>= 5). */
export function artifactSerial(
  lineageId: number,
  artifactKind: string,
): number {
  const slot = ARTIFACT_KIND_SLOT[artifactKind];
  if (slot == null) throw new Error(`artifact kind ${artifactKind}`);
  return lineageId * 4 + slot;
}

export type InfluenceRewardJobs = {
  items: CompressedItemMintJob[];
  artifacts: LineageArtifactMintJob[];
};

export function influenceRewardJobs(
  worldId: number,
  influenceId: number,
  submit: InfluenceSubmit,
  recipientHex: string,
): InfluenceRewardJobs {
  const item = (
    kind: (typeof CompressedItemKind)[keyof typeof CompressedItemKind],
  ) => ({
    items: [
      {
        worldId,
        mintKey: `influence:${influenceId}`,
        itemKindId: kind.itemKindId,
        amount: 1,
        itemSlug: kind.slug,
        metadataHashHex: null,
        recipientHex,
      },
    ],
    artifacts: [],
  });
  switch (submit.kind) {
    case InfluenceKind.ENRICH_TERRITORY:
      return item(CompressedItemKind.RATIONS_PACK);
    case InfluenceKind.CALM_TERRITORY:
      return item(CompressedItemKind.POTION_CALM);
    case InfluenceKind.FAVOR_BLOODLINE:
      return item(CompressedItemKind.POTION_VITALITY);
    case InfluenceKind.NAME_LINEAGE: {
      const lineageId = submit.payload.lineageId;
      const kind = LineageArtifactKind.LINEAGE_KEEPSAKE;
      return {
        items: [],
        artifacts: [
          {
            worldId,
            mintKey: `keepsake:${lineageId}`,
            tokenSerial: artifactSerial(lineageId, kind),
            lineageId,
            artifactKind: kind,
            metadataHashHex: null,
            recipientHex,
          },
        ],
      };
    }
    case InfluenceKind.NAME_CREATURE:
      return { items: [], artifacts: [] };
    default: {
      const never: never = submit;
      void never;
      return { items: [], artifacts: [] };
    }
  }
}

/**
 * Queue the reward for an accepted influence. Never throws into the command
 * path; failures are recorded on the asset link rows by the edge.
 */
export async function enqueueInfluenceRewardMints(
  mintEdge: MintEdge,
  worldId: number,
  influenceId: number,
  submit: InfluenceSubmit,
  accountId: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<InfluenceRewardJobs | null> {
  if (!mintEdge.enabled) return null;
  const wallet = walletFromAccountId(accountId);
  if (wallet == null) return null;
  const jobs = influenceRewardJobs(worldId, influenceId, submit, wallet);
  for (const job of jobs.items) {
    try {
      await mintEdge.queueCompressedItemMint(job, nowMs);
    } catch {
      // The influence already landed; minting is best effort.
    }
  }
  for (const job of jobs.artifacts) {
    try {
      await mintEdge.queueLineageArtifactMint(job, nowMs);
    } catch {
      // Same: never fail the command.
    }
  }
  return jobs;
}
