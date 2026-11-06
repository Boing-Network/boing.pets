import { describe, it, expect } from "vitest";
import {
  DAY,
  hex32,
  traits,
  state,
  markerAmount,
  petSvg,
  SPECIES,
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
      streak: 1,
      status: "bouncy",
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
    expect(() =>
      verifyProof(tx, c, { ...receipt, success: false }, block),
    ).toThrow();
    expect(() =>
      verifyProof(tx, c, { ...receipt, block_height: 100 }, block),
    ).toThrow();
    expect(() => verifyProof(owner, c, receipt, block)).toThrow();
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
    expect(() =>
      verifyProof(tx, c, { ...receipt, tx_index: 1 }, block),
    ).toThrow();
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
