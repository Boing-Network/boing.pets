/**
 * Memory strength is derived from immutable columns and the current tick.
 * It is never written back onto the row.
 */
import type { Ruleset } from "@boing-pets/contract";
import { assertInteger, clamp } from "../math";
import type { MemoryRow } from "../types";

/**
 * Fixed 16-bin half-life decay curve. Index 0 is a fresh half-life window;
 * each successive right-shift is one completed half-life.
 */
export const MEMORY_DECAY_LUT = [
  1024, 980, 938, 897, 860, 823, 788, 754, 724, 693, 664, 636, 609, 584, 560,
  537,
] as const;

/** `clamp(importance * memoryStrengthPerImportance, 1, 1000)` at insert. */
export function initialMemoryStrength(
  importance: number,
  rules: Ruleset,
): number {
  return assertInteger(
    clamp(importance * rules.memoryStrengthPerImportance, 1, 1000),
    "initialStrength",
  );
}

/** Major memories keep a permanent residue; minor ones fade to 0. */
export function memoryResidue(importance: number, rules: Ruleset): number {
  if (importance < rules.majorImportanceMin) return 0;
  return assertInteger(clamp(importance * 8, 200, 800), "residue");
}

/**
 * Effective strength at `tick`. After 12 half-lives, majors return their
 * residue and minors return 0.
 */
export function memoryStrength(
  memory: MemoryRow,
  tick: number,
  rules: Ruleset,
): number {
  const elapsed = tick - memory.tick;
  if (elapsed <= 0) return memory.initialStrength;
  const major = memory.importance >= rules.majorImportanceMin;
  const half = major ? rules.halfLifeMajorTicks : rules.halfLifeMinorTicks;
  if (half <= 0) throw new Error("halfLife");
  const residue = memoryResidue(memory.importance, rules);
  const k = Math.floor(elapsed / half);
  if (k >= 12) return residue;
  const frac = elapsed - k * half;
  const bin = Math.min(15, Math.floor((frac * 16) / half));
  const unit = MEMORY_DECAY_LUT[bin]! >> k;
  return (
    residue + Math.floor(((memory.initialStrength - residue) * unit) / 1024)
  );
}
