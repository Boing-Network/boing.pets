/** Integer clamp and division. Sim state does not use floating-point results. */

export function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** Half away from zero. `d` is a positive integer. */
export function divRound(n: number, d: number): number {
  if (d <= 0) throw new Error("divRound");
  if (n >= 0) return Math.floor((n + Math.floor(d / 2)) / d);
  return -Math.floor((-n + Math.floor(d / 2)) / d);
}

export function assertInteger(n: number, label: string): number {
  if (!Number.isInteger(n)) throw new Error(`${label} is not an integer`);
  return n;
}
