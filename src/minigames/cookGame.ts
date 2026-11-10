/** Ingredient order: tap ingredients in the recipe order. */

export interface CookPublic {
  ingredients: string[];
  /** Shuffled display order for the buttons. */
  scrambled: string[];
  timeLimitMs: number;
}

export type CookSecret = CookPublic;

export interface CookInput {
  picked: string[];
  pickElapsedMs: number[];
}

const POOL = ["herb", "root", "berry", "grain", "fish", "egg", "spice", "milk"];

export function makeCookSecret(seed: string): CookSecret {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 43 + seed.charCodeAt(i)) >>> 0;
  const len = 3 + (h % 2);
  const ingredients: string[] = [];
  for (let i = 0; i < len; i++)
    ingredients.push(POOL[(h + i * 13) % POOL.length]!);
  const scrambled = [...ingredients].sort(
    (a, b) => ((h + a.charCodeAt(0)) % 97) - ((h + b.charCodeAt(0)) % 97),
  );
  // ensure unique scramble indices
  const uniq = [...new Set(scrambled)];
  while (uniq.length < ingredients.length) {
    uniq.push(POOL[(uniq.length * 7 + h) % POOL.length]!);
  }
  return {
    ingredients,
    scrambled: uniq.slice(0, Math.max(ingredients.length, 4)),
    timeLimitMs: 8000,
  };
}

export function validateCookOrder(
  secret: CookSecret,
  input: CookInput,
  toleranceMs: number,
): boolean {
  if (input.picked.length !== secret.ingredients.length) return false;
  for (let i = 0; i < secret.ingredients.length; i++) {
    if (input.picked[i] !== secret.ingredients[i]) return false;
    const t = input.pickElapsedMs[i];
    if (t == null || t < 0 || t > secret.timeLimitMs + toleranceMs)
      return false;
  }
  return true;
}
