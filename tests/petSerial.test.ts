import { describe, expect, it } from "vitest";
import { petSerialLabel } from "../src/ui/petSerial";

describe("petSerialLabel", () => {
  it("formats a stable 3-digit serial from a hatch transaction", () => {
    expect(
      petSerialLabel(
        "0x8a06e5c113f3868f7a74d25c15705f9f446a7421d0d4a6227017497a5d95d4f2",
      ),
    ).toBe("#841");
    expect(
      petSerialLabel(
        "0x8a06e5c113f3868f7a74d25c15705f9f446a7421d0d4a6227017497a5d95d4f2",
      ),
    ).toBe("#841");
  });

  it("falls back when the hash is missing", () => {
    expect(petSerialLabel("")).toBe("#000");
    expect(petSerialLabel(undefined)).toBe("#000");
  });
});
