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
  const scale = 5.8;
  const minDist = 6.6;
  const candidates: Array<[number, number, number]> = [];
  const setbacks = [7.6, 11.2];
  for (const x of CITY_STREETS_X) {
    for (
      let z = CITY_GRID_MIN + CITY_TILE;
      z <= CITY_GRID_MAX - CITY_TILE;
      z += CITY_TILE
    ) {
      if (CITY_STREETS_Z.some((sz) => Math.abs(z - sz) < CITY_TILE)) continue;
      for (const setback of setbacks) {
        candidates.push(
          [x + setback, z, -Math.PI / 2],
          [x - setback, z, Math.PI / 2],
        );
      }
    }
  }
  for (const z of CITY_STREETS_Z) {
    for (
      let x = CITY_GRID_MIN + CITY_TILE;
      x <= CITY_GRID_MAX - CITY_TILE;
      x += CITY_TILE
    ) {
      if (CITY_STREETS_X.some((sx) => Math.abs(x - sx) < CITY_TILE)) continue;
      for (const setback of setbacks) {
        candidates.push([x, z + setback, Math.PI], [x, z - setback, 0]);
      }
    }
  }
  let n = 0;
  for (const [x, z, rotY] of candidates) {
    if (inReserved(x, z, 1.15) || onCityStreet(x, z, CURB)) continue;
    if (Math.hypot(x, z - 8) < 5 && Math.abs(x) < 5) continue;
    if (
      Math.abs(x - CITY_COURT.x) < CITY_COURT.width / 2 + 1.1 &&
      Math.abs(z - CITY_COURT.z) < CITY_COURT.depth / 2 + 1.1
    ) {
      continue;
    }
    if (
      items.some(
        (item) =>
          Math.hypot(item.position[0] - x, item.position[2] - z) < minDist,
      )
    ) {
      continue;
    }
    const name = names[n % names.length]!;
    n += 1;
    items.push({ name, position: [x, 0, z], rotationY: rotY, scale });
  }
  const extra: Array<[number, number, number]> = [
    [13.2, 13.0, Math.PI],
    [-8.0, -5.4, 0],
    [5.2, -13.0, 0],
  ];
  for (const [x, z, rotY] of extra) {
    if (inReserved(x, z, 1.15) || onCityStreet(x, z, CURB)) continue;
    if (
      items.some(
        (item) =>
          Math.hypot(item.position[0] - x, item.position[2] - z) < minDist,
      )
    ) {
      continue;
    }
    const name = names[n % names.length]!;
    n += 1;
    items.push({ name, position: [x, 0, z], rotationY: rotY, scale });
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
    r: 2.6,
  }));
}

/** A few park trees around the Old Oak, used as path solids. */
export const CITY_PARK_TREES: readonly [number, number][] = [
  [-22, -26],
  [-21, -30],
  [-13, -31],
  [-11, -28],
];

export type CitySolid = {
  id: string;
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  height: number;
};

/** Walkable basketball lot in the SE mid-block, clear of stations. */
export const CITY_COURT = {
  x: 8.5,
  z: 8,
  rotY: 0,
  width: 8.4,
  depth: 6.6,
} as const;

export type CityCarSpot = {
  x: number;
  z: number;
  rotationY: number;
  color: string;
};

const CAR_COLORS = [
  "#1a1a1c",
  "#2a2a28",
  "#3a241c",
  "#4a1408",
  "#222428",
] as const;

/** Parked cars sitting in lot bays, off the walkable street corridor. */
export function cityParkedCars(): CityCarSpot[] {
  const cars: CityCarSpot[] = [];
  const spots: Array<[number, number, number]> = [];
  const offset = 3.15;
  for (const z of CITY_STREETS_Z) {
    for (const x of [-12, -6, 6, 12] as const) {
      spots.push([x, z + offset, 0], [x, z - offset, Math.PI]);
    }
  }
  for (const x of CITY_STREETS_X) {
    for (const z of [-12, -6, 6, 12] as const) {
      spots.push([x + offset, z, Math.PI / 2], [x - offset, z, -Math.PI / 2]);
    }
  }
  spots.push([6, 12.4, 0], [8.5, 12.4, 0], [11, 12.4, 0]);
  for (const [x, z, rot] of spots) {
    const nearIntersection =
      CITY_STREETS_X.some((sx) => Math.abs(x - sx) < 4.2) &&
      CITY_STREETS_Z.some((sz) => Math.abs(z - sz) < 4.2);
    if (nearIntersection) continue;
    if (inReserved(x, z, 1.6)) continue;
    if (Math.hypot(x - 0, z - 8) < 6) continue;
    if (
      Math.hypot(x - CITY_COURT.x, z - CITY_COURT.z) <
      Math.max(CITY_COURT.width, CITY_COURT.depth) / 2 + 0.8
    ) {
      continue;
    }
    if (cars.some((car) => Math.hypot(car.x - x, car.z - z) < 3.2)) continue;
    cars.push({
      x,
      z,
      rotationY: rot,
      color: CAR_COLORS[cars.length % CAR_COLORS.length]!,
    });
  }
  return cars;
}

export type CityMural = {
  x: number;
  z: number;
  rotationY: number;
  width: number;
  height: number;
  seed: number;
};

export function cityMuralWalls(): CityMural[] {
  return [
    { x: 8.5, z: 13.0, rotationY: 0, width: 6.2, height: 4.0, seed: 3 },
    { x: -8.0, z: -14.6, rotationY: 0, width: 5.6, height: 3.8, seed: 7 },
    {
      x: 14.6,
      z: -4.8,
      rotationY: Math.PI / 2,
      width: 5.4,
      height: 3.8,
      seed: 11,
    },
  ].filter((wall) => !onCityStreet(wall.x, wall.z, CURB - 0.4));
}

/** Dumpsters, containers, and construction dressing for leftover pockets. */
export function cityPropKits(): CityKitInstance[] {
  const items: CityKitInstance[] = [];
  const add = (
    name: string,
    x: number,
    z: number,
    rotationY: number,
    scale: number,
  ) => {
    if (inReserved(x, z, 1.4) || onCityStreet(x, z, CURB + 0.3)) return;
    items.push({ name, position: [x, 0, z], rotationY, scale });
  };
  add("dumpster", 15.2, -3.6, Math.PI / 2, 3.2);
  add("dumpster", -15.0, -3.4, -Math.PI / 2, 3.2);
  add("dumpster", 5.4, 15.8, 0, 3.2);
  add("container-a", 14.6, 20.5, 0, 3.4);
  add("container-b", 17.6, 20.5, 0, 3.4);
  add("container-a", -15.5, 16.5, Math.PI / 2, 3.2);
  add("construction-barrier", 4.2, 19.2, Math.PI / 2, 2.8);
  add("construction-barrier", 6.2, 19.2, Math.PI / 2, 2.8);
  add("construction-cone", 3.2, 18.4, 0, 2.4);
  add("construction-cone", 7.4, 18.6, 0.4, 2.4);
  add("construction-fence", -5.2, 16.8, 0, 2.6);
  add("construction-fence", -2.6, 16.8, 0, 2.6);
  return items;
}

function muralSolid(wall: CityMural): CitySolid {
  const alongX = Math.abs(Math.cos(wall.rotationY)) < 0.5;
  return {
    id: "city-mural",
    x: wall.x,
    z: wall.z,
    halfW: alongX ? wall.width / 2 : 0.35,
    halfD: alongX ? 0.35 : wall.width / 2,
    height: wall.height,
  };
}

/** Path solids for parked cars, murals, and lot props (court stays walkable). */
export function cityDressingSolids(): CitySolid[] {
  const solids: CitySolid[] = [];
  for (const [i, car] of cityParkedCars().entries()) {
    solids.push({
      id: "city-car-" + i,
      x: car.x,
      z: car.z,
      halfW: 1.15,
      halfD: 0.55,
      height: 1.2,
    });
  }
  for (const [i, wall] of cityMuralWalls().entries()) {
    solids.push({ ...muralSolid(wall), id: "city-mural-" + i });
  }
  for (const [i, prop] of cityPropKits().entries()) {
    const bulky = prop.name.startsWith("container") || prop.name === "dumpster";
    solids.push({
      id: "city-prop-" + i,
      x: prop.position[0],
      z: prop.position[2],
      halfW: bulky ? 1.6 : 0.7,
      halfD: bulky ? 1.1 : 0.5,
      height: bulky ? 2.4 : 1.2,
    });
  }
  return solids;
}

/** Taller, slightly larger boxes so the follow camera does not clip roofs. */
export function cityBuildingCameraSolids(): CitySolid[] {
  return cityFillerBuildings().map((item, i) => ({
    id: "city-building-cam-" + i,
    x: item.position[0],
    z: item.position[2],
    halfW: 3.35,
    halfD: 3.35,
    height: 7.4,
  }));
}
