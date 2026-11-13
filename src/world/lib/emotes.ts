/** Pet emotes and social-play triggers, shared by the plaza and pasture. */

export const EMOTE_IDS = ["wave", "hop", "spin", "heart", "play"] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

export const MANUAL_EMOTE_IDS = ["wave", "hop", "spin", "heart"] as const;
export type ManualEmoteId = (typeof MANUAL_EMOTE_IDS)[number];

export const EMOTE_DURATION_MS = 1800;
export const EMOTE_COOLDOWN_MS = 1200;
export const SOCIAL_PLAY_RADIUS = 2.4;
export const SOCIAL_PLAY_COOLDOWN_MS = 8000;

export const EMOTE_LABELS: Record<EmoteId, string> = {
  wave: "Wave",
  hop: "Hop",
  spin: "Spin",
  heart: "Heart",
  play: "Play",
};

export function isEmoteId(value: unknown): value is EmoteId {
  return (
    typeof value === "string" &&
    (EMOTE_IDS as readonly string[]).includes(value)
  );
}

export function canSendEmote(lastAt: number, now: number): boolean {
  return now - lastAt >= EMOTE_COOLDOWN_MS;
}

export function emoteActive(startedAt: number, now: number): boolean {
  return now - startedAt >= 0 && now - startedAt < EMOTE_DURATION_MS;
}

export type SocialPlayPeer = { id: string; x: number; z: number };

/** First nearby peer who has not played with us within the cooldown window. */
export function shouldTriggerSocialPlay(input: {
  now: number;
  selfId: string;
  myPos: { x: number; z: number };
  others: SocialPlayPeer[];
  lastPlayByPeer: ReadonlyMap<string, number>;
}): SocialPlayPeer | null {
  if (!input.selfId) return null;
  let best: SocialPlayPeer | null = null;
  let bestDist = SOCIAL_PLAY_RADIUS;
  for (const other of input.others) {
    if (!other.id || other.id === input.selfId) continue;
    const dist = Math.hypot(other.x - input.myPos.x, other.z - input.myPos.z);
    if (dist > bestDist) continue;
    const last = input.lastPlayByPeer.get(other.id) ?? 0;
    if (input.now - last < SOCIAL_PLAY_COOLDOWN_MS) continue;
    best = other;
    bestDist = dist;
  }
  return best;
}

export function playPairKey(a: string, b: string): string {
  return a < b ? a + ":" + b : b + ":" + a;
}

export function latestEmoteFor(
  rows: Array<{ id: string; emote: EmoteId; at: number }>,
  owner: string,
): { id: EmoteId; at: number } | null {
  let best: { id: EmoteId; at: number } | null = null;
  for (const row of rows) {
    if (row.id !== owner) continue;
    if (!best || row.at > best.at) best = { id: row.emote, at: row.at };
  }
  return best;
}
