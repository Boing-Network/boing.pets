import { catalogItem } from "./economy";

export const HOME_GRID = 4;
export const HOUSING_KINDS = ["place", "pickup", "set_visibility"] as const;
export type HousingKind = (typeof HOUSING_KINDS)[number];
export type HousingVisibility = "private" | "public";

export function isHousingKind(value: unknown): value is HousingKind {
  return (
    typeof value === "string" &&
    (HOUSING_KINDS as readonly string[]).includes(value)
  );
}

export function isFurnitureItem(itemId: string): boolean {
  return catalogItem(itemId)?.kind === "furniture";
}

export function isValidCell(x: unknown, y: unknown): boolean {
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < HOME_GRID &&
    y < HOME_GRID
  );
}

export function parseVisibility(value: unknown): HousingVisibility {
  if (value === "private" || value === "public") return value;
  throw new Error("Visibility must be public or private");
}
