/** Compact 2-by-2-block street grid for The Yard (street-level city district). */

/** World size of one Kenney road tile after scale. */
export const CITY_TILE = 6;

/** N-S avenues and E-W streets, at tile centers. */
export const CITY_STREETS_X = [-18, 0, 18] as const;
export const CITY_STREETS_Z = [-18, 0, 18] as const;

/** How far the paved grid extends past the outer intersections. */
export const CITY_GRID_MIN = -24;
export const CITY_GRID_MAX = 24;

const CURB = CITY_TILE / 2 + 1.4;

export type CityKitInstance = {
  name: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
};

export function isCityStreetCell(x: number, z: number): boolean {
  const onX = CITY_STREETS_X.some((sx) => Math.abs(x - sx) < 0.01);
  const onZ = CITY_STREETS_Z.some((sz) => Math.abs(z - sz) < 0.01);
  if (!onX && !onZ) return false;
  return (
    x + 0.01 >= CITY_GRID_MIN &&
    x - 0.01 <= CITY_GRID_MAX &&
    z + 0.01 >= CITY_GRID_MIN &&
    z - 0.01 <= CITY_GRID_MAX
  );
}

/** True if a point sits on a road or sidewalk corridor. */
export function onCityStreet(x: number, z: number, width = CURB): boolean {
  const onAv = CITY_STREETS_X.some((sx) => Math.abs(x - sx) <= width);
  const onSt = CITY_STREETS_Z.some((sz) => Math.abs(z - sz) <= width);
  if (!onAv && !onSt) return false;
  return (
    x >= CITY_GRID_MIN - width &&
    x <= CITY_GRID_MAX + width &&
    z >= CITY_GRID_MIN - width &&
    z <= CITY_GRID_MAX + width
  );
}

export function cityStreetSegments(): {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}[] {
  return [
    ...CITY_STREETS_X.map((x) => ({
      x1: x,
      z1: CITY_GRID_MIN,
      x2: x,
      z2: CITY_GRID_MAX,
    })),
    ...CITY_STREETS_Z.map((z) => ({
      x1: CITY_GRID_MIN,
      z1: z,
      x2: CITY_GRID_MAX,
      z2: z,
    })),
  ];
}

function key(x: number, z: number): string {
  return `${x},${z}`;
}

export function cityRoadTiles(): CityKitInstance[] {
  const tiles: CityKitInstance[] = [];
  const placed = new Set<string>();
  const scale = CITY_TILE;
  const add = (name: string, x: number, z: number, rotationY: number) => {
    const id = key(x, z);
    if (placed.has(id)) return;
    placed.add(id);
    tiles.push({ name, position: [x, 0, z], rotationY, scale });
  };

  for (const x of CITY_STREETS_X) {
    for (const z of CITY_STREETS_Z) {
      add("road-crossroad", x, z, 0);
    }
  }
  for (const x of CITY_STREETS_X) {
    for (const z of CITY_STREETS_Z) {
      const arms: [number, number, number][] = [
        [0, CITY_TILE, 0],
        [0, -CITY_TILE, 0],
        [CITY_TILE, 0, Math.PI / 2],
        [-CITY_TILE, 0, Math.PI / 2],
      ];
      for (const [dx, dz, rot] of arms) {
        const px = x + dx;
        const pz = z + dz;
        if (!isCityStreetCell(px, pz)) continue;
        add("road-crossing", px, pz, rot);
      }
    }
  }
  for (const x of CITY_STREETS_X) {
    for (let z = CITY_GRID_MIN; z <= CITY_GRID_MAX; z += CITY_TILE) {
      if (!isCityStreetCell(x, z) || placed.has(key(x, z))) continue;
      add("road-straight", x, z, 0);
    }
  }
  for (const z of CITY_STREETS_Z) {
    for (let x = CITY_GRID_MIN; x <= CITY_GRID_MAX; x += CITY_TILE) {
      if (!isCityStreetCell(x, z) || placed.has(key(x, z))) continue;
      add("road-straight", x, z, Math.PI / 2);
    }
  }
  return tiles;
}

export function cityStreetLights(): CityKitInstance[] {
  const items: CityKitInstance[] = [];
  const scale = 6;
  const inset = CITY_TILE / 2 + 0.85;
  for (const x of CITY_STREETS_X) {
    for (const z of CITY_STREETS_Z) {
      for (const [sx, sz] of [
        [-inset, -inset],
        [inset, -inset],
        [-inset, inset],
        [inset, inset],
      ] as const) {
        items.push({
          name: "street-light",
          position: [x + sx, 0, z + sz],
          rotationY: Math.atan2(-sx, -sz),
          scale,
        });
      }
    }
  }
  return items;
}

export function cityTrafficLights(): CityKitInstance[] {
  const items: CityKitInstance[] = [];
  const scale = 5.4;
  const off = CITY_TILE / 2 + 0.35;
  // One signal at each main intersection, on the near-right corner.
  for (const x of CITY_STREETS_X) {
    for (const z of CITY_STREETS_Z) {
      items.push({
        name: "traffic-light",
        position: [x + off, 0, z + off],
        rotationY: -Math.PI / 4,
        scale,
      });
    }
  }
  return items;
}

/** Lots reserved for stations, the oak park, and the canal — no filler buildings. */
export const CITY_RESERVED_LOTS: readonly {
  x: number;
  z: number;
  r: number;
}[] = [
  { x: 12, z: -8, r: 7 }, // The Drop
  { x: -12, z: -8, r: 6 }, // kitchen truck
  { x: 22, z: -12, r: 6 }, // print shop
  { x: 22, z: 10, r: 6 }, // fitting room
  { x: 28, z: 16, r: 6 }, // home stoop
  { x: -22, z: 6, r: 7 }, // crystal yard
  { x: 8, z: 20, r: 6 }, // treasure construction
  { x: -10, z: 12, r: 8 }, // skate park
  { x: 10, z: -18, r: 6 }, // garden
  { x: -16, z: -26, r: 8 }, // oak park
  { x: 6, z: -24, r: 11 }, // canal
  { x: 0, z: 8, r: 3 }, // spawn approach
];

function inReserved(x: number, z: number, pad = 0): boolean {
  return CITY_RESERVED_LOTS.some(
    (lot) => Math.hypot(x - lot.x, z - lot.z) <= lot.r + pad,
  );
}

/** Filler buildings lining the streets, set back from the curb. */
export function cityFillerBuildings(): CityKitInstance[] {
  const items: CityKitInstance[] = [];
  const names = ["shop-narrow", "shop-small", "shop-mid", "shop-wide"] as const;

  const setback = CITY_TILE / 2 + 4.6;
  const scale = 6.2;
  let n = 0;
  const consider = (x: number, z: number, rotY: number) => {
    if (inReserved(x, z, 2.5) || onCityStreet(x, z, CURB + 0.4)) return;
    const name = names[n % names.length]!;
    n += 1;
    items.push({ name, position: [x, 0, z], rotationY: rotY, scale });
  };
  for (const x of CITY_STREETS_X) {
    for (
      let z = CITY_GRID_MIN + CITY_TILE;
      z <= CITY_GRID_MAX - CITY_TILE;
      z += CITY_TILE * 2
    ) {
      if (CITY_STREETS_Z.some((sz) => Math.abs(z - sz) < CITY_TILE)) continue;
      consider(x + setback, z, -Math.PI / 2);
      consider(x - setback, z, Math.PI / 2);
    }
  }
  for (const z of CITY_STREETS_Z) {
    for (
      let x = CITY_GRID_MIN + CITY_TILE;
      x <= CITY_GRID_MAX - CITY_TILE;
      x += CITY_TILE * 2
    ) {
      if (CITY_STREETS_X.some((sx) => Math.abs(x - sx) < CITY_TILE)) continue;
      consider(x, z + setback, Math.PI);
      consider(x, z - setback, 0);
    }
  }
  return items;
}

export function cityBuildingFootprints(): {
  x: number;
  z: number;
  r: number;
}[] {
  return cityFillerBuildings().map((item) => ({
    x: item.position[0],
    z: item.position[2],
    r: 2.4,
  }));
}

/** A few park trees around the Old Oak, used as path solids. */
export const CITY_PARK_TREES: readonly [number, number][] = [
  [-22, -26],
  [-21, -30],
  [-13, -31],
  [-11, -28],
];
