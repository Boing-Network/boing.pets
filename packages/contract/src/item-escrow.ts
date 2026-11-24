/**
 * Living Pets **item escrow** (`contracts/escrow/src/items.rs`): fungible
 * listings of LPIT multi-token balances. List N units at a per-unit price,
 * buy any quantity up to what is left (partial fills), cancel returns the
 * rest. Calldata encoders, return decoders and the wallet transactions Boing
 * Express signs. Pure and browser-safe: no SDK, no keys, nothing submitted.
 *
 * Calldata: selector in the last byte of word 0, then 32-byte words.
 */
import {
  escrowAccount,
  type EscrowWalletTx,
  type WalletAccessList,
} from "./escrow";
import { ItemSlug } from "./items";

export const ITEM_ESCROW_SELECTOR = {
  prepare: 0x60,
  list: 0x61,
  buy: 0x62,
  cancel: 0x63,
  listing: 0x64,
  fill: 0x65,
  setFee: 0x66,
  rescue: 0x67,
  setCollection: 0x68,
  config: 0x69,
  setAdmin: 0x6a,
  held: 0x6b,
} as const;

/** Reference multi-token selectors the item flow uses. */
export const REFERENCE_MT_BALANCE_OF = 0x20;
export const REFERENCE_MT_TRANSFER = 0x21;

/** LPIT item ids (apps/sim-host/src/boing/taxonomy.ts CompressedItemKind). */
export const LPIT_ITEM_IDS: Readonly<Record<string, number>> = {
  [ItemSlug.POTION_VITALITY]: 1,
  [ItemSlug.POTION_CALM]: 2,
  [ItemSlug.RATIONS]: 3,
  // Mint on demand: looted resources and crafted tools.
  [ItemSlug.CLOVER]: 4,
  [ItemSlug.GLOWMOSS]: 5,
  [ItemSlug.CRYSTAL_SHARD]: 6,
  [ItemSlug.MOONPETAL]: 7,
  [ItemSlug.SEED_BUNDLE]: 8,
  [ItemSlug.SALT_LICK]: 9,
  // Workshop: the last two materials and the crafted potions and tonics.
  [ItemSlug.THORNBERRY]: 10,
  [ItemSlug.AMBER_RESIN]: 11,
  [ItemSlug.POTION_MENDING]: 12,
  [ItemSlug.HEARTY_STEW]: 13,
  [ItemSlug.DREAM_DRAUGHT]: 14,
  [ItemSlug.TONIC_SWIFT]: 15,
  [ItemSlug.TONIC_MIGHT]: 16,
  [ItemSlug.TONIC_INSIGHT]: 17,
};

export function lpitItemId(slug: string): number | null {
  return LPIT_ITEM_IDS[slug] ?? null;
}

export function lpitItemSlug(itemId: number | bigint): ItemSlug | null {
  const n = Number(itemId);
  for (const [slug, id] of Object.entries(LPIT_ITEM_IDS)) {
    if (id === n) return slug as ItemSlug;
  }
  return null;
}

const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const ZERO_ACCOUNT = `0x${"0".repeat(64)}`;

function wordOf(n: bigint): string {
  if (n < 0n) throw new Error("negative word");
  return n.toString(16).padStart(64, "0");
}

function u64(n: number | bigint, what: string): string {
  const v = BigInt(n);
  if (v < 0n || v > U64_MAX) throw new Error(`${what} must fit in u64`);
  return wordOf(v);
}

function u128(n: bigint, what: string): string {
  if (n < 0n || n > U128_MAX) throw new Error(`${what} must fit in u128`);
  return wordOf(n);
}

function positive(n: number | bigint, what: string): bigint {
  const v = BigInt(n);
  if (v <= 0n) throw new Error(`${what} must be positive`);
  return v;
}

function calldata(selector: number, words: string[]): string {
  return `0x${wordOf(BigInt(selector))}${words.join("")}`;
}

const acct = (hex: string) => escrowAccount(hex).slice(2);

export const itemEscrowCalldata = {
  prepare: (collection: string, itemId: number | bigint) =>
    calldata(ITEM_ESCROW_SELECTOR.prepare, [
      acct(collection),
      u64(itemId, "item id"),
    ]),
  list: (
    collection: string,
    itemId: number | bigint,
    qty: number | bigint,
    unitPriceWei: bigint,
  ) =>
    calldata(ITEM_ESCROW_SELECTOR.list, [
      acct(collection),
      u64(itemId, "item id"),
      u64(positive(qty, "quantity"), "quantity"),
      u128(positive(unitPriceWei, "unit price"), "unit price"),
    ]),
  buy: (id: number | bigint, qty: number | bigint) =>
    calldata(ITEM_ESCROW_SELECTOR.buy, [
      u64(id, "listing id"),
      u64(positive(qty, "quantity"), "quantity"),
    ]),
  cancel: (id: number | bigint) =>
    calldata(ITEM_ESCROW_SELECTOR.cancel, [u64(id, "listing id")]),
  listing: (id: number | bigint) =>
    calldata(ITEM_ESCROW_SELECTOR.listing, [u64(id, "listing id")]),
  fill: (id: number | bigint, k: number | bigint) =>
    calldata(ITEM_ESCROW_SELECTOR.fill, [
      u64(id, "listing id"),
      u64(k, "fill index"),
    ]),
  setFee: (bps: number, feeTo: string) => {
    if (!Number.isInteger(bps) || bps < 0 || bps > 1000) {
      throw new Error("fee must be 0..1000 bps");
    }
    return calldata(ITEM_ESCROW_SELECTOR.setFee, [
      wordOf(BigInt(bps)),
      acct(feeTo),
    ]);
  },
  rescue: (
    collection: string,
    itemId: number | bigint,
    qty: number | bigint,
    to: string,
  ) =>
    calldata(ITEM_ESCROW_SELECTOR.rescue, [
      acct(collection),
      u64(itemId, "item id"),
      u64(positive(qty, "quantity"), "quantity"),
      acct(to),
    ]),
  setCollection: (collection: string, allowed: boolean) =>
    calldata(ITEM_ESCROW_SELECTOR.setCollection, [
      acct(collection),
      wordOf(allowed ? 1n : 0n),
    ]),
  config: () => calldata(ITEM_ESCROW_SELECTOR.config, []),
  setAdmin: (admin: string) =>
    calldata(ITEM_ESCROW_SELECTOR.setAdmin, [acct(admin)]),
  held: (collection: string, itemId: number | bigint) =>
    calldata(ITEM_ESCROW_SELECTOR.held, [
      acct(collection),
      u64(itemId, "item id"),
    ]),
};

/** Reference multi-token calldata (same layout as the SDK encoders). */
export const multiTokenCalldata = {
  balanceOf: (account: string, itemId: number | bigint) =>
    calldata(REFERENCE_MT_BALANCE_OF, [acct(account), u64(itemId, "item id")]),
  transfer: (to: string, itemId: number | bigint, amount: number | bigint) =>
    calldata(REFERENCE_MT_TRANSFER, [
      acct(to),
      u64(itemId, "item id"),
      u128(BigInt(amount), "amount"),
    ]),
};

function words(returnHex: string, count: number): string[] | null {
  const h = returnHex.startsWith("0x") ? returnHex.slice(2) : returnHex;
  if (h.length < count * 64 || !/^[0-9a-fA-F]*$/.test(h)) return null;
  return Array.from({ length: count }, (_, i) =>
    h.slice(i * 64, (i + 1) * 64).toLowerCase(),
  );
}

const big = (w: string) => BigInt(`0x${w}`);

export type ItemEscrowListing = {
  id: number;
  sellerHex: string;
  collectionHex: string;
  itemId: number;
  unitPriceWei: bigint;
  listed: number;
  /** Units left while open; after a cancel, the units returned. */
  remaining: number;
  open: boolean;
  fills: number;
};

/** Decode `listing(id)`; null when no listing has that id. */
export function decodeItemEscrowListing(
  id: number,
  returnHex: string,
): ItemEscrowListing | null {
  const w = words(returnHex, 8);
  if (w == null) return null;
  const seller = `0x${w[0]}`;
  if (seller === ZERO_ACCOUNT) return null;
  return {
    id,
    sellerHex: seller,
    collectionHex: `0x${w[1]}`,
    itemId: Number(big(w[2]!)),
    unitPriceWei: big(w[3]!),
    listed: Number(big(w[4]!)),
    remaining: Number(big(w[5]!)),
    open: big(w[6]!) !== 0n,
    fills: Number(big(w[7]!)),
  };
}

export type ItemEscrowFill = { buyerHex: string; qty: number };

/** Decode `fill(id, k)`; null when that fill does not exist. */
export function decodeItemEscrowFill(returnHex: string): ItemEscrowFill | null {
  const w = words(returnHex, 2);
  if (w == null) return null;
  const buyer = `0x${w[0]}`;
  if (buyer === ZERO_ACCOUNT) return null;
  return { buyerHex: buyer, qty: Number(big(w[1]!)) };
}

export type ItemEscrowConfig = {
  adminHex: string;
  feeBps: number;
  feeToHex: string;
  /** Highest listing id so far (ids start at 1). */
  lastId: number;
};

export function decodeItemEscrowConfig(
  returnHex: string,
): ItemEscrowConfig | null {
  const w = words(returnHex, 4);
  if (w == null) return null;
  return {
    adminHex: `0x${w[0]}`,
    feeBps: Number(big(w[1]!)),
    feeToHex: `0x${w[2]}`,
    lastId: Number(big(w[3]!)),
  };
}

/** Decode a multi-token `balance_of` word (u128). */
export function decodeMultiTokenBalance(returnHex: string): bigint | null {
  const w = words(returnHex, 1);
  return w == null ? null : big(w[0]!);
}

function accessList(
  ...accounts: (string | null | undefined)[]
): WalletAccessList {
  const seen = [
    ...new Set(
      accounts.filter((a): a is string => a != null).map(escrowAccount),
    ),
  ];
  return { read: seen, write: [...seen] };
}

/**
 * Seller: one atomic batch that snapshots the escrow balance, moves `qty`
 * units into the escrow and opens the listing. Any failed step reverts all.
 */
export function buildItemListTx(input: {
  itemEscrowHex: string;
  collectionHex: string;
  sellerHex: string;
  itemId: number;
  qty: number;
  unitPriceWei: bigint;
  itemName?: string;
}): EscrowWalletTx {
  const { itemEscrowHex: e, collectionHex: c } = input;
  return {
    type: "batch",
    calls: [
      {
        type: "contract_call",
        contract: escrowAccount(e),
        calldata: itemEscrowCalldata.prepare(c, input.itemId),
      },
      {
        type: "contract_call",
        contract: escrowAccount(c),
        calldata: multiTokenCalldata.transfer(e, input.itemId, input.qty),
      },
      {
        type: "contract_call",
        contract: escrowAccount(e),
        calldata: itemEscrowCalldata.list(
          c,
          input.itemId,
          input.qty,
          input.unitPriceWei,
        ),
      },
    ],
    access_list: accessList(input.sellerHex, e, c),
    summary: `List ${input.qty} × ${input.itemName ?? `item #${input.itemId}`} in the item escrow`,
  };
}

/** Buyer: pay exactly `qty * unit price`; the escrow splits it on chain. */
export function buildItemBuyTx(input: {
  itemEscrowHex: string;
  collectionHex: string;
  buyerHex: string;
  sellerHex: string;
  feeToHex: string;
  listingId: number;
  qty: number;
  unitPriceWei: bigint;
  itemName?: string;
}): EscrowWalletTx {
  const total = itemTotalWei(input.unitPriceWei, input.qty);
  return {
    type: "contract_call",
    contract: escrowAccount(input.itemEscrowHex),
    calldata: itemEscrowCalldata.buy(input.listingId, input.qty),
    value: total.toString(),
    access_list: accessList(
      input.buyerHex,
      input.itemEscrowHex,
      input.collectionHex,
      input.sellerHex,
      input.feeToHex,
    ),
    summary: `Buy ${input.qty} × ${input.itemName ?? "item"} (listing #${input.listingId})`,
  };
}

/** Seller (or admin): cancel and take the unsold units back. */
export function buildItemCancelTx(input: {
  itemEscrowHex: string;
  collectionHex: string;
  senderHex: string;
  sellerHex: string;
  listingId: number;
}): EscrowWalletTx {
  return {
    type: "contract_call",
    contract: escrowAccount(input.itemEscrowHex),
    calldata: itemEscrowCalldata.cancel(input.listingId),
    access_list: accessList(
      input.senderHex,
      input.itemEscrowHex,
      input.collectionHex,
      input.sellerHex,
    ),
    summary: `Cancel item listing #${input.listingId}`,
  };
}

export function itemTotalWei(unitPriceWei: bigint, qty: number): bigint {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error("quantity must be a positive whole number");
  }
  return unitPriceWei * BigInt(qty);
}
