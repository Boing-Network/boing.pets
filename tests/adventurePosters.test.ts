import { describe, expect, it } from "vitest";
import { ADVENTURE_LOCATIONS } from "../src/content/adventures";
import {
  ADVENTURE_POSTER_PALETTES,
  adventurePosterSvg,
} from "../src/content/adventurePosters";

describe("adventure posters", () => {
  it("gives every destination a unique accent and svg poster", () => {
    const accents = new Set<string>();
    for (const location of ADVENTURE_LOCATIONS) {
      const palette = ADVENTURE_POSTER_PALETTES[location.id];
      expect(palette).toBeTruthy();
      accents.add(palette!.accent);
      const svg = adventurePosterSvg(location.id);
      expect(svg).toContain("<svg");
      expect(svg).toContain(palette!.accent);
      const needle = location.name
        .replace(/^The /, "")
        .split(" ")[0]!
        .toLowerCase();
      expect(svg.toLowerCase()).toContain(needle);
    }
    expect(accents.size).toBe(ADVENTURE_LOCATIONS.length);
  });
});
