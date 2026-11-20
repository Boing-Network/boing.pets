/**
 * Shared-world identity: HMAC-signed session tokens (Node only).
 *
 * A token is `base64url(claims) "." base64url(HMAC-SHA256(secret, claims))`.
 * The server mints one for every new guest and returns it in `welcome`; the
 * client keeps it and presents it again on reconnect, so the same account
 * (and its influence rate limit) follows the player across reloads.
 *
 * The browser worker must never import this module (node:crypto).
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionRole } from "@boing-pets/contract";
import { isValidAccountId } from "./account";

export const SESSION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TOKEN_LENGTH = 1024;
const MAX_NAME_LENGTH = 24;

export type SessionClaims = {
  v: 1;
  /** Account id (rate limits and attribution key on this). */
  sub: string;
  name: string;
  role: SessionRole;
  /** Boing wallet (`0x` + 64 hex) for wallet-signed sessions. */
  wallet?: string;
  iat: number;
  exp: number;
};

function b64url(data: Buffer | string): string {
  return Buffer.from(data).toString("base64url");
}

function mac(secret: Buffer, body: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function signSessionToken(
  secret: Buffer,
  claims: SessionClaims,
): string {
  const body = b64url(JSON.stringify(claims));
  return `${body}.${b64url(mac(secret, body))}`;
}

function isClaims(value: unknown): value is SessionClaims {
  if (value == null || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    c.v === 1 &&
    typeof c.sub === "string" &&
    isValidAccountId(c.sub) &&
    typeof c.name === "string" &&
    c.name.length <= MAX_NAME_LENGTH &&
    (c.role === "owner" || c.role === "player") &&
    (c.wallet === undefined ||
      (typeof c.wallet === "string" && /^0x[0-9a-f]{64}$/.test(c.wallet))) &&
    typeof c.iat === "number" &&
    typeof c.exp === "number"
  );
}

/** Claims for a valid, unexpired token signed with `secret`, else null. */
export function verifySessionToken(
  secret: Buffer,
  token: unknown,
  nowMs: number,
): SessionClaims | null {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = mac(secret, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isClaims(claims) || claims.exp <= nowMs) return null;
  return claims;
}

export function newGuestAccountId(): string {
  return `guest-${randomBytes(6).toString("hex")}`;
}

/** Printable, short display name; falls back when nothing usable remains. */
export function sanitizeDisplayName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw
    .replace(/[^\p{L}\p{N} _.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : fallback;
}

/** Constant-time owner key check (both sides hashed to equal length). */
export function ownerKeyMatches(expected: string, provided: unknown): boolean {
  if (expected.length === 0 || typeof provided !== "string") return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

export function generateOwnerKey(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Token signing secret: `LIVING_PETS_MP_SECRET` when set, else a random key
 * persisted beside the world data (mode 0600) so tokens survive restarts.
 */
export async function loadOrCreateSecret(
  filePath: string,
  fromEnv?: string,
): Promise<Buffer> {
  if (fromEnv != null && fromEnv.length >= 16) return Buffer.from(fromEnv);
  try {
    const text = (await readFile(filePath, "utf8")).trim();
    if (/^[0-9a-f]{64}$/.test(text)) return Buffer.from(text, "hex");
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error;
  }
  const secret = randomBytes(32);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${secret.toString("hex")}\n`, { mode: 0o600 });
  return secret;
}
