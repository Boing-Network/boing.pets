/**
 * Adapts WorldRepository NFT link methods into CreatureNftLinkStore /
 * AssetMintLinkStore.
 */
import type { WorldRepository } from "../persist/repository";
import type { AssetMintLinkRow, AssetMintLinkStore } from "./asset-mint-link";
import type { CreatureNftLinkRow, CreatureNftLinkStore } from "./nft-link";
import type { PersistedAssetMintClass } from "./taxonomy";

export function createRepositoryNftLinkStore(
  repository: WorldRepository,
): CreatureNftLinkStore {
  return {
    async list() {
      return repository.readCreatureNftLinks();
    },
    async getByCreatureId(creatureId: number) {
      const links = await repository.readCreatureNftLinks();
      return links.find((row) => row.creatureId === creatureId) ?? null;
    },
    async upsert(row: CreatureNftLinkRow) {
      await repository.upsertCreatureNftLink(row);
    },
  };
}

export function createRepositoryAssetMintLinkStore(
  repository: WorldRepository,
): AssetMintLinkStore {
  return {
    async list() {
      return repository.readAssetMintLinks();
    },
    async getByMintKey(
      worldId: number,
      tokenClass: PersistedAssetMintClass,
      mintKey: string,
    ) {
      const links = await repository.readAssetMintLinks();
      return (
        links.find(
          (row) =>
            row.worldId === worldId &&
            row.tokenClass === tokenClass &&
            row.mintKey === mintKey,
        ) ?? null
      );
    },
    async upsert(row: AssetMintLinkRow) {
      await repository.upsertAssetMintLink(row);
    },
  };
}
