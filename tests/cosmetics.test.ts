import { describe, expect, it } from "vitest";
import {
  EquipError,
  slotForCosmetic,
  sanitizeEquipped,
  validateEquip,
} from "../src/content/cosmetics";

describe("cosmetic slots", () => {
  it("maps catalog cosmetics to hat, accessory, and trail slots", () => {
    expect(slotForCosmetic("hat-ribbon")).toBe("hat");
    expect(slotForCosmetic("hat-antenna")).toBe("hat");
    expect(slotForCosmetic("hat-leaf")).toBe("hat");
    expect(slotForCosmetic("hat-comet")).toBe("hat");
    expect(slotForCosmetic("hat-stardust")).toBe("hat");
    expect(slotForCosmetic("frame-gold")).toBe("accessory");
    expect(slotForCosmetic("frame-aurora")).toBe("accessory");
    expect(slotForCosmetic("tool-pick-iron")).toBe("trail");
    expect(slotForCosmetic("tool-pick-crystal")).toBe("trail");
    expect(slotForCosmetic("furn-cushion")).toBeNull();
    expect(slotForCosmetic("furn-lantern")).toBeNull();
    expect(slotForCosmetic("not-an-item")).toBeNull();
  });

  it("sanitizes equipped payloads and drops unknown slots or cross-slot items", () => {
    expect(
      sanitizeEquipped({
        hat: "hat-ribbon",
        accessory: "frame-gold",
        trail: "tool-pick-iron",
        extra: "hat-ribbon",
      }),
    ).toEqual({
      hat: "hat-ribbon",
      accessory: "frame-gold",
      trail: "tool-pick-iron",
    });
    expect(sanitizeEquipped({ hat: "frame-gold" })).toBeUndefined();
    expect(sanitizeEquipped({ hat: "<script>" })).toBeUndefined();
    expect(sanitizeEquipped(null)).toBeUndefined();
  });

  it("validates ownership and rejects items in the wrong slot", () => {
    expect(
      validateEquip({
        slot: "hat",
        itemId: "hat-ribbon",
        ownedIds: ["hat-ribbon"],
      }),
    ).toEqual({ slot: "hat", itemId: "hat-ribbon" });
    expect(
      validateEquip({ slot: "hat", itemId: null, ownedIds: ["hat-ribbon"] }),
    ).toEqual({ slot: "hat", itemId: null });

    try {
      validateEquip({
        slot: "hat",
        itemId: "hat-stardust",
        ownedIds: ["hat-ribbon"],
      });
      throw new Error("expected ownership rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(EquipError);
      expect((error as EquipError).status).toBe(403);
    }

    try {
      validateEquip({
        slot: "hat",
        itemId: "frame-gold",
        ownedIds: ["frame-gold"],
      });
      throw new Error("expected slot rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(EquipError);
      expect((error as EquipError).status).toBe(400);
    }
  });
});
