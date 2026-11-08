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
      hint: "Marketplace arrives in Phase 4. For now, browse the public pasture.",
      careHref: "/#pasture",
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

export type WorldConfigResponse = {
  version: 1;
  defaultZone: string;
  zones: WorldZoneConfig[];
};

export const WORLD_CONFIG: WorldConfigResponse = {
  version: 1,
  defaultZone: STARTER_TOWN.id,
  zones: [STARTER_TOWN],
};
