/**
 * Adapts WorldRepository creature NFT link methods into CreatureNftLinkStore.
 */
import type { WorldRepository } from "../persist/repository";
import type { CreatureNftLinkRow, CreatureNftLinkStore } from "./nft-link";

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
