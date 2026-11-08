export const DISPLAY_NAME_MAX = 24;
export const MESSAGE_MAX = 280;
export const SOCIAL_KINDS = [
  "set_profile",
  "friend_request",
  "friend_accept",
  "friend_decline",
  "friend_remove",
  "send_message",
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

export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Display name required");
  const name = raw.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > DISPLAY_NAME_MAX)
    throw new Error(`Display name must be 2–${DISPLAY_NAME_MAX} characters`);
  if (/^0x[a-f0-9]{64}$/i.test(name))
    throw new Error("Display name cannot be a raw wallet id");
  return name;
}

export function sanitizeMessage(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Message required");
  const body = raw.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  if (!body) throw new Error("Message cannot be empty");
  if (body.length > MESSAGE_MAX)
    throw new Error(`Message max ${MESSAGE_MAX} characters`);
  return body;
}

export function shortWallet(owner: string): string {
  return `${owner.slice(0, 8)}…${owner.slice(-4)}`;
}
