/**
 * Marketplace config. Everything is optional: with nothing set the catalog is
 * browse-only. No signing key is ever read here; settlement is a separate,
 * operator-run step.
 *
 * - `LIVING_PETS_OPERATOR_HEX`: operator wallet (0x + 64 hex) that owns NFTs
 *   until a player adopts or claims them.
 * - `LIVING_PETS_ESCROW_HEX`: the deployed escrow contract
 *   (`contracts/escrow`). Trading turns on only when both are set.
 * - `LIVING_PETS_ITEM_ESCROW_HEX`: the deployed item escrow
 *   (`contracts/escrow/src/items.rs`) for LPIT quantities. The item market
 *   turns on when it and `LIVING_PETS_BOING_ITEM_COLLECTION_HEX` (the LPIT
 *   collection) are both set.
 */
import { BOING_TESTNET_CHAIN_ID_DECIMAL } from "@boing-network/boing-sdk";
import type { MarketEscrowInfo } from "@boing-pets/contract";
import { normalizeWalletAddress } from "../multiplayer/wallet-auth";

export type MarketConfig = {
  operatorHex: string | null;
  escrowHex: string | null;
  itemEscrowHex: string | null;
  itemCollectionHex: string | null;
  chainId: number;
  /** Values that were set but are not valid addresses (names only). */
  invalid: string[];
};

export function readMarketConfig(
  env: NodeJS.ProcessEnv = process.env,
): MarketConfig {
  const invalid: string[] = [];
  const read = (name: string): string | null => {
    const raw = env[name]?.trim();
    if (!raw) return null;
    const address = normalizeWalletAddress(raw);
    if (address == null) invalid.push(name);
    return address;
  };
  return {
    operatorHex: read("LIVING_PETS_OPERATOR_HEX"),
    escrowHex: read("LIVING_PETS_ESCROW_HEX"),
    itemEscrowHex: read("LIVING_PETS_ITEM_ESCROW_HEX"),
    itemCollectionHex: read("LIVING_PETS_BOING_ITEM_COLLECTION_HEX"),
    chainId: BOING_TESTNET_CHAIN_ID_DECIMAL,
    invalid,
  };
}

/** What the listing index last read from the escrow contract. */
export type EscrowChainState = {
  feeBps: number | null;
  feeToHex: string | null;
  refreshedAtMs: number | null;
  error: string | null;
};

export function escrowInfo(
  config: MarketConfig,
  chain: EscrowChainState | null = null,
): MarketEscrowInfo {
  const base = {
    escrowHex: config.escrowHex,
    operatorHex: config.operatorHex,
    chainId: config.chainId,
    feeBps: chain?.feeBps ?? null,
    feeToHex: chain?.feeToHex ?? null,
    listingsAtMs: chain?.refreshedAtMs ?? null,
    itemEscrowHex: itemMarketEnabled(config) ? config.itemEscrowHex : null,
  };
  if (config.operatorHex == null) {
    return {
      ...base,
      mode: "DISABLED",
      note: "Browse only: the operator wallet is not configured yet.",
    };
  }
  if (config.escrowHex == null) {
    return {
      ...base,
      mode: "DISABLED",
      note: "Browse only: no escrow account is configured on this server.",
    };
  }
  return {
    ...base,
    mode: "CONTRACT",
    note:
      chain?.refreshedAtMs == null
        ? "Escrow contract configured; its listings have not been read yet."
        : "Trades settle in the escrow contract on Boing testnet: one wallet transaction to list, buy, adopt or cancel.",
  };
}

/** The LPIT item market needs the item escrow and the LPIT collection. */
export function itemMarketEnabled(config: MarketConfig): boolean {
  return config.itemEscrowHex != null && config.itemCollectionHex != null;
}
