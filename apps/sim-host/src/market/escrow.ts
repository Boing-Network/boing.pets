/**
 * Escrow trade plans. These only describe the transactions each party signs
 * with their own wallet; nothing here holds a key or submits anything.
 *
 * Testnet has no NFT escrow contract yet (the reference NFT collection has
 * `transfer_nft` but no approve/transfer-from), so escrow is an account run by
 * the operator: the seller deposits the NFT with it, the buyer pays the price
 * into it, and a separate settlement step releases the NFT to the buyer and
 * the BOING to the seller (or refunds both on cancel).
 */
import {
  encodeReferenceTransferNftCalldataHex,
  ensure0xHex,
} from "@boing-network/boing-sdk";

export type WalletCall =
  | {
      kind: "contract_call";
      /** Collection contract. */
      contractHex: string;
      calldataHex: string;
      summary: string;
    }
  | {
      kind: "transfer";
      toHex: string;
      amountWei: string;
      summary: string;
    };

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

/** Seller: deposit the NFT with escrow to open a listing. */
export function planListingDeposit(input: {
  collectionHex: string;
  tokenIdHex: string;
  escrowHex: string;
}): WalletCall {
  return {
    kind: "contract_call",
    contractHex: ensure0xHex(input.collectionHex),
    calldataHex: encodeReferenceTransferNftCalldataHex(
      ensure0xHex(input.escrowHex),
      ensure0xHex(input.tokenIdHex),
    ),
    summary: "Deposit the NFT with escrow",
  };
}

/** Buyer (or adopter): pay the price into escrow. */
export function planEscrowPayment(input: {
  escrowHex: string;
  priceWei: bigint;
}): WalletCall {
  if (input.priceWei < 0n) throw new Error("price must not be negative");
  return {
    kind: "transfer",
    toHex: ensure0xHex(input.escrowHex),
    amountWei: input.priceWei.toString(),
    summary: `Pay ${weiToBoing(input.priceWei)} BOING into escrow`,
  };
}

/** Escrow settlement after both deposits: NFT to buyer, BOING to seller. */
export function planSettlement(input: {
  collectionHex: string;
  tokenIdHex: string;
  buyerHex: string;
  sellerHex: string;
  priceWei: bigint;
}): WalletCall[] {
  return [
    {
      kind: "contract_call",
      contractHex: ensure0xHex(input.collectionHex),
      calldataHex: encodeReferenceTransferNftCalldataHex(
        ensure0xHex(input.buyerHex),
        ensure0xHex(input.tokenIdHex),
      ),
      summary: "Escrow releases the NFT to the buyer",
    },
    {
      kind: "transfer",
      toHex: ensure0xHex(input.sellerHex),
      amountWei: input.priceWei.toString(),
      summary: `Escrow pays ${weiToBoing(input.priceWei)} BOING to the seller`,
    },
  ];
}
