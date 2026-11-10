/** Memory dig: briefly flash the tile, then pick it. */

export interface TreasurePublic {
  gridSize: number;
  /** How long the flash is visible before tiles hide. */
  flashMs: number;
}

export interface TreasureSecret extends TreasurePublic {
  spot: number;
}

export interface TreasureInput {
  guess: number;
  guessElapsedMs: number;
}

export function makeTreasureSecret(seed: string): TreasureSecret {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 37 + seed.charCodeAt(i)) >>> 0;
  const gridSize = 9;
  return {
    gridSize,
    flashMs: 700 + (h % 500),
    spot: h % gridSize,
  };
}

export function validateTreasureGuess(
  secret: TreasureSecret,
  input: TreasureInput,
  playWindowMs: number,
): boolean {
  if (
    input.guessElapsedMs < secret.flashMs ||
    input.guessElapsedMs > playWindowMs
  )
    return false;
  if (input.guess < 0 || input.guess >= secret.gridSize) return false;
  return input.guess === secret.spot;
}
