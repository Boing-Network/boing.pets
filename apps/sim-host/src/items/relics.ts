/**
 * M22 relics: a lineage's First Child and Remembrance relics are unique LPAR
 * artifacts (FIRST_CHILD_COMMEMORATIVE, GRIEF_COMMEMORATIVE). Host edge only.
 *
 * Recipient (Nico's rule): the trigger creature's on-chain owner; if the
 * operator still holds it (or it was never minted), the lineage's top
 * favor-giver (most FAVOR_BLOODLINE influences from a wallet; ties: earliest
 * first favor, then account id); with no favor-giver it stays with the
 * operator (recipientHex null).
 */
import { InfluenceKind, ItemSlug } from "@boing-pets/contract";
import type { RelicTrigger, WorldEvent } from "@boing-pets/sim";
import { relicTriggers } from "@boing-pets/sim";
import {
  artifactSerial,
  walletFromAccountId,
} from "../boing/influence-rewards";
import type { MintEdge } from "../boing/mint-edge";
import type { CreatureNftLinkRow } from "../boing/nft-link";
import { NftMintStatus } from "../boing/nft-link";
import { LineageArtifactKind } from "../boing/taxonomy";
import type { InfluenceAccountRow } from "./types";

export const RELIC_ARTIFACT_KIND: Record<string, LineageArtifactKind> = {
  [ItemSlug.RELIC_KEEPSAKE]: LineageArtifactKind.LINEAGE_KEEPSAKE,
  [ItemSlug.RELIC_FIRST_CHILD]: LineageArtifactKind.FIRST_CHILD_COMMEMORATIVE,
  [ItemSlug.RELIC_REMEMBRANCE]: LineageArtifactKind.GRIEF_COMMEMORATIVE,
};

export const ARTIFACT_RELIC_SLUG: Record<string, ItemSlug> = {
  [LineageArtifactKind.LINEAGE_KEEPSAKE]: ItemSlug.RELIC_KEEPSAKE,
  [LineageArtifactKind.FIRST_CHILD_COMMEMORATIVE]: ItemSlug.RELIC_FIRST_CHILD,
  [LineageArtifactKind.GRIEF_COMMEMORATIVE]: ItemSlug.RELIC_REMEMBRANCE,
};

/** Mint key: one relic per lineage and kind, first trigger wins. */
export function relicMintKey(relic: string, lineageId: number): string {
  const short =
    relic === ItemSlug.RELIC_FIRST_CHILD ? "first-child" : "remembrance";
  return `relic:${short}:${lineageId}`;
}

/** Deterministic top favor-giver wallet for a lineage, or null. */
export function topFavorGiver(
  accounts: readonly InfluenceAccountRow[],
  lineageId: number,
): string | null {
  const tally = new Map<string, { count: number; first: number }>();
  for (const row of accounts) {
    if (row.kind !== InfluenceKind.FAVOR_BLOODLINE) continue;
    if (row.lineageId !== lineageId) continue;
    const wallet = walletFromAccountId(row.accountId);
    if (wallet == null) continue;
    const entry = tally.get(wallet) ?? { count: 0, first: row.influenceId };
    entry.count += 1;
    entry.first = Math.min(entry.first, row.influenceId);
    tally.set(wallet, entry);
  }
  let best: { wallet: string; count: number; first: number } | null = null;
  for (const [wallet, entry] of tally) {
    if (
      best == null ||
      entry.count > best.count ||
      (entry.count === best.count && entry.first < best.first) ||
      (entry.count === best.count &&
        entry.first === best.first &&
        wallet < best.wallet)
    ) {
      best = { wallet, ...entry };
    }
  }
  return best?.wallet ?? null;
}

export type RelicChain = {
  operatorHex(): Promise<string | null>;
  ownerOf(collectionHex: string, tokenIdHex: string): Promise<string | null>;
};

function sameAccount(a: string | null, b: string | null): boolean {
  return a != null && b != null && a.toLowerCase() === b.toLowerCase();
}

export async function resolveRelicRecipient(input: {
  trigger: RelicTrigger;
  creatureLinks: readonly CreatureNftLinkRow[];
  accounts: readonly InfluenceAccountRow[];
  chain: RelicChain | null;
}): Promise<string | null> {
  const link = input.creatureLinks.find(
    (row) =>
      row.creatureId === input.trigger.creatureId &&
      (row.status === NftMintStatus.CONFIRMED ||
        row.status === NftMintStatus.SUBMITTED),
  );
  if (link != null && input.chain != null) {
    let owner: string | null = null;
    for (let attempt = 0; attempt < 2 && owner == null; attempt += 1) {
      try {
        owner = await input.chain.ownerOf(link.collectionHex, link.tokenIdHex);
      } catch {
        owner = null;
      }
    }
    const operator = await input.chain.operatorHex().catch(() => null);
    if (owner != null && !sameAccount(owner, operator)) return owner;
  }
  return topFavorGiver(input.accounts, input.trigger.lineageId);
}

/**
 * After a durable commit: queue relic mints for this window's events. Already
 * minted (or queued) relics are skipped before any chain read. Never throws.
 */
export async function enqueueRelicMintsAfterCommit(input: {
  mintEdge: MintEdge;
  worldId: number;
  events: readonly WorldEvent[];
  creatureLinks: () => Promise<readonly CreatureNftLinkRow[]>;
  accounts: () => Promise<readonly InfluenceAccountRow[]>;
  chain: RelicChain | null;
  nowMs: number;
}): Promise<string[]> {
  const queued: string[] = [];
  if (!input.mintEdge.enabled) return queued;
  try {
    const triggers = relicTriggers(input.events);
    if (triggers.length === 0) return queued;
    const existing = new Set(
      (await input.mintEdge.listAssetLinks())
        .filter((row) => row.worldId === input.worldId)
        .map((row) => row.mintKey),
    );
    const links = await input.creatureLinks();
    const accounts = await input.accounts();
    for (const trigger of triggers) {
      const mintKey = relicMintKey(trigger.relic, trigger.lineageId);
      if (existing.has(mintKey)) continue;
      existing.add(mintKey);
      const artifactKind = RELIC_ARTIFACT_KIND[trigger.relic];
      if (artifactKind == null) continue;
      const recipientHex = await resolveRelicRecipient({
        trigger,
        creatureLinks: links,
        accounts,
        chain: input.chain,
      });
      await input.mintEdge.queueLineageArtifactMint(
        {
          worldId: input.worldId,
          mintKey,
          tokenSerial: artifactSerial(trigger.lineageId, artifactKind),
          lineageId: trigger.lineageId,
          artifactKind,
          metadataHashHex: null,
          recipientHex,
        },
        input.nowMs,
      );
      queued.push(mintKey);
    }
  } catch {
    // Relics are a host-edge bonus; never block the tick path.
  }
  return queued;
}
