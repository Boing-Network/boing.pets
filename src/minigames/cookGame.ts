/** Ingredient order: flash the recipe, then tap ingredients in that order. */

export const COOK_FLASH_MS = 2500;

export interface CookPublic {
  ingredients: string[];
  /** Shuffled display order for the buttons. */
  scrambled: string[];
  timeLimitMs: number;
  /** How long the recipe order is visible before input starts. */
  flashMs: number;
}

export type CookSecret = CookPublic;

export interface CookInput {
  picked: string[];
  pickElapsedMs: number[];
}

export type CookSpotMark = "correct" | "present" | "absent";

export interface CookFeedback {
  spots: CookSpotMark[];
  correct: number;
  total: number;
  summary: string;
}

const POOL = ["herb", "root", "berry", "grain", "fish", "egg", "spice", "milk"];

/** Closest catalog item for chip art, when one exists. */
const COOK_INGREDIENT_ART: Record<string, string> = {
  herb: "crop-forage",
  root: "crop-honeyroot",
  berry: "crop-berry",
  grain: "crop-sprout",
  fish: "fish-ripple",
  egg: "food-snack",
  spice: "crop-moonbloom",
  milk: "food-starlit",
};

export function cookIngredientItemId(name: string): string | null {
  return COOK_INGREDIENT_ART[name] ?? null;
}

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
    flashMs: COOK_FLASH_MS,
  };
}

export function validateCookOrder(
  secret: CookSecret,
  input: CookInput,
  toleranceMs: number,
): boolean {
  if (input.picked.length !== secret.ingredients.length) return false;
  const flashMs = secret.flashMs ?? 0;
  const earliest = Math.max(0, flashMs - toleranceMs);
  const latest = flashMs + secret.timeLimitMs + toleranceMs;
  for (let i = 0; i < secret.ingredients.length; i++) {
    if (input.picked[i] !== secret.ingredients[i]) return false;
    const t = input.pickElapsedMs[i];
    if (t == null || t < earliest || t > latest) return false;
  }
  return true;
}

export function cookOrderFeedback(
  secret: CookSecret,
  picked: readonly string[],
): CookFeedback {
  const total = secret.ingredients.length;
  const spots: CookSpotMark[] = [];
  for (let i = 0; i < total; i++) {
    const pick = picked[i];
    if (pick == null || pick === "") {
      spots.push("absent");
    } else if (pick === secret.ingredients[i]) {
      spots.push("correct");
    } else if (secret.ingredients.includes(pick)) {
      spots.push("present");
    } else {
      spots.push("absent");
    }
  }
  const correct = spots.filter((s) => s === "correct").length;
  return {
    spots,
    correct,
    total,
    summary: `${correct} of ${total} in the right spot`,
  };
}
