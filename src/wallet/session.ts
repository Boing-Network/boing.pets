import { createBoingWebWalletProvider } from "@boing-network/boing-sdk";
import { hex32 } from "../core";

export interface BoingProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, handler: () => void) => void;
  removeListener?: (event: string, handler: () => void) => void;
  isBoingWeb?: boolean;
  disconnect?: () => void;
}

const CHAIN_HEX = "0x1b01";

/** Prefer injected Express; otherwise the web-wallet popup provider. */
export function getBoingProvider(): BoingProvider {
  const injected = (window as Window & { boing?: BoingProvider }).boing;
  if (injected) return injected;
  return createBoingWebWalletProvider({
    chainId: CHAIN_HEX,
    mode: "popup",
  }) as BoingProvider;
}

/** Silent account read — no popup. */
export async function readBoingAccounts(
  provider: BoingProvider,
): Promise<string[]> {
  try {
    const accounts = (await provider.request({
      method: "boing_accounts",
      params: [],
    })) as string[];
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

/**
 * Restore a previously authorized Express session without prompting.
 * Returns the canonical owner hex, or null if the user still needs Connect.
 */
export async function tryRestoreWalletSession(
  provider: BoingProvider = getBoingProvider(),
): Promise<{ provider: BoingProvider; owner: string } | null> {
  const accounts = await readBoingAccounts(provider);
  if (!accounts[0]) return null;
  const owner = hex32(accounts[0]);
  if (!provider.isBoingWeb) {
    try {
      const chain = await provider.request({
        method: "boing_chainId",
        params: [],
      });
      if (Number(chain) !== 6913) return null;
    } catch {
      return null;
    }
  }
  return { provider, owner };
}

/** Interactive connect (may open Express). Call from a click handler. */
export async function requestWalletSession(
  provider: BoingProvider = getBoingProvider(),
): Promise<{ provider: BoingProvider; owner: string }> {
  const accounts = (await provider.request({
    method: "boing_requestAccounts",
    params: [],
  })) as string[];
  if (!accounts?.[0]) throw new Error("No Express account returned");
  const owner = hex32(accounts[0]);
  if (!provider.isBoingWeb) {
    const chain = await provider.request({
      method: "boing_chainId",
      params: [],
    });
    if (Number(chain) !== 6913)
      throw new Error("Switch Express to Boing testnet 6913 before continuing");
    const again = await readBoingAccounts(provider);
    if (!again[0] || hex32(again[0]) !== owner)
      throw new Error("Wallet account changed. Disconnect and reconnect.");
  }
  return { provider, owner };
}

export function clearWalletSession(provider: BoingProvider | null) {
  try {
    provider?.disconnect?.();
  } catch {
    /* ignore */
  }
}
