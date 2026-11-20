/**
 * Boing Express sign-in for the shared world (same wallet flow as the old
 * pasture app): prefer the injected extension (`window.boing`), otherwise
 * the boing.express web wallet from @boing-network/boing-sdk (loaded lazily,
 * so the SDK never weighs on the first paint).
 *
 * The wallet signs the server's challenge with `boing_signMessage`
 * (Ed25519 over BLAKE3 of the message); no transaction, no fee.
 */
import type { SharedWorldControls } from "../state/sharedWorldStore";

export type BoingProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isBoingWeb?: boolean;
};

/** Boing testnet, as in the old app (`0x1b01` = 6913). */
export const BOING_CHAIN_HEX = "0x1b01";
const ADDRESS = /^0x[0-9a-fA-F]{64}$/;

function injected(): BoingProvider | null {
  const candidate = (globalThis as { boing?: unknown }).boing;
  return candidate != null &&
    typeof (candidate as BoingProvider).request === "function"
    ? (candidate as BoingProvider)
    : null;
}

let webProvider: BoingProvider | null = null;
let preparing: Promise<void> | null = null;

/**
 * Load the web-wallet fallback ahead of the click so the first wallet
 * request runs inside the user gesture (popup blockers).
 */
export function prepareBoingWallet(): Promise<void> {
  if (injected() != null || webProvider != null) return Promise.resolve();
  preparing ??= import("@boing-network/boing-sdk")
    .then(({ createBoingWebWalletProvider }) => {
      webProvider = createBoingWebWalletProvider({
        chainId: BOING_CHAIN_HEX,
        mode: "popup",
      }) as BoingProvider;
    })
    .catch(() => {
      preparing = null;
    });
  return preparing;
}

export function resolveBoingProvider(): BoingProvider | null {
  return injected() ?? webProvider;
}

function firstAccount(accounts: unknown): string {
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== "string" || !ADDRESS.test(first)) {
    throw new Error("Boing Express returned no account");
  }
  return first.toLowerCase();
}

async function checkChain(provider: BoingProvider): Promise<void> {
  let chain: unknown;
  try {
    chain = await provider.request({ method: "boing_chainId" });
  } catch {
    return; // older providers: the signed message still names the chain
  }
  if (typeof chain === "string" && chain.toLowerCase() !== BOING_CHAIN_HEX) {
    throw new Error("Switch Boing Express to Boing testnet (chain 6913)");
  }
}

/** Connect, sign the server's challenge, and reconnect as that wallet. */
export async function signInWithBoing(
  controls: SharedWorldControls,
  provider: BoingProvider | null = resolveBoingProvider(),
): Promise<string> {
  if (provider == null) {
    await prepareBoingWallet();
    provider = resolveBoingProvider();
    if (provider == null) throw new Error("Boing wallet unavailable");
  }
  const address = firstAccount(
    await provider.request({ method: "boing_requestAccounts", params: [] }),
  );
  if (!provider.isBoingWeb) await checkChain(provider);
  const challenge = await controls.requestChallenge(address);
  const signature = await provider.request({
    method: "boing_signMessage",
    params: [challenge.message, address],
  });
  if (typeof signature !== "string" || signature.length < 64) {
    throw new Error("Boing Express did not return a signature");
  }
  controls.signIn({ address, nonce: challenge.nonce, signature });
  return address;
}

/** Friendly text for wallet errors (declined, closed popup, wrong chain). */
export function walletErrorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/reject|denied|declin|cancel|closed/i.test(text)) {
    return "Sign-in cancelled in Boing Express.";
  }
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}
