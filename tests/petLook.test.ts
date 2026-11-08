import { describe, expect, it } from "vitest";
import { canHavePetFollower } from "../src/world/lib/petLook";

describe("pet follower eligibility", () => {
  it("only wallet-shaped ids can show followers", () => {
    expect(canHavePetFollower("0x" + "ab".repeat(32))).toBe(true);
    expect(canHavePetFollower("guest-12345678")).toBe(false);
    expect(canHavePetFollower(null)).toBe(false);
    expect(canHavePetFollower("")).toBe(false);
  });
});
