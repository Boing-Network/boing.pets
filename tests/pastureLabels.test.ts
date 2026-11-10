import { describe, expect, it } from "vitest";
import {
  pastureNameplateLayers,
  pasturePetLabel,
} from "../src/pasture3d/labels";

describe("pasture nameplates", () => {
  it("uses species as the name and does not invent a Boingie nickname", () => {
    expect(pasturePetLabel({ species: "Boingle" })).toBe("Boingle");
    expect(pasturePetLabel({ species: "Boingle", fallback: "Boingie" })).toBe(
      "Boingle",
    );
    expect(pasturePetLabel({ species: "  ", fallback: "Guest-ab12" })).toBe(
      "Guest-ab12",
    );
    expect(pasturePetLabel({})).toBe("Buddy");
  });

  it("emits a single forward-facing layer, never a mirrored back-face copy", () => {
    const layers = pastureNameplateLayers("Boingle");
    expect(layers).toEqual([{ text: "Boingle", mirrored: false }]);
    expect(
      layers.some((layer) => layer.text === "elgnioB" || layer.mirrored),
    ).toBe(false);
  });
});
