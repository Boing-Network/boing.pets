/** Key-combo mining under a time limit. */

export const MINING_KEYS = ["q", "w", "e", "a", "s", "d"] as const;
export type MiningKey = (typeof MINING_KEYS)[number];

export interface MiningPublic {
  /** Keys the player must press in order (shown). */
  combo: MiningKey[];
  timeLimitMs: number;
}

export type MiningSecret = MiningPublic;

export interface MiningInput {
  /** Elapsed ms for each key press from attempt start. */
  pressElapsedMs: number[];
  keys: string[];
}

export function makeMiningSecret(seed: string): MiningSecret {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 29 + seed.charCodeAt(i)) >>> 0;
  const len = 3 + (h % 2); // 3 or 4
  const combo: MiningKey[] = [];
  for (let i = 0; i < len; i++) {
    combo.push(MINING_KEYS[(h + i * 17) % MINING_KEYS.length]!);
  }
  return { combo, timeLimitMs: 4000 + (h % 2000) };
}

export function validateMiningCombo(
  secret: MiningSecret,
  input: MiningInput,
  toleranceMs: number,
): boolean {
  if (input.keys.length !== secret.combo.length) return false;
  if (input.pressElapsedMs.length !== secret.combo.length) return false;
  for (let i = 0; i < secret.combo.length; i++) {
    if (input.keys[i]!.toLowerCase() !== secret.combo[i]) return false;
    const t = input.pressElapsedMs[i]!;
    if (t < 0 || t > secret.timeLimitMs + toleranceMs) return false;
    if (i > 0 && t < input.pressElapsedMs[i - 1]!) return false;
  }
  return (
    input.pressElapsedMs[secret.combo.length - 1]! <=
    secret.timeLimitMs + toleranceMs
  );
}
