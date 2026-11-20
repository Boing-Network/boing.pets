/**
 * Boing wallet sign-in for the shared world (Node only).
 *
 * Same trust model as the old pasture app: the server issues a one-time
 * challenge bound to origin, chain id, address, nonce and expiry; Boing
 * Express signs it with `boing_signMessage`; the server checks
 * Ed25519(signature, BLAKE3(UTF-8 message), address). A Boing account id is
 * the 32-byte Ed25519 public key (`0x` + 64 hex).
 */
import { randomBytes } from "node:crypto";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";

/** Boing testnet chain id (0x1b01), as signed by Express. */
export const BOING_CHAIN_ID = 6913;
export const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_OPEN_CHALLENGES = 10_000;

const ADDRESS = /^0x[0-9a-f]{64}$/;
const SIGNATURE = /^(0x)?[0-9a-f]{128}$/;

/** Lowercase `0x` + 64 hex, or null when `raw` is not a Boing account id. */
export function normalizeWalletAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const lower = raw.trim().toLowerCase();
  const withPrefix = lower.startsWith("0x") ? lower : `0x${lower}`;
  return ADDRESS.test(withPrefix) ? withPrefix : null;
}

/** Account id for a wallet session (rate limits key on it). */
export function walletAccountId(address: string): string {
  return `w:${address.slice(2)}`;
}

/** `0x1a2b3c…9f0e`: the default display name for a wallet player. */
export function shortWallet(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

export function walletSignInMessage(input: {
  origin: string;
  chainId: number;
  address: string;
  nonce: string;
  issuedAtMs: number;
  expiresAtMs: number;
}): string {
  return [
    "Boing Pets sign-in v1",
    `Origin: ${input.origin}`,
    `Chain: ${input.chainId}`,
    `Address: ${input.address}`,
    `Nonce: ${input.nonce}`,
    `Issued: ${input.issuedAtMs}`,
    `Expires: ${input.expiresAtMs}`,
  ].join("\n");
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: unknown,
): Promise<boolean> {
  if (typeof signature !== "string") return false;
  const sig = signature.trim().toLowerCase();
  if (!SIGNATURE.test(sig)) return false;
  try {
    return await ed.verifyAsync(
      hexToBytes(sig.replace(/^0x/, "")),
      blake3(new TextEncoder().encode(message)),
      hexToBytes(address.slice(2)),
    );
  } catch {
    return false;
  }
}

export type WalletChallenge = {
  address: string;
  nonce: string;
  message: string;
  expiresAt: number;
};

export type WalletChallenges = {
  issue(address: string, origin: string): WalletChallenge;
  /**
   * Single use: the challenge is removed whether or not the signature checks
   * out. Resolves to the verified address, or null.
   */
  redeem(proof: {
    address: unknown;
    nonce: unknown;
    signature: unknown;
  }): Promise<string | null>;
  size(): number;
};

export function createWalletChallenges(options?: {
  chainId?: number;
  ttlMs?: number;
  nowMs?: () => number;
  max?: number;
}): WalletChallenges {
  const chainId = options?.chainId ?? BOING_CHAIN_ID;
  const ttlMs = options?.ttlMs ?? WALLET_CHALLENGE_TTL_MS;
  const nowMs = options?.nowMs ?? (() => Date.now());
  const max = options?.max ?? MAX_OPEN_CHALLENGES;
  const open = new Map<string, WalletChallenge>();

  function prune(now: number): void {
    for (const [nonce, challenge] of open) {
      if (challenge.expiresAt <= now) open.delete(nonce);
    }
    // Still full: drop the oldest (Map keeps insertion order).
    while (open.size >= max) {
      const oldest = open.keys().next().value;
      if (oldest === undefined) break;
      open.delete(oldest);
    }
  }

  return {
    issue(address, origin) {
      const now = nowMs();
      prune(now);
      const nonce = randomBytes(16).toString("hex");
      const expiresAt = now + ttlMs;
      const challenge: WalletChallenge = {
        address,
        nonce,
        expiresAt,
        message: walletSignInMessage({
          origin,
          chainId,
          address,
          nonce,
          issuedAtMs: now,
          expiresAtMs: expiresAt,
        }),
      };
      open.set(nonce, challenge);
      return challenge;
    },
    async redeem(proof) {
      if (typeof proof.nonce !== "string") return null;
      const challenge = open.get(proof.nonce);
      if (challenge == null) return null;
      open.delete(proof.nonce);
      const address = normalizeWalletAddress(proof.address);
      if (address == null || address !== challenge.address) return null;
      if (challenge.expiresAt <= nowMs()) return null;
      const ok = await verifyWalletSignature(
        address,
        challenge.message,
        proof.signature,
      );
      return ok ? address : null;
    },
    size() {
      return open.size;
    },
  };
}
