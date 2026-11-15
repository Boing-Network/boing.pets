import { describe, expect, it } from "vitest";
import {
  yardLabelForKind,
  yardLabelForLandmark,
} from "../src/pasture3d/yardLabels";

describe("Yard stencil labels", () => {
  it("maps every public station kind to a streetwear title and tag", () => {
    expect(yardLabelForKind("cook").title).toBe("STREET KITCHEN");
    expect(yardLabelForKind("market").title).toBe("THE DROP");
    expect(yardLabelForKind("craft").title).toBe("PRINT SHOP");
    expect(yardLabelForKind("customize").title).toBe("FITTING ROOM");
    expect(yardLabelForKind("fish").title).toBe("LINE");
    expect(yardLabelForKind("treasure").title).toBe("SWEEP");
    expect(yardLabelForKind("race").title).toBe("SKATE PARK");
    expect(yardLabelForKind("mine").title).toBe("QUARRY");
    expect(yardLabelForKind("garden").title).toBe("PLOT");
    expect(yardLabelForKind("home").title).toBe("HOME STOOP");
    expect(yardLabelForKind("market").tag).toContain("LIVE");
    expect(yardLabelForKind("market").tag.includes("·")).toBe(false);
  });

  it("keeps known landmark titles and uppercases unknown fallbacks", () => {
    expect(yardLabelForLandmark("old-oak").title).toBe("OLD OAK");
    expect(yardLabelForLandmark("lily-pond").title).toBe("LINE");
    expect(yardLabelForLandmark("mystery-prop", "Side Alley").title).toBe(
      "SIDE ALLEY",
    );
  });
});
