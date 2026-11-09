export const DISPLAY_NAME_MAX = 24;
export const MESSAGE_MAX = 280;
export const PARTY_SIZE_MAX = 4;
export const SOCIAL_KINDS = [
  "set_profile",
  "friend_request",
  "friend_accept",
  "friend_decline",
  "friend_remove",
  "send_message",
  "party_create",
  "party_invite",
  "party_accept",
  "party_decline",
  "party_leave",
] as const;

export type SocialKind = (typeof SOCIAL_KINDS)[number];

export function isSocialKind(value: unknown): value is SocialKind {
  return (
    typeof value === "string" &&
    (SOCIAL_KINDS as readonly string[]).includes(value)
  );
}

/** Canonical unordered friend pair (lexicographic hex order). */
export function friendPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Letters, marks, numbers, spaces, and a small safe punctuation set. */
const NAME_ALLOWED = /^[\p{L}\p{M}\p{N} .'_-]+$/u;
const MESSAGE_ALLOWED = /^[\p{L}\p{M}\p{N} \p{P}\p{S}]+$/u;
// Control / bidi / zero-width characters are rejected for UGC names and messages.
const FORBIDDEN_CHARS =
  // eslint-disable-next-line no-control-regex -- intentional denylist of C0/C1 controls
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/u;

function normalizeUgText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(FORBIDDEN_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Display name required");
  const normalized = raw.normalize("NFKC");
  if (FORBIDDEN_CHARS.test(normalized))
    throw new Error("Display name has disallowed characters");
  const name = normalized.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > DISPLAY_NAME_MAX)
    throw new Error(`Display name must be 2-${DISPLAY_NAME_MAX} characters`);
  if (!NAME_ALLOWED.test(name))
    throw new Error("Display name has disallowed characters");
  if (/^0x[a-f0-9]{64}$/i.test(name))
    throw new Error("Display name cannot be a raw wallet id");
  return name;
}

export function sanitizeMessage(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Message required");
  const normalized = raw.normalize("NFKC");
  if (FORBIDDEN_CHARS.test(normalized))
    throw new Error("Message has disallowed characters");
  const body = normalizeUgText(raw);
  if (!body) throw new Error("Message cannot be empty");
  if (body.length > MESSAGE_MAX)
    throw new Error(`Message max ${MESSAGE_MAX} characters`);
  if (!MESSAGE_ALLOWED.test(body))
    throw new Error("Message has disallowed characters");
  return body;
}

export function shortWallet(owner: string): string {
  return `${owner.slice(0, 8)}…${owner.slice(-4)}`;
}
