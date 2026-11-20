/**
 * Territory layout helpers. Region centers and radii come from the world
 * model when it is available; the fixed catalog below is only a fallback for
 * tests that do not build a landscape.
 */
import type { WorldModel } from "./world/world-model";

export type TerritoryLayout = {
  slug: string;
  x: number;
  z: number;
  visualRadius: number;
  color: string;
  emissive: string;
  rim: string;
};

/** Fallback for unit tests that never open the 3D world. */
export const TERRITORY_LAYOUT: Record<string, TerritoryLayout> = {
  meadow: {
    slug: "meadow",
    x: -70,
    z: 64,
    visualRadius: 34,
    color: "#2f6b46",
    emissive: "#1f6a4e",
    rim: "#ffb46a",
  },
  thicket: {
    slug: "thicket",
    x: 13,
    z: 14,
    visualRadius: 31,
    color: "#1d4a40",
    emissive: "#185a48",
    rim: "#4fe6c4",
  },
  ridge: {
    slug: "ridge",
    x: 71,
    z: -64,
    visualRadius: 28,
    color: "#4b4a63",
    emissive: "#4a3a28",
    rim: "#8fd0ff",
  },
  glade: {
    slug: "glade",
    x: -140,
    z: 120,
    visualRadius: 36,
    color: "#2c5f58",
    emissive: "#245a52",
    rim: "#b8d4ff",
  },
  fen: {
    slug: "fen",
    x: 40,
    z: 110,
    visualRadius: 35,
    color: "#26473a",
    emissive: "#1f5a44",
    rim: "#7fe0b0",
  },
  grove: {
    slug: "grove",
    x: -60,
    z: -40,
    visualRadius: 34,
    color: "#2a3d2c",
    emissive: "#3a2a3a",
    rim: "#e07ad0",
  },
  crags: {
    slug: "crags",
    x: 140,
    z: -130,
    visualRadius: 30,
    color: "#55515e",
    emissive: "#3a3a4a",
    rim: "#9fc4ff",
  },
};

export function layoutForSlug(slug: string): TerritoryLayout {
  const layout = TERRITORY_LAYOUT[slug];
  if (!layout) {
    throw new Error(`unknown territory slug ${slug}`);
  }
  return layout;
}

export function layoutForTerritory(
  territoryId: number,
  slug: string,
  model: WorldModel | null | undefined,
): TerritoryLayout {
  const region = model?.regionByTerritoryId.get(territoryId);
  if (region) {
    return {
      slug: region.slug,
      x: region.center.x,
      z: region.center.z,
      visualRadius: region.radius,
      color: region.biome.ground,
      emissive: region.biome.glow,
      rim: region.biome.glow,
    };
  }
  return layoutForSlug(slug);
}
