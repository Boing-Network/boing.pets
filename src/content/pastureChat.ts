import { sanitizeMessage } from "../social";

export const PASTURE_CHAT_MAX = 140;
export const PASTURE_CHAT_MIN_MS = 1_500;
export const PASTURE_CHAT_WINDOW_MS = 10_000;
export const PASTURE_CHAT_WINDOW_MAX = 6;

const URL_RE =
  /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|io|dev|gg|xyz)\b/i;

/** Small denylist — reject the whole message rather than leak a partial. */
const PROFANITY_RE =
  /\b(fuck|shit|asshole|bitch|cunt|nigger|nigga|rape|slut|whore)\b/i;

export function canSendChat(lastAt: number | null | undefined, now: number) {
  if (!lastAt) return true;
  return now - lastAt >= PASTURE_CHAT_MIN_MS;
}

export function chatWindowOk(sentAt: number[], now: number) {
  const recent = sentAt.filter((t) => now - t < PASTURE_CHAT_WINDOW_MS);
  return recent.length < PASTURE_CHAT_WINDOW_MAX;
}

export function sanitizePastureChat(raw: unknown): string {
  if (typeof raw === "string" && /[<>]/.test(raw))
    throw new Error("Message has disallowed characters");
  const body = sanitizeMessage(raw);
  if (body.length > PASTURE_CHAT_MAX)
    throw new Error(`Chat max ${PASTURE_CHAT_MAX} characters`);
  if (URL_RE.test(body))
    throw new Error("Links are not allowed in pasture chat");
  if (PROFANITY_RE.test(body)) throw new Error("Please keep pasture chat kind");
  return body;
}
