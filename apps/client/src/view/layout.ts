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
  emissive: string;
  rim: string;
};

export const TERRITORY_LAYOUT: Record<string, TerritoryLayout> = {
  meadow: {
    slug: "meadow",
    x: -4.5,
    z: 0,
    visualRadius: 2.4,
    color: "#2d4a38",
    emissive: "#1f6a4e",
    rim: "#4fd4b0",
  },
  thicket: {
    slug: "thicket",
    x: 0,
    z: 0,
    visualRadius: 2.2,
    color: "#1f3a32",
    emissive: "#185a48",
    rim: "#3ec9a8",
  },
  ridge: {
    slug: "ridge",
    x: 4.5,
    z: 0,
    visualRadius: 2.0,
    color: "#3a3840",
    emissive: "#4a3a28",
    rim: "#c9a06a",
  },
};

export function layoutForSlug(slug: string): TerritoryLayout {
  const layout = TERRITORY_LAYOUT[slug];
  if (!layout) {
    throw new Error(`unknown territory slug ${slug}`);
  }
  return layout;
}
