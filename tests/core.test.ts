import { describe, it, expect } from "vitest";
import {
  DAY,
  hex32,
  traits,
  state,
  markerAmount,
  petSvg,
  SPECIES,
  PERSONALITIES,
  growthStage,
  unlockedAchievements,
  unlockedAchievementsFromRollup,
  rollupFromEvents,
  stateFromRollup,
  applyCareToRollup,
  CARE_REWARDS,
} from "../src/core";
import { verifyProof } from "../worker/proof";
const owner = "0x" + "11".repeat(32),
  tx = "0x" + "22".repeat(32),
  created = 10 * DAY;
const pet = { owner, hatch_tx: tx, created_at: created };
describe("identity and generative creatures", () => {
  it("normalizes raw Ed25519 account ids", () => {
    expect(hex32(owner.slice(2).toUpperCase())).toBe(owner);
    expect(() => hex32("0x123")).toThrow();
  });
  it("is stable, chain-derived and varied", () => {
    expect(traits(owner, tx)).toEqual(traits(owner, tx));
    expect(traits(owner, tx)).not.toEqual(
      traits(owner, "0x" + "33".repeat(32)),
    );
    const names = new Set(
      Array.from(
        { length: 200 },
        (_, i) =>
          traits(owner, "0x" + i.toString(16).padStart(64, "0")).species,
      ),
    );
    expect(names.size).toBe(SPECIES.length);
    expect(PERSONALITIES).toContain(traits(owner, tx).personality);
  });
  it("only emits controlled SVG", () => {
    expect(petSvg(traits(owner, tx))).toContain("<svg");
    expect(petSvg(traits(owner, tx), true)).toContain("Scruffy");
    expect(petSvg(traits(owner, tx))).not.toContain("<script");
  });
  it("binds unique small self-transfer amounts to challenges and actions", () => {
    expect(markerAmount("a", "hatch")).not.toBe(markerAmount("a", "feed"));
    expect(BigInt(markerAmount("a", "hatch"))).toBeGreaterThanOrEqual(
      1_000_000_000_000_000n,
    );
    expect(BigInt(markerAmount("a", "hatch"))).toBeLessThan(
      1_001_000_000_000_000n,
    );
  });
});
describe("lazy care and streaks", () => {
  it("starts happy without a scheduler", () => {
    expect(state(pet, [], created)).toMatchObject({
      hunger: 100,
      happiness: 100,
      energy: 100,
      hygiene: 100,
      health: 100,
      streak: 1,
      status: "bouncy",
      stage: "baby",
      boinglets: 2,
      xp: 0,
    });
  });
  it("becomes scruffy then stray without deleting identity", () => {
    expect(state(pet, [], created + 2 * DAY).status).toBe("scruffy");
    expect(state(pet, [], created + 4 * DAY)).toMatchObject({
      hunger: 0,
      status: "stray",
      streak: 0,
    });
  });
  it("a feed always revives, even after a year", () => {
    const now = created + 365 * DAY;
    expect(
      state(pet, [{ action: "feed", created_at: now }], now),
    ).toMatchObject({ hunger: 100, status: "bouncy", streak: 1 });
  });
  it("a signed hello increases joy, but does not feed a stray", () => {
    const now = created + 5 * DAY;
    expect(
      state(pet, [{ action: "checkin", created_at: now }], now),
    ).toMatchObject({ happiness: 100, hunger: 0, status: "stray" });
  });
  it("play and groom restore energy and hygiene", () => {
    const now = created + 3 * DAY;
    const tired = state(pet, [], now);
    expect(tired.energy).toBeLessThan(100);
    expect(tired.hygiene).toBeLessThan(100);
    expect(
      state(
        pet,
        [
          { action: "play", created_at: now },
          { action: "groom", created_at: now },
        ],
        now,
      ),
    ).toMatchObject({
      energy: 100,
      hygiene: 100,
      playedToday: true,
      groomedToday: true,
    });
  });
  it("counts unique UTC care days, not transactions", () => {
    const events = [
      { action: "checkin" as const, created_at: created + DAY },
      { action: "feed" as const, created_at: created + DAY + 100 },
      { action: "checkin" as const, created_at: created + 2 * DAY },
    ];
    expect(state(pet, events, created + 2 * DAY).streak).toBe(3);
    expect(state(pet, events, created + 3 * DAY).streak).toBe(3);
    expect(state(pet, events, created + 4 * DAY).streak).toBe(0);
  });
  it("ignores future and pre-hatch events", () => {
    expect(
      state(
        pet,
        [
          { action: "feed", created_at: created - 1 },
          { action: "feed", created_at: created + DAY },
        ],
        created,
      ).lastFed,
    ).toBe(created);
  });
  it("grows with age and care days", () => {
    expect(growthStage(pet, 0, created)).toBe("baby");
    expect(growthStage(pet, 1, created + 2 * DAY)).toBe("child");
    expect(growthStage(pet, 4, created + 7 * DAY)).toBe("teen");
    expect(growthStage(pet, 10, created + 21 * DAY)).toBe("adult");
    expect(growthStage(pet, 10, created + 120 * DAY)).toBe("elder");
  });
  it("awards event-sourced Boinglets/XP and achievements", () => {
    const now = created + DAY;
    const events = [
      { action: "hatch" as const, created_at: created },
      { action: "feed" as const, created_at: now },
      { action: "checkin" as const, created_at: now },
      { action: "play" as const, created_at: now },
      { action: "groom" as const, created_at: now },
    ];
    const s = state(pet, events, now);
    const expectedXp =
      CARE_REWARDS.hatch.xp +
      CARE_REWARDS.feed.xp +
      CARE_REWARDS.checkin.xp +
      CARE_REWARDS.play.xp +
      CARE_REWARDS.groom.xp;
    expect(s.xp).toBe(expectedXp);
    expect(s.boinglets).toBeGreaterThan(CARE_REWARDS.hatch.boinglets);
    expect(unlockedAchievements(pet, events, now)).toEqual(
      expect.arrayContaining([
        "first_bounce",
        "full_bowl",
        "kind_hello",
        "playtime",
        "fresh_coat",
        "balanced_day",
      ]),
    );
  });
});
describe("server-side transaction proof (never trust a hash alone)", () => {
  const c = { owner, amount: "1000000000000123", min_height: 100 };
  const receipt = { tx_id: tx, block_height: 101, tx_index: 0, success: true };
  const block = {
    header: { height: 101 },
    transactions: [
      { sender: owner, payload: { Transfer: { to: owner, amount: c.amount } } },
    ],
    receipts: [receipt],
  };
  it("accepts matching committed self-transfer", () =>
    expect(() => verifyProof(tx, c, receipt, block)).not.toThrow());
  it("rejects unknown, failed, old and wrong-hash receipts", () => {
    expect(() => verifyProof(tx, c, null, null)).toThrow();
    const failed = {
      ...receipt,
      success: false,
      error: "Execution reverted",
    };
    expect(() =>
      verifyProof(tx, c, failed, { ...block, receipts: [failed] }),
    ).toThrow(/failed/i);
    expect(() =>
      verifyProof(tx, c, { ...receipt, block_height: 100 }, block),
    ).toThrow();
    expect(() => verifyProof(owner, c, receipt, block)).toThrow();
  });
  it("accepts a success in the block when a later failed receipt hides it", () => {
    const failed = {
      ...receipt,
      tx_index: 1,
      success: false,
      error: "Invalid nonce: expected 2, got 1",
    };
    const mixed = {
      ...block,
      transactions: [
        block.transactions[0],
        { sender: owner, payload: { Transfer: { to: owner, amount: "1" } } },
      ],
      receipts: [receipt, failed],
    };
    expect(() => verifyProof(tx, c, failed, mixed)).not.toThrow();
  });
  it("rejects another owner, recipient, amount and block index", () => {
    for (const bad of [
      { sender: tx, payload: { Transfer: { to: owner, amount: c.amount } } },
      { sender: owner, payload: { Transfer: { to: tx, amount: c.amount } } },
      { sender: owner, payload: { Transfer: { to: owner, amount: "1" } } },
    ])
      expect(() =>
        verifyProof(tx, c, receipt, { ...block, transactions: [bad] }),
      ).toThrow();
    // A stale index is fine when the block still has the matching success.
    expect(() =>
      verifyProof(tx, c, { ...receipt, tx_index: 1 }, block),
    ).not.toThrow();
  });
  it("requires matching block receipt and height", () => {
    expect(() =>
      verifyProof(tx, c, receipt, { ...block, receipts: [] }),
    ).toThrow();
    expect(() =>
      verifyProof(tx, c, receipt, { ...block, header: { height: 99 } }),
    ).toThrow();
  });
});

describe("care rollup parity", () => {
  it("matches state() and achievements for mixed histories", () => {
    const now = created + 10 * DAY;
    const events = [
      { action: "hatch" as const, created_at: created },
      { action: "feed" as const, created_at: created + DAY },
      { action: "checkin" as const, created_at: created + DAY },
      { action: "play" as const, created_at: created + DAY },
      { action: "groom" as const, created_at: created + DAY },
      { action: "feed" as const, created_at: created + 2 * DAY },
      { action: "checkin" as const, created_at: now },
    ];
    const rollup = rollupFromEvents(pet, events, now);
    expect(stateFromRollup(pet, rollup, now)).toEqual(state(pet, events, now));
    expect(unlockedAchievementsFromRollup(pet, rollup, now)).toEqual(
      unlockedAchievements(pet, events, now),
    );
    expect(rollup.hadBalancedDay).toBe(true);
  });

  it("applyCareToRollup matches rebuild from events", () => {
    const t0 = created;
    const base = rollupFromEvents(
      pet,
      [{ action: "hatch", created_at: t0 }],
      t0,
    );
    const nextAt = created + DAY;
    const applied = applyCareToRollup(base, "feed", nextAt, pet.created_at);
    const rebuilt = rollupFromEvents(
      pet,
      [
        { action: "hatch", created_at: t0 },
        { action: "feed", created_at: nextAt },
      ],
      nextAt,
    );
    expect(applied).toEqual(rebuilt);
    expect(stateFromRollup(pet, applied, nextAt)).toEqual(
      state(
        pet,
        [
          { action: "hatch", created_at: t0 },
          { action: "feed", created_at: nextAt },
        ],
        nextAt,
      ),
    );
  });
});
