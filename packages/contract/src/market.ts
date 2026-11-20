/**
 * Marketplace catalog: the read-only JSON the shared-world server publishes at
 * `GET /market/v1/catalog`, and the marketplace page renders.
 *
 * Ownership rule: the operator wallet owns every creature, lineage and item
 * NFT until a player adopts or claims it, and every hand-over (operator to
 * player, or player to player) goes through escrow.
 */
export const MARKET_API_VERSION = 1;
export const MARKET_CATALOG_PATH = "/market/v1/catalog";

export type MarketAssetKind = "CREATURE" | "LINEAGE" | "ITEM";

/** Where the asset sits under the ownership rule. */
export type MarketOwnership =
  /** Not minted yet; the operator receives it when it is minted. */
  | "UNMINTED"
  /** Minted and held by the operator, so it can be adopted or claimed. */
  | "OPERATOR"
  /** Deposited with escrow for a listing or a pending adoption. */
  | "IN_ESCROW"
  /** Held by a player wallet. */
  | "PLAYER";

export type MarketMintState =
  "UNMINTED" | "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED";

/** Live, in-world status for a creature (or a lineage's living members). */
export type MarketLiveStatus = {
  alive: boolean;
  territory: string | null;
  /** Current action (FORAGE, DRINK, …) or goal when idle. */
  activity: string | null;
  ageTicks: number | null;
  generation: number | null;
  /** 0–1000. */
  health: number | null;
  /** Living members, for lineages. */
  livingMembers?: number;
};

export type MarketListing = {
  /** Asking price in base units (1 BOING = 10^18), as a decimal string. */
  priceWei: string;
  sellerHex: string;
  listedAtMs: number;
};

export type MarketAsset = {
  /** Stable key: `creature:<id>`, `lineage:<id>`, `item:<mintKey>`. */
  key: string;
  kind: MarketAssetKind;
  name: string;
  speciesSlug: string | null;
  speciesName: string | null;
  lineageId: number | null;
  lineageName: string | null;
  /** Founder creature of the starting world (genesis set). */
  genesis: boolean;
  collectionHex: string | null;
  tokenIdHex: string | null;
  mint: MarketMintState;
  mintTxHex: string | null;
  ownership: MarketOwnership;
  ownerHex: string | null;
  listing: MarketListing | null;
  live: MarketLiveStatus | null;
  /** Items only. */
  itemSlug?: string | null;
  amount?: number | null;
};

export type MarketEscrowMode =
  /** No escrow account configured: browse only. */
  | "DISABLED"
  /**
   * An operator-run escrow account holds NFTs and payments and settles
   * trades. Testnet only; see the README's marketplace section.
   */
  | "CUSTODIAL";

export type MarketEscrowInfo = {
  mode: MarketEscrowMode;
  escrowHex: string | null;
  operatorHex: string | null;
  chainId: number;
  /** Why trading is off, or a note about how it settles. */
  note: string;
};

export type MarketCatalog = {
  v: typeof MARKET_API_VERSION;
  worldId: number;
  tick: number;
  generatedAtMs: number;
  escrow: MarketEscrowInfo;
  assets: MarketAsset[];
};
