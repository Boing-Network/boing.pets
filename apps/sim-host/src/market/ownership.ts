/**
 * Ownership rule for creature, lineage and item NFTs:
 *
 * 1. Every NFT is minted to the operator wallet (`UNMINTED` until then).
 * 2. The operator holds it (`OPERATOR`) until a player adopts or claims it.
 * 3. Any hand-over, operator to player or player to player, goes through
 *    escrow: the NFT is deposited with the escrow account (`IN_ESCROW`) and
 *    released to the buyer once the payment has arrived.
 * 4. After release the player holds it (`PLAYER`).
 */
import type { MarketMintState, MarketOwnership } from "@boing-pets/contract";

export type OwnershipInput = {
  mint: MarketMintState;
  /** Mint recipient or last known holder; null means the operator. */
  holderHex: string | null;
  operatorHex: string | null;
  escrowHex: string | null;
  /** An open listing or adoption holds the NFT in escrow. */
  inEscrow: boolean;
};

export type Ownership = { ownership: MarketOwnership; ownerHex: string | null };

export function resolveOwnership(input: OwnershipInput): Ownership {
  if (input.mint !== "CONFIRMED" && input.mint !== "SUBMITTED") {
    return { ownership: "UNMINTED", ownerHex: input.operatorHex };
  }
  if (input.inEscrow) {
    return { ownership: "IN_ESCROW", ownerHex: input.escrowHex };
  }
  const holder = input.holderHex?.toLowerCase() ?? null;
  if (holder == null || holder === input.operatorHex?.toLowerCase()) {
    return { ownership: "OPERATOR", ownerHex: input.operatorHex };
  }
  if (holder === input.escrowHex?.toLowerCase()) {
    return { ownership: "IN_ESCROW", ownerHex: input.escrowHex };
  }
  return { ownership: "PLAYER", ownerHex: holder };
}

/** Whether a player may start an adoption (operator to player via escrow). */
export function canAdopt(o: Ownership): boolean {
  return o.ownership === "OPERATOR";
}

/** Whether `walletHex` may list the asset for sale. */
export function canList(o: Ownership, walletHex: string | null): boolean {
  return (
    o.ownership === "PLAYER" &&
    walletHex != null &&
    o.ownerHex === walletHex.toLowerCase()
  );
}
