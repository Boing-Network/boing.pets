import { describe, expect, it } from "vitest";
import { worldSafeText, WORLD_FONT_URL } from "../src/world/lib/worldFont";

describe("world font", () => {
  it("hosts Inter from the app origin", () => {
    expect(WORLD_FONT_URL).toBe("/fonts/Inter-Regular.woff");
  });

  it("strips non-Latin so troika never hits the unicode CDN", () => {
    expect(worldSafeText("Pet Center")).toBe("Pet Center");
    expect(worldSafeText("Café")).toBe("Cafe");
    expect(worldSafeText("你好")).toBe("");
    expect(worldSafeText("Boing ✨ Pets")).toBe("Boing Pets");
  });
});
