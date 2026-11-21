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
/** Open escrow listings read from the escrow contract's state. */
export const MARKET_LISTINGS_PATH = "/market/v1/listings";
/**
 * LPIT item market: open item-escrow listings, and with `?wallet=0x…` that
 * wallet's tradable balances and its own listings.
 */
export const MARKET_ITEMS_PATH = "/market/v1/items";

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
  /** Reserved buyer (adoptions, private sales), or null for anyone. */
  buyerHex: string | null;
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
  /** Items only (M22): RELIC (LPAR unique NFT) or CONSUMABLE (LPIT balance). */
  itemCategory?: "RELIC" | "CONSUMABLE" | null;
  /**
   * False when the escrow cannot hold this token (LPIT multi-token balances);
   * the market shows it but offers no list/buy. Absent means listable.
   */
  escrowListable?: boolean;
  /** Why it cannot be listed, shown next to the item. */
  escrowNote?: string | null;
};

/** Shown on LPIT items: the escrow only moves single (reference) NFTs. */
export const LPIT_NOT_LISTABLE_NOTE =
  "Not tradable on the market: LPIT items are multi-token balances and the escrow only holds single NFTs.";

/** Shown on LPIT reward cards when the item escrow is configured. */
export const LPIT_ITEM_MARKET_NOTE =
  "LPIT items trade by quantity in the Item market above: list any number of units at a price per unit.";

export type MarketEscrowMode =
  /** No escrow account configured: browse only. */
  | "DISABLED"
  /**
   * The escrow contract (`contracts/escrow`) holds listed NFTs and settles
   * list, buy, adopt and cancel on chain, one wallet transaction each.
   */
  | "CONTRACT";

export type MarketEscrowInfo = {
  mode: MarketEscrowMode;
  escrowHex: string | null;
  operatorHex: string | null;
  chainId: number;
  /** Market fee in basis points (250 = 2.5%), read from the contract. */
  feeBps: number | null;
  /** Account the market fee is paid to (the operator). */
  feeToHex: string | null;
  /** When the listing index last read the contract. */
  listingsAtMs: number | null;
  /** Why trading is off, or a note about how it settles. */
  note: string;
  /** Item escrow for LPIT quantities (`contracts/escrow/src/items.rs`). */
  itemEscrowHex?: string | null;
};

export type MarketListingsResponse = {
  v: typeof MARKET_API_VERSION;
  escrowHex: string;
  feeBps: number | null;
  feeToHex: string | null;
  refreshedAtMs: number | null;
  /** Last read error, if the index is serving a stale view. */
  error: string | null;
  listings: (MarketListing & { collectionHex: string; tokenIdHex: string })[];
};

export type MarketCatalog = {
  v: typeof MARKET_API_VERSION;
  worldId: number;
  tick: number;
  generatedAtMs: number;
  escrow: MarketEscrowInfo;
  assets: MarketAsset[];
};

/** One open listing in the item escrow, as the item market serves it. */
export type MarketItemListing = {
  /** On-chain listing id. */
  id: number;
  sellerHex: string;
  itemId: number;
  itemSlug: string | null;
  name: string;
  /** Price per unit in base units, as a decimal string. */
  unitPriceWei: string;
  listed: number;
  remaining: number;
  /**
   * Units of this listing still backed by the seller's in-game inventory.
   * Units that were already used in the world stay on chain (LPIT has no
   * burn) but are not usable; the market only offers fully backed listings.
   */
  backed: number;
  /** False until the server has locked the seller's in-game units. */
  reconciled: boolean;
};

/** A wallet's LPIT stack: on chain, usable in the world, and tradable now. */
export type MarketItemHolding = {
  itemId: number;
  itemSlug: string;
  name: string;
  /** LPIT balance in the wallet (chain). */
  chain: number | null;
  /** Unused units in the world inventory (DB). */
  usable: number;
  /** min(chain, usable): what can be listed. */
  tradable: number;
  /** Units in this wallet's open listings. */
  listed: number;
};

export type MarketItemsResponse = {
  v: typeof MARKET_API_VERSION;
  /** Null when no item escrow is configured (browse only). */
  itemEscrowHex: string | null;
  collectionHex: string | null;
  feeBps: number | null;
  feeToHex: string | null;
  refreshedAtMs: number | null;
  error: string | null;
  note: string;
  listings: MarketItemListing[];
  wallet: { hex: string; holdings: MarketItemHolding[] } | null;
};
