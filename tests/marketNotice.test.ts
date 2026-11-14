import { describe, expect, it } from "vitest";
import { marketLoadedNotice } from "../src/ui/marketNotice";

describe("market guest banner", () => {
  it("clears the initial Loading notice with a ready message for guests", () => {
    expect(marketLoadedNotice(undefined)).toBe(
      "Market ready. Connect to claim rewards or list items.",
    );
    expect(marketLoadedNotice("")).toBe(
      "Market ready. Connect to claim rewards or list items.",
    );
    expect(marketLoadedNotice("0xabc")).toBe("Market ready.");
  });
});
