/**
 * Builds the read-only marketplace catalog from the live world snapshot and
 * the mint-link stores. Cheap (one pass over creatures, lineages and links),
 * and never writes anything.
 */
import {
  MARKET_API_VERSION,
  type MarketAsset,
  type MarketCatalog,
  type MarketListing,
  type MarketLiveStatus,
  type MarketMintState,
} from "@boing-pets/contract";
import type { CreatureRow, WorldSnapshot } from "@boing-pets/sim";
import type { AssetMintLinkRow } from "../boing/asset-mint-link";
import type { CreatureNftLinkRow } from "../boing/nft-link";
import { AssetMintClass } from "../boing/taxonomy";
import { escrowInfo, type MarketConfig } from "./config";
import { resolveOwnership } from "./ownership";

export type CatalogInputs = {
  snapshot: WorldSnapshot;
  creatureLinks: readonly CreatureNftLinkRow[];
  assetLinks: readonly AssetMintLinkRow[];
  /** Open listings by asset key. */
  listings?: ReadonlyMap<string, MarketListing>;
  config: MarketConfig;
  nowMs: number;
};

/** Founders of the world: no parents, generation 0 (the genesis set). */
export function isGenesisCreature(c: CreatureRow): boolean {
  return c.motherId == null && c.fatherId == null && c.generation === 0;
}

function mintState(
  link: { status: string; mintTxHex: string | null } | undefined,
): MarketMintState {
  return (link?.status as MarketMintState | undefined) ?? "UNMINTED";
}

export function buildMarketCatalog(input: CatalogInputs): MarketCatalog {
  const { snapshot, config } = input;
  const tick = snapshot.world.lastTick;
  const listings = input.listings ?? new Map<string, MarketListing>();
  const territory = new Map(snapshot.territories.map((t) => [t.id, t.name]));
  const species = new Map(snapshot.species.map((s) => [s.id, s]));
  const lineage = new Map(snapshot.lineages.map((l) => [l.id, l]));
  const creatureLink = new Map(
    input.creatureLinks.map((l) => [l.creatureId, l]),
  );
  const living = new Map<number, number>();
  for (const c of snapshot.creatures) {
    if (c.status === "ALIVE") {
      living.set(c.lineageId, (living.get(c.lineageId) ?? 0) + 1);
    }
  }

  const owned = (
    key: string,
    link:
      | {
          status: string;
          mintTxHex: string | null;
          recipientHex?: string | null;
        }
      | undefined,
  ) => {
    const listing = listings.get(key) ?? null;
    const mint = mintState(link);
    return {
      mint,
      mintTxHex: link?.mintTxHex ?? null,
      listing,
      ...resolveOwnership({
        mint,
        holderHex: link?.recipientHex ?? null,
        operatorHex: config.operatorHex,
        escrowHex: config.escrowHex,
        inEscrow: listing != null,
      }),
    };
  };

  const assets: MarketAsset[] = [];
  for (const c of snapshot.creatures) {
    const sp = species.get(c.speciesId);
    const link = creatureLink.get(c.id);
    const key = `creature:${c.id}`;
    const live: MarketLiveStatus = {
      alive: c.status === "ALIVE",
      territory: territory.get(c.territoryId) ?? null,
      activity:
        c.status === "ALIVE" ? (c.currentAction ?? c.currentGoal) : null,
      ageTicks: Math.max(0, (c.deathTick ?? tick) - c.birthTick),
      generation: c.generation,
      health: c.health,
    };
    assets.push({
      key,
      kind: "CREATURE",
      name: c.name,
      speciesSlug: sp?.slug ?? null,
      speciesName: sp?.displayName ?? null,
      lineageId: c.lineageId,
      lineageName: lineage.get(c.lineageId)?.name ?? null,
      genesis: isGenesisCreature(c),
      collectionHex: link?.collectionHex ?? null,
      tokenIdHex: link?.tokenIdHex ?? null,
      live,
      ...owned(key, link),
    });
  }

  const artifactsByLineage = new Map<number, AssetMintLinkRow[]>();
  for (const row of input.assetLinks) {
    if (row.tokenClass !== AssetMintClass.UNIQUE_LINEAGE_ARTIFACT) continue;
    if (row.lineageId == null) continue;
    const list = artifactsByLineage.get(row.lineageId) ?? [];
    list.push(row);
    artifactsByLineage.set(row.lineageId, list);
  }
  for (const l of snapshot.lineages) {
    const sp = species.get(l.speciesId);
    const members = living.get(l.id) ?? 0;
    const live: MarketLiveStatus = {
      alive: members > 0,
      territory: null,
      activity: null,
      ageTicks: Math.max(0, tick - l.foundedTick),
      generation: null,
      health: null,
      livingMembers: members,
    };
    const artifacts = artifactsByLineage.get(l.id) ?? [];
    const keepsake = artifacts.find(
      (a) => a.artifactKind === "LINEAGE_KEEPSAKE",
    );
    const entries: (AssetMintLinkRow | undefined)[] = [
      keepsake,
      ...artifacts.filter((a) => a !== keepsake),
    ];
    for (const row of entries) {
      const key =
        row == null || row === keepsake
          ? `lineage:${l.id}`
          : `lineage:${l.id}:${row.mintKey}`;
      const label =
        row == null || row === keepsake
          ? `${l.name} lineage`
          : `${l.name}: ${String(row.artifactKind ?? "artifact")
              .toLowerCase()
              .replaceAll("_", " ")}`;
      assets.push({
        key,
        kind: "LINEAGE",
        name: label,
        speciesSlug: sp?.slug ?? null,
        speciesName: sp?.displayName ?? null,
        lineageId: l.id,
        lineageName: l.name,
        genesis: l.founderCreatureId != null && l.foundedTick <= 0,
        collectionHex: row?.collectionHex ?? null,
        tokenIdHex: row?.tokenIdHex ?? null,
        live,
        ...owned(key, row),
      });
    }
  }

  for (const row of input.assetLinks) {
    if (row.tokenClass !== AssetMintClass.COMPRESSED_ITEM) continue;
    const key = `item:${row.mintKey}`;
    assets.push({
      key,
      kind: "ITEM",
      name: row.itemSlug ?? `Item #${row.itemKindId ?? "?"}`,
      speciesSlug: null,
      speciesName: null,
      lineageId: row.lineageId,
      lineageName:
        row.lineageId != null
          ? (lineage.get(row.lineageId)?.name ?? null)
          : null,
      genesis: false,
      collectionHex: row.collectionHex,
      tokenIdHex: row.tokenIdHex,
      live: null,
      itemSlug: row.itemSlug,
      amount: row.amount,
      ...owned(key, row),
    });
  }

  return {
    v: MARKET_API_VERSION,
    worldId: snapshot.world.id,
    tick,
    generatedAtMs: input.nowMs,
    escrow: escrowInfo(config),
    assets,
  };
}
