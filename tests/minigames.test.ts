import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ATTEMPT_DAILY_CAP,
  ACTIVITY_CLAIM_WINDOW_MS,
  ACTIVITY_IDS,
  isActivityId,
} from "../src/content/attempts";
import {
  makeFishingSecret,
  needleAt,
  validateFishingClick,
} from "../src/minigames/fishingGame";
import {
  makeMiningSecret,
  validateMiningCombo,
} from "../src/minigames/miningGame";
import {
  makeRacingSecret,
  validateRacingTaps,
} from "../src/minigames/racingGame";
import {
  makeTreasureSecret,
  validateTreasureGuess,
} from "../src/minigames/treasureGame";
import {
  makeGardenSecret,
  validateGardenHold,
} from "../src/minigames/gardenGame";
import { makeCookSecret, validateCookOrder } from "../src/minigames/cookGame";

describe("activity attempts content", () => {
  it("uses a shared daily cap of 3 across activities", () => {
    expect(ACTIVITY_ATTEMPT_DAILY_CAP).toBe(3);
    expect(ACTIVITY_CLAIM_WINDOW_MS).toBeGreaterThan(60_000);
    expect(ACTIVITY_IDS).toEqual([
      "fishing",
      "mining",
      "racing",
      "treasure",
      "garden",
      "cook",
    ]);
    expect(isActivityId("fishing")).toBe(true);
    expect(isActivityId("nope")).toBe(false);
  });
});

describe("fishing timing", () => {
  it("accepts clicks inside the zone and rejects misses", () => {
    const secret = makeFishingSecret("fish-seed-1");
    // Search for a hit elapsed
    let hit: number | null = null;
    for (let ms = 250; ms < 5000; ms += 5) {
      const pos = needleAt(ms, secret.periodMs, secret.phase);
      if (
        pos >= secret.zoneStart &&
        pos <= secret.zoneStart + secret.zoneWidth
      ) {
        hit = ms;
        break;
      }
    }
    expect(hit).not.toBeNull();
    expect(
      validateFishingClick(secret, { clickElapsedMs: hit! }, 45_000, 120),
    ).toBe(true);
    expect(
      validateFishingClick(secret, { clickElapsedMs: hit! + 800 }, 45_000, 20),
    ).toBe(false);
  });
});

describe("mining combo", () => {
  it("requires the exact sequence within the time limit", () => {
    const secret = makeMiningSecret("mine-seed");
    const pressElapsedMs = secret.combo.map((_, i) => 200 + i * 300);
    expect(
      validateMiningCombo(
        secret,
        { keys: [...secret.combo], pressElapsedMs },
        50,
      ),
    ).toBe(true);
    expect(
      validateMiningCombo(
        secret,
        { keys: [...secret.combo].reverse(), pressElapsedMs },
        50,
      ),
    ).toBe(false);
    expect(
      validateMiningCombo(
        secret,
        {
          keys: [...secret.combo],
          pressElapsedMs: secret.combo.map(() => secret.timeLimitMs + 500),
        },
        50,
      ),
    ).toBe(false);
  });
});

describe("racing rhythm", () => {
  it("accepts taps near beats and rejects off-beat", () => {
    const secret = makeRacingSecret("race-seed");
    expect(
      validateRacingTaps(
        secret,
        { tapElapsedMs: secret.beatsMs.map((b) => b + 40) },
        50,
      ),
    ).toBe(true);
    expect(
      validateRacingTaps(
        secret,
        { tapElapsedMs: secret.beatsMs.map((b) => b + 800) },
        50,
      ),
    ).toBe(false);
  });
});

describe("treasure memory", () => {
  it("accepts the flashed spot after flashMs", () => {
    const secret = makeTreasureSecret("dig-seed");
    expect(
      validateTreasureGuess(
        secret,
        { guess: secret.spot, guessElapsedMs: secret.flashMs + 50 },
        45_000,
      ),
    ).toBe(true);
    expect(
      validateTreasureGuess(
        secret,
        {
          guess: (secret.spot + 1) % secret.gridSize,
          guessElapsedMs: secret.flashMs + 50,
        },
        45_000,
      ),
    ).toBe(false);
    expect(
      validateTreasureGuess(
        secret,
        { guess: secret.spot, guessElapsedMs: 10 },
        45_000,
      ),
    ).toBe(false);
  });
});

describe("garden hold", () => {
  it("accepts holds near the target window", () => {
    const secret = makeGardenSecret("garden-seed");
    expect(
      validateGardenHold(secret, { holdMs: secret.targetHoldMs }, 20),
    ).toBe(true);
    expect(
      validateGardenHold(
        secret,
        { holdMs: secret.targetHoldMs + secret.windowMs + 400 },
        20,
      ),
    ).toBe(false);
  });
});

describe("cook order", () => {
  it("requires the secret ingredient sequence", () => {
    const secret = makeCookSecret("cook-seed");
    const pickElapsedMs = secret.ingredients.map((_, i) => 100 + i * 200);
    expect(
      validateCookOrder(
        secret,
        { picked: [...secret.ingredients], pickElapsedMs },
        50,
      ),
    ).toBe(true);
    expect(
      validateCookOrder(
        secret,
        { picked: [...secret.ingredients].reverse(), pickElapsedMs },
        50,
      ),
    ).toBe(false);
  });
});
