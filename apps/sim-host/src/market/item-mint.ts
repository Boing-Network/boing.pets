/**
 * Mint on demand over HTTP, paid by the player:
 *
 * 1. `POST /market/v1/items/mint/challenge` {wallet, itemSlug, qty}: the
 *    server checks the request, then issues a one-time message naming origin,
 *    chain, wallet, item, quantity, fee, pay-to, nonce and expiry.
 * 2. The wallet signs it (`boing_signMessage`) and sends one plain BOING
 *    transfer of the fee to the operator (`boing_sendTransaction`).
 * 3. `POST /market/v1/items/mint` {wallet, nonce, signature, paymentTx}: the
 *    server checks the Ed25519/BLAKE3 signature, then the payment on chain
 *    (mint-payment.ts: included, succeeded, sender = wallet, Transfer to the
 *    operator, amount >= fee, under 24 h old). Not on chain yet: 202 pending
 *    and the challenge stays open so the client can ask again. Verified: the
 *    item service moves the units into a claim keyed on the payment tx and
 *    queues the LPIT mint through the operator's nonce queue.
 *
 * One payment, one claim: the claim lot and the mint row are unique on
 * `claim:<tx>`. Re-sending a used payment re-queues its own claim (a retry,
 * never a second mint). A verified payment whose claim was refused (e.g. the
 * units are gone) stays unused and can pay for a later request.
 * `POST /market/v1/items/mint/retry` {paymentTx} re-queues a paid claim
 * whose operator tx failed, without a new payment.
 *
 * Abuse limits stay: MINT_RULES quantity per request and requests per wallet
 * per day, plus the units the wallet actually holds unminted.
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
import { normalizeTxId, weiToBoing, type PaymentCheck } from "./mint-payment";

/** Long enough to sign, pay and wait for inclusion. */
export const MINT_CHALLENGE_TTL_MS = 15 * 60 * 1000;
const MAX_OPEN = 5_000;

export function itemMintMessage(input: {
  origin: string;
  chainId: number;
  address: string;
  itemSlug: string;
  qty: number;
  feeBoing: string;
  payToHex: string;
  nonce: string;
  expiresAtMs: number;
}): string {
  return [
    "Boing Pets item mint v2",
    `Origin: ${input.origin}`,
    `Chain: ${input.chainId}`,
    `Address: ${input.address}`,
    `Item: ${input.itemSlug}`,
    `Quantity: ${input.qty}`,
    `Fee: ${input.feeBoing} BOING to ${input.payToHex}`,
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
  retry(body: unknown): Promise<HttpReply>;
  size(): number;
};

const bad = (
  status: number,
  error: string,
  extra: { pending?: boolean; paymentUnused?: boolean } = {},
): HttpReply => ({
  status,
  body: { ok: false, error, ...extra } satisfies MarketMintResult,
});

export function createItemMintEndpoints(input: {
  /** Moves units and queues the mint (items.requestMint). */
  request: (req: {
    walletHex: string;
    slug: string;
    qty: number;
    paymentTx: string;
  }) => Promise<
    | { ok: true; mintKey: string; qty: number; retried: boolean }
    | { ok: false; detail: string }
  >;
  /** Re-queue a paid claim (items.retryPaidMint). */
  retry: (paymentTx: string) => Promise<
    | {
        ok: true;
        mintKey: string;
        status: string;
        itemSlug: string;
        qty: number;
      }
    | { ok: false; detail: string }
  >;
  /** On-chain fee check (verifyMintPayment bound to RPC, fee and operator). */
  verifyPayment: (
    paymentTx: string,
    walletHex: string,
  ) => Promise<PaymentCheck>;
  feeWei: bigint;
  payToHex: string;
  /**
   * Refuse before the player pays when the request cannot succeed now (daily
   * cap reached, not enough unminted units). Null means go ahead.
   */
  precheck?: (req: {
    walletHex: string;
    slug: string;
    qty: number;
  }) => Promise<string | null>;
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
      if (input.precheck != null) {
        const refused = await input.precheck({ walletHex: address, slug, qty });
        if (refused != null) return bad(409, refused);
      }
      const t = now();
      prune(t);
      const nonce = randomBytes(16).toString("hex");
      const expiresAt = t + ttlMs;
      const feeBoing = weiToBoing(input.feeWei);
      const message = itemMintMessage({
        origin,
        chainId,
        address,
        itemSlug: slug,
        qty,
        feeBoing,
        payToHex: input.payToHex,
        nonce,
        expiresAtMs: expiresAt,
      });
      open.set(nonce, { address, itemSlug: slug, qty, message, expiresAt });
      const reply: MarketMintChallenge = {
        nonce,
        message,
        expiresAt,
        feeWei: input.feeWei.toString(),
        feeBoing,
        payToHex: input.payToHex,
      };
      return { status: 200, body: reply };
    },
    async mint(body) {
      if (!input.enabled()) return bad(503, "minting is not enabled");
      const b = (body ?? {}) as Record<string, unknown>;
      if (typeof b.nonce !== "string") return bad(400, "nonce");
      const paymentTx = normalizeTxId(b.paymentTx);
      if (paymentTx == null) return bad(400, "paymentTx");
      const row = open.get(b.nonce);
      if (row == null) {
        return bad(400, "challenge expired; try again", {
          paymentUnused: true,
        });
      }
      const address = normalizeWalletAddress(b.wallet);
      if (address == null || address !== row.address) {
        return bad(400, "wallet");
      }
      if (row.expiresAt <= now()) {
        open.delete(b.nonce);
        return bad(400, "challenge expired; try again", {
          paymentUnused: true,
        });
      }
      if (!(await verifyWalletSignature(address, row.message, b.signature))) {
        open.delete(b.nonce);
        return bad(401, "signature", { paymentUnused: true });
      }
      const paid = await input.verifyPayment(paymentTx, address);
      if (!paid.ok) {
        // Not on chain yet: keep the challenge so the same request can be
        // sent again. Anything else is final for this challenge.
        if (paid.pending) return bad(202, paid.detail, { pending: true });
        open.delete(b.nonce);
        return bad(402, paid.detail);
      }
      open.delete(b.nonce);
      const result = await input.request({
        walletHex: address,
        slug: row.itemSlug,
        qty: row.qty,
        paymentTx,
      });
      if (!result.ok) return bad(409, result.detail, { paymentUnused: true });
      const reply: MarketMintResult = {
        ok: true,
        mintKey: result.mintKey,
        itemSlug: row.itemSlug,
        itemId: lpitItemId(row.itemSlug) ?? 0,
        qty: result.qty,
        // Queued behind the operator's nonce queue; poll the holdings.
        status: "PENDING",
        retried: result.retried,
      };
      return { status: 200, body: reply };
    },
    async retry(body) {
      if (!input.enabled()) return bad(503, "minting is not enabled");
      const b = (body ?? {}) as Record<string, unknown>;
      const paymentTx = normalizeTxId(b.paymentTx);
      if (paymentTx == null) return bad(400, "paymentTx");
      const result = await input.retry(paymentTx);
      if (!result.ok) return bad(404, result.detail);
      const reply: MarketMintResult = {
        ok: true,
        mintKey: result.mintKey,
        itemSlug: result.itemSlug,
        itemId: isItemSlug(result.itemSlug)
          ? (lpitItemId(result.itemSlug) ?? 0)
          : 0,
        qty: result.qty,
        status: result.status,
        retried: true,
      };
      return { status: 200, body: reply };
    },
  };
}
