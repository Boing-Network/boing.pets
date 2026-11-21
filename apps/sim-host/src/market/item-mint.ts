/**
 * Mint on demand over HTTP (`POST /market/v1/items/mint/challenge`, then
 * `POST /market/v1/items/mint`). Same trust model as wallet sign-in: the
 * server issues a one-time challenge naming origin, chain, wallet, item,
 * quantity, nonce and expiry; Boing Express signs it (`boing_signMessage`);
 * the server checks the Ed25519 signature over BLAKE3 of the message, then
 * the item service moves the units and queues the LPIT mint to that wallet.
 *
 * The wallet pays nothing: the operator submits the mint through its nonce
 * queue. Abuse is bounded by MINT_RULES (quantity per request, requests per
 * wallet per day) and by the units the wallet actually holds unminted.
 */
import { randomBytes } from "node:crypto";
import {
  MINT_RULES,
  isItemSlug,
  lpitItemId,
  type MarketMintChallenge,
  type MarketMintResult,
} from "@boing-pets/contract";
import {
  BOING_CHAIN_ID,
  normalizeWalletAddress,
  verifyWalletSignature,
} from "../multiplayer/wallet-auth";

export const MINT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_OPEN = 5_000;

export function itemMintMessage(input: {
  origin: string;
  chainId: number;
  address: string;
  itemSlug: string;
  qty: number;
  nonce: string;
  expiresAtMs: number;
}): string {
  return [
    "Boing Pets item mint v1",
    `Origin: ${input.origin}`,
    `Chain: ${input.chainId}`,
    `Address: ${input.address}`,
    `Item: ${input.itemSlug}`,
    `Quantity: ${input.qty}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAtMs}`,
  ].join("\n");
}

type Open = {
  address: string;
  itemSlug: string;
  qty: number;
  message: string;
  expiresAt: number;
};

export type HttpReply = { status: number; body: unknown };

export type ItemMintEndpoints = {
  challenge(body: unknown, origin: string): Promise<HttpReply>;
  mint(body: unknown): Promise<HttpReply>;
  size(): number;
};

const bad = (status: number, error: string): HttpReply => ({
  status,
  body: { ok: false, error },
});

export function createItemMintEndpoints(input: {
  /** Moves units and queues the mint (items.requestMint). */
  request: (req: {
    walletHex: string;
    slug: string;
    qty: number;
  }) => Promise<
    { ok: true; mintKey: string; qty: number } | { ok: false; detail: string }
  >;
  enabled: () => boolean;
  chainId?: number;
  ttlMs?: number;
  nowMs?: () => number;
}): ItemMintEndpoints {
  const chainId = input.chainId ?? BOING_CHAIN_ID;
  const ttlMs = input.ttlMs ?? MINT_CHALLENGE_TTL_MS;
  const now = input.nowMs ?? Date.now;
  const open = new Map<string, Open>();

  const prune = (t: number) => {
    for (const [nonce, row] of open) if (row.expiresAt <= t) open.delete(nonce);
    while (open.size >= MAX_OPEN) {
      const oldest = open.keys().next().value;
      if (oldest === undefined) break;
      open.delete(oldest);
    }
  };

  return {
    size: () => open.size,
    async challenge(body, origin) {
      if (!input.enabled()) return bad(503, "minting is not enabled");
      const b = (body ?? {}) as Record<string, unknown>;
      const address = normalizeWalletAddress(b.wallet);
      if (address == null) return bad(400, "wallet");
      const slug = b.itemSlug;
      if (
        typeof slug !== "string" ||
        !isItemSlug(slug) ||
        lpitItemId(slug) == null
      ) {
        return bad(400, "item");
      }
      const qty = b.qty;
      if (
        typeof qty !== "number" ||
        !Number.isSafeInteger(qty) ||
        qty < MINT_RULES.minQty ||
        qty > MINT_RULES.maxQty
      ) {
        return bad(400, "qty");
      }
      const t = now();
      prune(t);
      const nonce = randomBytes(16).toString("hex");
      const expiresAt = t + ttlMs;
      const message = itemMintMessage({
        origin,
        chainId,
        address,
        itemSlug: slug,
        qty,
        nonce,
        expiresAtMs: expiresAt,
      });
      open.set(nonce, { address, itemSlug: slug, qty, message, expiresAt });
      const reply: MarketMintChallenge = { nonce, message, expiresAt };
      return { status: 200, body: reply };
    },
    async mint(body) {
      if (!input.enabled()) return bad(503, "minting is not enabled");
      const b = (body ?? {}) as Record<string, unknown>;
      if (typeof b.nonce !== "string") return bad(400, "nonce");
      const row = open.get(b.nonce);
      // Single use, whatever happens next.
      open.delete(b.nonce);
      if (row == null) return bad(400, "challenge expired; try again");
      const address = normalizeWalletAddress(b.wallet);
      if (address == null || address !== row.address) {
        return bad(400, "wallet");
      }
      if (row.expiresAt <= now())
        return bad(400, "challenge expired; try again");
      if (!(await verifyWalletSignature(address, row.message, b.signature))) {
        return bad(401, "signature");
      }
      const result = await input.request({
        walletHex: address,
        slug: row.itemSlug,
        qty: row.qty,
      });
      if (!result.ok) return bad(409, result.detail);
      const reply: MarketMintResult = {
        ok: true,
        mintKey: result.mintKey,
        itemSlug: row.itemSlug,
        itemId: lpitItemId(row.itemSlug) ?? 0,
        qty: result.qty,
        // Queued behind the operator's nonce queue; poll the holdings.
        status: "PENDING",
      };
      return { status: 200, body: reply };
    },
  };
}
