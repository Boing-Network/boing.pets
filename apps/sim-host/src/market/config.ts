/**
 * Marketplace config. Everything is optional: with nothing set the catalog is
 * browse-only. No signing key is ever read here; settlement is a separate,
 * operator-run step.
 *
 * - `LIVING_PETS_OPERATOR_HEX`: operator wallet (0x + 64 hex) that owns NFTs
 *   until a player adopts or claims them.
 * - `LIVING_PETS_ESCROW_HEX`: escrow account that holds listed NFTs and
 *   payments. Trading turns on only when both are set.
 */
import { BOING_TESTNET_CHAIN_ID_DECIMAL } from "@boing-network/boing-sdk";
import type { MarketEscrowInfo } from "@boing-pets/contract";
import { normalizeWalletAddress } from "../multiplayer/wallet-auth";

export type MarketConfig = {
  operatorHex: string | null;
  escrowHex: string | null;
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
    chainId: BOING_TESTNET_CHAIN_ID_DECIMAL,
    invalid,
  };
}

export function escrowInfo(config: MarketConfig): MarketEscrowInfo {
  const base = {
    escrowHex: config.escrowHex,
    operatorHex: config.operatorHex,
    chainId: config.chainId,
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
    mode: "CUSTODIAL",
    note: "Testnet escrow: NFTs and BOING are held by the escrow account and released when both sides have paid in.",
  };
}
