/**
 * Living Pets marketplace escrow (Boing VM contract in `contracts/escrow`):
 * calldata encoders, return decoders, the fee split, and the transaction
 * objects Boing Express signs (`boing_sendTransaction`). Pure and
 * browser-safe: no SDK, no keys, nothing is submitted from here.
 *
 * Calldata: selector in the last byte of word 0, then 32-byte words.
 */
export const ESCROW_SELECTOR = {
  list: 0x40,
  cancel: 0x41,
  buy: 0x42,
  claim: 0x43,
  listing: 0x44,
  setFee: 0x45,
  rescue: 0x46,
  setCollection: 0x47,
  config: 0x48,
  setAdmin: 0x49,
  collection: 0x4a,
  prepare: 0x4b,
} as const;

/** Reference NFT collection selectors the escrow flow uses. */
export const REFERENCE_NFT_OWNER_OF = 0x03;
export const REFERENCE_NFT_TRANSFER = 0x04;

/** Marketplace fee: 2.5% to the operator until the admin changes it. */
export const ESCROW_DEFAULT_FEE_BPS = 250;
/** The contract refuses fees above 10%. */
export const ESCROW_MAX_FEE_BPS = 1000;
export const ESCROW_BPS_DENOMINATOR = 10_000;

/** Purpose category the escrow deploys under (Boing Quality Gate). */
export const ESCROW_PURPOSE_CATEGORY = "dapp";

const ACCOUNT = /^0x[0-9a-f]{64}$/;
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const ZERO_ACCOUNT = `0x${"0".repeat(64)}`;

/** Lower-case 0x + 64 hex account; throws on anything else. */
export function escrowAccount(hex: string): string {
  const h = hex.trim().toLowerCase();
  const full = h.startsWith("0x") ? h : `0x${h}`;
  if (!ACCOUNT.test(full)) throw new Error(`not a Boing account: ${hex}`);
  return full;
}

function wordOf(n: bigint): string {
  if (n < 0n) throw new Error("negative word");
  return n.toString(16).padStart(64, "0");
}

/**
 * Token id from a 32-byte hex word or a number. The escrow keys listings by
 * a u64 token id, so larger ids are refused here (the contract faults too).
 */
export function escrowTokenId(token: string | number | bigint): bigint {
  const n =
    typeof token === "string"
      ? BigInt(token.startsWith("0x") ? token : `0x${token}`)
      : BigInt(token);
  if (n < 0n || n > U64_MAX) throw new Error("token id must fit in u64");
  return n;
}

function calldata(selector: number, words: string[]): string {
  return `0x${wordOf(BigInt(selector))}${words.join("")}`;
}

const acct = (hex: string) => escrowAccount(hex).slice(2);
const tok = (t: string | number | bigint) => wordOf(escrowTokenId(t));

function price(p: bigint): string {
  if (p < 0n || p > U128_MAX) throw new Error("price must fit in u128");
  return wordOf(p);
}

export const escrowCalldata = {
  prepare: (collection: string, token: string | number | bigint) =>
    calldata(ESCROW_SELECTOR.prepare, [acct(collection), tok(token)]),
  list: (
    collection: string,
    token: string | number | bigint,
    priceWei: bigint,
    reservedBuyer: string | null = null,
  ) =>
    calldata(ESCROW_SELECTOR.list, [
      acct(collection),
      tok(token),
      price(priceWei),
      reservedBuyer == null ? wordOf(0n) : acct(reservedBuyer),
    ]),
  cancel: (collection: string, token: string | number | bigint) =>
    calldata(ESCROW_SELECTOR.cancel, [acct(collection), tok(token)]),
  buy: (collection: string, token: string | number | bigint) =>
    calldata(ESCROW_SELECTOR.buy, [acct(collection), tok(token)]),
  claim: (collection: string, token: string | number | bigint) =>
    calldata(ESCROW_SELECTOR.claim, [acct(collection), tok(token)]),
  listing: (collection: string, token: string | number | bigint) =>
    calldata(ESCROW_SELECTOR.listing, [acct(collection), tok(token)]),
  setFee: (bps: number, feeTo: string) => {
    if (!Number.isInteger(bps) || bps < 0 || bps > ESCROW_MAX_FEE_BPS) {
      throw new Error(`fee must be 0..${ESCROW_MAX_FEE_BPS} bps`);
    }
    return calldata(ESCROW_SELECTOR.setFee, [wordOf(BigInt(bps)), acct(feeTo)]);
  },
  rescue: (collection: string, token: string | number | bigint, to: string) =>
    calldata(ESCROW_SELECTOR.rescue, [acct(collection), tok(token), acct(to)]),
  setCollection: (collection: string, allowed: boolean) =>
    calldata(ESCROW_SELECTOR.setCollection, [
      acct(collection),
      wordOf(allowed ? 1n : 0n),
    ]),
  config: () => calldata(ESCROW_SELECTOR.config, []),
  setAdmin: (admin: string) =>
    calldata(ESCROW_SELECTOR.setAdmin, [acct(admin)]),
  collection: (collection: string) =>
    calldata(ESCROW_SELECTOR.collection, [acct(collection)]),
};

/** Reference NFT calldata (same layout as the SDK encoders). */
export const referenceNftCalldata = {
  /** 96 bytes, like the SDK (`owner_of` reads only the token word). */
  ownerOf: (token: string | number | bigint) =>
    calldata(REFERENCE_NFT_OWNER_OF, [tok(token), wordOf(0n)]),
  transfer: (to: string, token: string | number | bigint) =>
    calldata(REFERENCE_NFT_TRANSFER, [acct(to), tok(token)]),
};

function words(returnHex: string, count: number): string[] | null {
  const h = returnHex.startsWith("0x") ? returnHex.slice(2) : returnHex;
  if (h.length < count * 64 || !/^[0-9a-fA-F]*$/.test(h)) return null;
  return Array.from({ length: count }, (_, i) =>
    h.slice(i * 64, (i + 1) * 64).toLowerCase(),
  );
}

export type EscrowListing = {
  sellerHex: string;
  priceWei: bigint;
  /** Reserved buyer, or null when anyone may buy. */
  buyerHex: string | null;
};

/** Decode `listing` return data; null when there is no open listing. */
export function decodeEscrowListing(returnHex: string): EscrowListing | null {
  const w = words(returnHex, 3);
  if (w == null) return null;
  const seller = `0x${w[0]}`;
  if (seller === ZERO_ACCOUNT) return null;
  const buyer = `0x${w[2]}`;
  return {
    sellerHex: seller,
    priceWei: BigInt(`0x${w[1]}`),
    buyerHex: buyer === ZERO_ACCOUNT ? null : buyer,
  };
}

export type EscrowConfig = {
  adminHex: string;
  feeBps: number;
  feeToHex: string;
};

/** Decode `config` return data (admin, fee bps, fee account). */
export function decodeEscrowConfig(returnHex: string): EscrowConfig | null {
  const w = words(returnHex, 3);
  if (w == null) return null;
  return {
    adminHex: `0x${w[0]}`,
    feeBps: Number(BigInt(`0x${w[1]}`)),
    feeToHex: `0x${w[2]}`,
  };
}

/** Decode a reference NFT `owner_of` return word; null when unminted. */
export function decodeOwnerOf(returnHex: string): string | null {
  const w = words(returnHex, 1);
  if (w == null) return null;
  const owner = `0x${w[0]}`;
  return owner === ZERO_ACCOUNT ? null : owner;
}

/** The split the contract applies: fee floored, the seller gets the rest. */
export function escrowSplit(
  priceWei: bigint,
  feeBps: number = ESCROW_DEFAULT_FEE_BPS,
): { feeWei: bigint; sellerWei: bigint } {
  const feeWei = (priceWei * BigInt(feeBps)) / BigInt(ESCROW_BPS_DENOMINATOR);
  return { feeWei, sellerWei: priceWei - feeWei };
}

/** Access list entry for Boing Express (32-byte accounts). */
export type WalletAccessList = { read: string[]; write: string[] };

export type WalletContractCall = {
  type: "contract_call";
  contract: string;
  calldata: string;
  /** Native BOING in base units (decimal string), buy only. */
  value?: string;
};

/** A transaction object for `boing_sendTransaction` (Boing Express). */
export type EscrowWalletTx =
  | (WalletContractCall & { access_list: WalletAccessList; summary: string })
  | {
      type: "batch";
      calls: WalletContractCall[];
      access_list: WalletAccessList;
      summary: string;
    };

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

export type EscrowTarget = {
  escrowHex: string;
  collectionHex: string;
  tokenId: string | number | bigint;
};

/**
 * Seller: one atomic batch that records the pending seller, moves the NFT
 * into escrow and opens the listing. Any failed step reverts all three.
 */
export function buildEscrowListTx(
  input: EscrowTarget & {
    sellerHex: string;
    priceWei: bigint;
    reservedBuyerHex?: string | null;
  },
): EscrowWalletTx {
  const { escrowHex, collectionHex, tokenId } = input;
  return {
    type: "batch",
    calls: [
      {
        type: "contract_call",
        contract: escrowAccount(escrowHex),
        calldata: escrowCalldata.prepare(collectionHex, tokenId),
      },
      {
        type: "contract_call",
        contract: escrowAccount(collectionHex),
        calldata: referenceNftCalldata.transfer(escrowHex, tokenId),
      },
      {
        type: "contract_call",
        contract: escrowAccount(escrowHex),
        calldata: escrowCalldata.list(
          collectionHex,
          tokenId,
          input.priceWei,
          input.reservedBuyerHex ?? null,
        ),
      },
    ],
    access_list: accessList(input.sellerHex, escrowHex, collectionHex),
    summary:
      input.reservedBuyerHex != null
        ? `List NFT #${escrowTokenId(tokenId)} in escrow, reserved for ${escrowAccount(input.reservedBuyerHex).slice(0, 10)}…`
        : `List NFT #${escrowTokenId(tokenId)} in escrow`,
  };
}

/** Buyer: pay exactly the listed price; the escrow splits it on chain. */
export function buildEscrowBuyTx(
  input: EscrowTarget & {
    buyerHex: string;
    sellerHex: string;
    feeToHex: string;
    priceWei: bigint;
  },
): EscrowWalletTx {
  if (input.priceWei < 0n) throw new Error("price must not be negative");
  return {
    type: "contract_call",
    contract: escrowAccount(input.escrowHex),
    calldata: escrowCalldata.buy(input.collectionHex, input.tokenId),
    ...(input.priceWei > 0n ? { value: input.priceWei.toString() } : {}),
    access_list: accessList(
      input.buyerHex,
      input.escrowHex,
      input.collectionHex,
      input.sellerHex,
      input.feeToHex,
    ),
    summary: `Buy NFT #${escrowTokenId(input.tokenId)}`,
  };
}

/** Player: claim an adoption (a 0-price listing reserved for them). */
export function buildEscrowClaimTx(
  input: EscrowTarget & { playerHex: string },
): EscrowWalletTx {
  return {
    type: "contract_call",
    contract: escrowAccount(input.escrowHex),
    calldata: escrowCalldata.claim(input.collectionHex, input.tokenId),
    access_list: accessList(
      input.playerHex,
      input.escrowHex,
      input.collectionHex,
    ),
    summary: `Adopt NFT #${escrowTokenId(input.tokenId)}`,
  };
}

/** Seller (or admin): cancel and take the NFT back. */
export function buildEscrowCancelTx(
  input: EscrowTarget & { senderHex: string; sellerHex: string },
): EscrowWalletTx {
  return {
    type: "contract_call",
    contract: escrowAccount(input.escrowHex),
    calldata: escrowCalldata.cancel(input.collectionHex, input.tokenId),
    access_list: accessList(
      input.senderHex,
      input.escrowHex,
      input.collectionHex,
      input.sellerHex,
    ),
    summary: `Cancel the listing of NFT #${escrowTokenId(input.tokenId)}`,
  };
}

export const ONE_BOING_WEI = 10n ** 18n;

/** Parse a BOING amount ("1.5") into base units; null when invalid. */
export function boingToWei(text: string): bigint | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole!) * ONE_BOING_WEI + BigInt(frac.padEnd(18, "0"));
}

export function weiToBoing(wei: bigint | string): string {
  const v = BigInt(wei);
  const whole = v / ONE_BOING_WEI;
  const frac = (v % ONE_BOING_WEI)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
