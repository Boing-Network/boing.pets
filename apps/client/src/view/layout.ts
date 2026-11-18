/**
 * Fixed map layout for the three v1 territories.
 * Positions are presentation-only; simulation space remains the territory graph.
 */

export type TerritoryLayout = {
  slug: string;
  x: number;
  z: number;
  visualRadius: number;
  color: string;
};

export const TERRITORY_LAYOUT: Record<string, TerritoryLayout> = {
  meadow: {
    slug: "meadow",
    x: -4.5,
    z: 0,
    visualRadius: 2.4,
    color: "#6f9b5a",
  },
  thicket: {
    slug: "thicket",
    x: 0,
    z: 0,
    visualRadius: 2.2,
    color: "#3f6b4e",
  },
  ridge: {
    slug: "ridge",
    x: 4.5,
    z: 0,
    visualRadius: 2.0,
    color: "#8a7a5c",
  },
};

export function layoutForSlug(slug: string): TerritoryLayout {
  const layout = TERRITORY_LAYOUT[slug];
  if (!layout) {
    throw new Error(`unknown territory slug ${slug}`);
  }
  return layout;
}
