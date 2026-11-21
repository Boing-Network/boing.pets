/**
 * Who keeps each creature, for creature autonomy (loot goes to the keeper,
 * crafts and uses draw on their bag). A creature is kept by a wallet only
 * when the marketplace ownership rule says PLAYER (see ownership.ts): its
 * NFT is minted and a player wallet holds it. Unminted, operator-held and
 * in-escrow creatures have no keeper; their finds go to their pouch, which
 * whoever adopts them inherits.
 */
import type { MarketMintState } from "@boing-pets/contract";
import type { CreatureOwnerOf } from "../items/autonomy";
import { walletAccountId } from "../items/escrow-reconcile";
import { marketTokenKey } from "./listings";
import { resolveOwnership } from "./ownership";

export type CreatureLinkLike = {
  creatureId: number;
  status: string;
  recipientHex?: string | null;
  collectionHex?: string | null;
  tokenIdHex?: string | null;
};

export function creatureOwnerIndex(input: {
  links: readonly CreatureLinkLike[];
  /** On-chain holder by marketTokenKey (from the listing index). */
  owners: ReadonlyMap<string, string>;
  /** Open listings by marketTokenKey. */
  listed: ReadonlySet<string>;
  operatorHex: string | null;
  escrowHex: string | null;
}): Map<number, string> {
  const out = new Map<number, string>();
  for (const link of input.links) {
    const token =
      link.collectionHex != null && link.tokenIdHex != null
        ? marketTokenKey(link.collectionHex, link.tokenIdHex)
        : null;
    const owned = resolveOwnership({
      mint: (link.status as MarketMintState | undefined) ?? "UNMINTED",
      holderHex:
        (token != null ? input.owners.get(token) : null) ??
        link.recipientHex ??
        null,
      operatorHex: input.operatorHex,
      escrowHex: input.escrowHex,
      inEscrow: token != null && input.listed.has(token),
    });
    if (owned.ownership === "PLAYER" && owned.ownerHex != null) {
      out.set(link.creatureId, walletAccountId(owned.ownerHex));
    }
  }
  return out;
}

/** Cached owner lookup for the shared host (refreshed every `ttlMs`). */
export function createCreatureOwners(input: {
  links: () => Promise<readonly CreatureLinkLike[]>;
  chain: () => {
    owners: ReadonlyMap<string, string>;
    listings: ReadonlyMap<string, unknown>;
  } | null;
  operatorHex: string | null;
  escrowHex: string | null;
  ttlMs?: number;
  nowMs?: () => number;
}): () => Promise<CreatureOwnerOf> {
  const now = input.nowMs ?? Date.now;
  let cached: { atMs: number; index: Map<number, string> } | null = null;
  return async () => {
    const t = now();
    if (cached == null || t - cached.atMs >= (input.ttlMs ?? 30_000)) {
      try {
        const chain = input.chain();
        cached = {
          atMs: t,
          index: creatureOwnerIndex({
            links: await input.links(),
            owners: chain?.owners ?? new Map(),
            listed: new Set(chain?.listings.keys() ?? []),
            operatorHex: input.operatorHex,
            escrowHex: input.escrowHex,
          }),
        };
      } catch {
        cached ??= { atMs: t, index: new Map() };
      }
    }
    const index = cached.index;
    return (creatureId) => index.get(creatureId) ?? null;
  };
}
