import { describe, expect, it } from "vitest";
import {
  HOME_GRID,
  isFurnitureItem,
  isHousingKind,
  isValidCell,
  parseVisibility,
} from "../src/housing";

describe("housing helpers", () => {
  it("validates furniture and grid cells", () => {
    expect(HOME_GRID).toBe(4);
    expect(isFurnitureItem("furn-cushion")).toBe(true);
    expect(isFurnitureItem("hat-ribbon")).toBe(false);
    expect(isValidCell(0, 0)).toBe(true);
    expect(isValidCell(3, 3)).toBe(true);
    expect(isValidCell(4, 0)).toBe(false);
    expect(isValidCell(1.5, 1)).toBe(false);
  });

  it("parses housing kinds and visibility", () => {
    expect(isHousingKind("place")).toBe(true);
    expect(isHousingKind("explode")).toBe(false);
    expect(parseVisibility("private")).toBe("private");
    expect(() => parseVisibility("friends")).toThrow();
  });
});
