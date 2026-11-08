/** Config-driven zone layout for Starter Town (Phase 2). Expand without rewriting the scene graph. */
export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export interface WorldStation {
  id: string;
  label: string;
  kind: "care" | "info" | "portal";
  position: WorldPoint;
  radius: number;
  hint: string;
  /** Deep-link into the 2D care desk when useful. */
  careHref?: string;
}

export interface WorldLandmark {
  id: string;
  label: string;
  position: WorldPoint;
  color: string;
  height: number;
  width: number;
  depth: number;
}

export interface WorldZoneConfig {
  id: string;
  name: string;
  tagline: string;
  spawn: WorldPoint;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  fogColor: string;
  groundColor: string;
  accentColor: string;
  landmarks: WorldLandmark[];
  stations: WorldStation[];
  paths: WorldPoint[][];
}

export const STARTER_TOWN: WorldZoneConfig = {
  id: "starter-town",
  name: "Starter Town",
  tagline: "Soft hills, pastel roofs, and your first care stations.",
  spawn: { x: 0, y: 0.9, z: 8 },
  bounds: { minX: -28, maxX: 28, minZ: -28, maxZ: 28 },
  fogColor: "#9ec4d8",
  groundColor: "#7faf78",
  accentColor: "#6f9bff",
  landmarks: [
    {
      id: "pet-center",
      label: "Pet Center",
      position: { x: -10, y: 0, z: -8 },
      color: "#f2d7b2",
      height: 4.2,
      width: 6,
      depth: 5,
    },
    {
      id: "marketplace",
      label: "Marketplace",
      position: { x: 11, y: 0, z: -4 },
      color: "#e8c27a",
      height: 3.2,
      width: 7,
      depth: 4.5,
    },
    {
      id: "tutorial-arch",
      label: "Tutorial Meadow Gate",
      position: { x: 0, y: 0, z: -18 },
      color: "#b7d7a8",
      height: 3.6,
      width: 5,
      depth: 1.4,
    },
    {
      id: "town-hall",
      label: "Town Hall",
      position: { x: 0, y: 0, z: -6 },
      color: "#dce7f8",
      height: 5,
      width: 5.5,
      depth: 5.5,
    },
    {
      id: "cafe",
      label: "Bounce Café",
      position: { x: -14, y: 0, z: 6 },
      color: "#f0c4b8",
      height: 2.8,
      width: 4,
      depth: 4,
    },
    {
      id: "garden",
      label: "Community Garden",
      position: { x: 14, y: 0, z: 8 },
      color: "#9ecf8c",
      height: 1.2,
      width: 5,
      depth: 5,
    },
  ],
  stations: [
    {
      id: "station-hatch",
      label: "Adoption Desk",
      kind: "care",
      position: { x: -10, y: 0, z: -4.5 },
      radius: 2.4,
      hint: "Hatch your first buddy from the care desk.",
      careHref: "/#buddy",
    },
    {
      id: "station-feed",
      label: "Snack Bowl",
      kind: "care",
      position: { x: -7, y: 0, z: -7 },
      radius: 2.2,
      hint: "Feed restores belly. Tiny testnet self-transfer.",
      careHref: "/#buddy",
    },
    {
      id: "station-play",
      label: "Play Green",
      kind: "care",
      position: { x: 3, y: 0, z: 4 },
      radius: 2.6,
      hint: "Play is a free daily signature that restores energy.",
      careHref: "/#buddy",
    },
    {
      id: "station-tutorial",
      label: "Tutorial Sign",
      kind: "info",
      position: { x: 0, y: 0, z: -15 },
      radius: 2.2,
      hint: "WASD / stick to walk · E / Interact near glowing pads · Esc returns to pasture.",
    },
    {
      id: "station-market",
      label: "Market Board",
      kind: "portal",
      position: { x: 11, y: 0, z: -1.2 },
      radius: 2.3,
      hint: "Browse cosmetics and player listings on the pasture market.",
      careHref: "/#market",
    },
    {
      id: "station-fish",
      label: "Pond Pier",
      kind: "portal",
      position: { x: -12, y: 0, z: 10 },
      radius: 2.5,
      hint: "Cast, wait for a nibble, reel in time — up to 3 catches per UTC day.",
      careHref: "/#fishing",
    },
    {
      id: "station-home",
      label: "Cottage Gate",
      kind: "portal",
      position: { x: 14, y: 0, z: 5 },
      radius: 2.4,
      hint: "Visit your 4×4 home plot — place furniture bought from the market.",
      careHref: "/#home",
    },
    {
      id: "station-dig",
      label: "Dig Site",
      kind: "portal",
      position: { x: 6, y: 0, z: -12 },
      radius: 2.4,
      hint: "Read the clue, pick a tile, dig — up to 3 tries per UTC day.",
      careHref: "/#treasure",
    },
    {
      id: "station-garden",
      label: "Garden Beds",
      kind: "portal",
      position: { x: 14, y: 0, z: 10 },
      radius: 2.5,
      hint: "Plant, water, and harvest crops on three garden slots.",
      careHref: "/#garden",
    },
    {
      id: "station-kitchen",
      label: "Pasture Kitchen",
      kind: "portal",
      position: { x: -14, y: 0, z: 8 },
      radius: 2.5,
      hint: "Cook recipes from crops and fish, then serve snacks for care boosts.",
      careHref: "/#kitchen",
    },
    {
      id: "station-mine",
      label: "Crystal Cavern",
      kind: "portal",
      position: { x: -10, y: 0, z: -14 },
      radius: 2.5,
      hint: "Spend stamina to strike ore veins — upgrade pickaxes for rarer finds.",
      careHref: "/#mining",
    },
  ],
  paths: [
    [
      { x: 0, y: 0.02, z: 12 },
      { x: 0, y: 0.02, z: -18 },
    ],
    [
      { x: -12, y: 0.02, z: 0 },
      { x: 12, y: 0.02, z: 0 },
    ],
  ],
};

/** Expansion stubs — unique palettes + portal hooks; full meshes arrive later. */
function stubZone(
  partial: Pick<
    WorldZoneConfig,
    "id" | "name" | "tagline" | "fogColor" | "groundColor" | "accentColor"
  >,
): WorldZoneConfig {
  return {
    ...partial,
    spawn: { x: 0, y: 0.9, z: 6 },
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    landmarks: [
      {
        id: `${partial.id}-gate`,
        label: `${partial.name} Gate`,
        position: { x: 0, y: 0, z: -8 },
        color: partial.accentColor,
        height: 3.5,
        width: 5,
        depth: 2,
      },
    ],
    stations: [
      {
        id: `${partial.id}-info`,
        label: "Coming Soon",
        kind: "info",
        position: { x: 0, y: 0, z: 0 },
        radius: 2.2,
        hint: `${partial.name} expands in a future content drop. Portal hooks are ready.`,
      },
    ],
    paths: [
      [
        { x: 0, y: 0.02, z: 8 },
        { x: 0, y: 0.02, z: -10 },
      ],
    ],
  };
}

export const EXPANSION_ZONES: WorldZoneConfig[] = [
  stubZone({
    id: "forest",
    name: "Forest Zone",
    tagline: "Gathering groves and rare rustles.",
    fogColor: "#8fbf9a",
    groundColor: "#3f7a4a",
    accentColor: "#c6e6a8",
  }),
  stubZone({
    id: "beach",
    name: "Beach Zone",
    tagline: "Fishing pier and seasonal tides.",
    fogColor: "#9fd0e6",
    groundColor: "#e2d2a8",
    accentColor: "#7ec8e3",
  }),
  stubZone({
    id: "mountains",
    name: "Mountains",
    tagline: "Overlook quests and hidden collectibles.",
    fogColor: "#b7c4d8",
    groundColor: "#8b93a3",
    accentColor: "#dfe6f2",
  }),
  stubZone({
    id: "city",
    name: "City District",
    tagline: "Social plazas and player shops.",
    fogColor: "#c5c9d8",
    groundColor: "#6d7384",
    accentColor: "#f0c27a",
  }),
  stubZone({
    id: "academy",
    name: "Boing Academy",
    tagline: "Pet training campus and exams.",
    fogColor: "#d7e4ff",
    groundColor: "#6f9b7a",
    accentColor: "#9bb7ff",
  }),
];

export type WorldConfigResponse = {
  version: 1;
  defaultZone: string;
  zones: WorldZoneConfig[];
};

export const WORLD_CONFIG: WorldConfigResponse = {
  version: 1,
  defaultZone: STARTER_TOWN.id,
  zones: [STARTER_TOWN, ...EXPANSION_ZONES],
};
