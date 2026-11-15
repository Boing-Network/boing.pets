/** 4-by-4-block street grid. Each activity station sits on its own block. */

import {
  STREETWEAR_PROPS,
  overlapsStreetwearProp,
  type StreetPropSpec,
} from "./streetProps";

/** World size of one Kenney road tile after scale. */
export const CITY_TILE = 6;

/** N-S avenues and E-W streets, at tile centers. */
export const CITY_STREETS_X = [-36, -18, 0, 18, 36] as const;
export const CITY_STREETS_Z = [-36, -18, 0, 18, 36] as const;

/** How far the paved grid extends past the outer intersections. */
export const CITY_GRID_MIN = -42;
export const CITY_GRID_MAX = 42;

/** Painted paths along every avenue and street. */
export function cityRoadPaths(): { x: number; y: number; z: number }[][] {
  const y = 0.02;
  return [
    ...CITY_STREETS_X.map((x) => [
      { x, y, z: CITY_GRID_MIN },
      { x, y, z: CITY_GRID_MAX },
    ]),
    ...CITY_STREETS_Z.map((z) => [
      { x: CITY_GRID_MIN, y, z },
      { x: CITY_GRID_MAX, y, z },
    ]),
  ];
}

const CURB = CITY_TILE / 2 + 1.4;
/** Paved road half-width. Collision must stay outside this so the lane stays open. */
const ROAD_HALF = CITY_TILE / 2;
const WALKER_RADIUS = 0.55;

/**
 * Shop kit halves in meters at scale 1, measured from the glb node.
 * X is the long facade, Z is the depth toward the street when rotation is 0.
 */
const FILLER_HALF: Record<string, { x: number; z: number }> = {
  "shop-wide": { x: 0.82, z: 0.504 },
  "shop-narrow": { x: 0.442, z: 0.47 },
  "shop-small": { x: 0.42, z: 0.45 },
  "shop-mid": { x: 0.442, z: 0.545 },
};

export function fillerWorldHalf(
  name: string,
  rotationY: number,
  scale: number,
): { halfW: number; halfD: number } {
  const local = FILLER_HALF[name] ?? { x: 0.5, z: 0.5 };
  const alongX = Math.abs(Math.cos(rotationY)) > 0.5;
  const hx = local.x * scale;
  const hz = local.z * scale;
  return alongX ? { halfW: hx, halfD: hz } : { halfW: hz, halfD: hx };
}

/** Slide a box off every avenue and street, including walker radius. */
export function seatOffRoads(
  x: number,
  z: number,
  halfW: number,
  halfD: number,
): { x: number; z: number } {
  let px = x;
  let pz = z;
  const needX = halfW + WALKER_RADIUS + ROAD_HALF + 0.12;
  const needZ = halfD + WALKER_RADIUS + ROAD_HALF + 0.12;
  for (let pass = 0; pass < 2; pass++) {
    for (const sx of CITY_STREETS_X) {
      if (Math.abs(px - sx) < needX) {
        const sign = px >= sx ? 1 : -1;
        px = sx + sign * needX;
      }
    }
    for (const sz of CITY_STREETS_Z) {
      if (Math.abs(pz - sz) < needZ) {
        const sign = pz >= sz ? 1 : -1;
        pz = sz + sign * needZ;
      }
    }
  }
  return { x: px, z: pz };
}

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
  { x: 25, z: -11, r: 8 }, // The Drop
  { x: 43, z: -25, r: 7 }, // print shop
  { x: 43, z: 25, r: 7 }, // fitting room
  { x: 25, z: 43, r: 7 }, // home stoop
  { x: 7, z: -43, r: 8 }, // dispatch depot
  { x: -42, z: -9, r: 8 }, // quarry
  { x: -25, z: -25, r: 7 }, // kitchen
  { x: -24, z: 26, r: 12 }, // race bowl
  { x: -9, z: 42, r: 7 }, // sweep
  { x: -12, z: -42, r: 7 }, // plot
  { x: 11, z: -27, r: 6 }, // block vault
  { x: 20, z: -50, r: 12 }, // canal
  { x: 32, z: -50, r: 6 }, // pier
  { x: -30, z: -56, r: 9 }, // oak park
  { x: 0, z: 8, r: 4 }, // spawn approach
  { x: 9, z: 27, r: 7 }, // basketball court
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
  const setbacks = [9.2, 12.6];
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
  const tryPlace = (x: number, z: number, rotY: number) => {
    const name = names[n % names.length]!;
    const half = fillerWorldHalf(name, rotY, scale);
    const seated = seatOffRoads(x, z, half.halfW, half.halfD);
    if (inReserved(seated.x, seated.z, 1.15)) return;
    if (onCityStreet(seated.x, seated.z, ROAD_HALF + 0.15)) return;
    if (overlapsStreetwearProp(seated.x, seated.z, 8)) return;
    if (
      items.some(
        (item) =>
          Math.hypot(item.position[0] - seated.x, item.position[2] - seated.z) <
          minDist,
      )
    ) {
      return;
    }
    n += 1;
    items.push({
      name,
      position: [seated.x, 0, seated.z],
      rotationY: rotY,
      scale,
    });
  };
  for (const [x, z, rotY] of candidates) {
    if (inReserved(x, z, 1.15) || onCityStreet(x, z, CURB)) continue;
    if (overlapsStreetwearProp(x, z, 8)) continue;
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
    tryPlace(x, z, rotY);
  }
  const extra: Array<[number, number, number]> = [
    [13.2, 13.0, Math.PI],
    [-8.0, -5.4, 0],
    [5.2, -13.0, 0],
  ];
  for (const [x, z, rotY] of extra) {
    if (inReserved(x, z, 1.15) || onCityStreet(x, z, CURB)) continue;
    if (overlapsStreetwearProp(x, z, 8)) continue;
    if (
      items.some(
        (item) =>
          Math.hypot(item.position[0] - x, item.position[2] - z) < minDist,
      )
    ) {
      continue;
    }
    tryPlace(x, z, rotY);
  }
  return items;
}

export function cityStreetwearProps(): (CityKitInstance & StreetPropSpec)[] {
  return STREETWEAR_PROPS.map((item) => ({
    ...item,
    position: [...item.position],
  }));
}

export function cityStreetwearBuildings(): (CityKitInstance &
  StreetPropSpec)[] {
  return cityStreetwearProps().filter((item) => item.kind === "building");
}

export function cityBuildingFootprints(): {
  x: number;
  z: number;
  r: number;
}[] {
  return [
    ...cityFillerBuildings().map((item) => {
      const half = fillerWorldHalf(item.name, item.rotationY, item.scale);
      return {
        x: item.position[0],
        z: item.position[2],
        r: Math.max(half.halfW, half.halfD),
      };
    }),
    ...cityStreetwearBuildings().map((item) => ({
      x: item.position[0],
      z: item.position[2],
      r: Math.max(item.halfW, item.halfD),
    })),
  ];
}

/** A few park trees around the Old Oak, used as path solids. */
export const CITY_PARK_TREES: readonly [number, number][] = [
  [-24, -54],
  [-26, -50],
  [-33, -48],
  [-33, -52],
];

export type CitySolid = {
  id: string;
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  height: number;
};

/** Walkable basketball lot north of the plaza, clear of stations. */
export const CITY_COURT = {
  x: 9,
  z: 27,
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
  // Far enough that the car body plus the walker radius stays off the pavement.
  const offset = 4.5;
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
    { x: 8.5, z: 11.2, rotationY: 0, width: 6.2, height: 4.0, seed: 3 },
    { x: -8.0, z: -11.4, rotationY: 0, width: 5.6, height: 3.8, seed: 7 },
    {
      x: 11.5,
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
    const alongX = Math.abs(Math.cos(car.rotationY)) > 0.5;
    solids.push({
      id: "city-car-" + i,
      x: car.x,
      z: car.z,
      // Body is 2.1 by 1.05, wheels stick out to about 0.78 on the narrow side.
      halfW: alongX ? 1.05 : 0.78,
      halfD: alongX ? 0.78 : 1.05,
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
  for (const [i, prop] of cityStreetwearProps().entries()) {
    solids.push({
      id:
        prop.kind === "building"
          ? "streetwear-building-" + i
          : "streetwear-prop-" + i,
      x: prop.position[0],
      z: prop.position[2],
      halfW: prop.halfW,
      halfD: prop.halfD,
      height: prop.height,
    });
  }
  return solids;
}

/** Taller, slightly larger boxes so the follow camera does not clip roofs. */
export function cityBuildingCameraSolids(): CitySolid[] {
  return [
    ...cityFillerBuildings().map((item, i) => {
      const half = fillerWorldHalf(item.name, item.rotationY, item.scale);
      return {
        id: "city-building-cam-" + i,
        x: item.position[0],
        z: item.position[2],
        halfW: half.halfW + 0.15,
        halfD: half.halfD + 0.15,
        height: 7.4,
      };
    }),
    ...cityStreetwearBuildings().map((item, i) => ({
      id: "streetwear-building-cam-" + i,
      x: item.position[0],
      z: item.position[2],
      halfW: item.halfW + 0.25,
      halfD: item.halfD + 0.25,
      height: item.height,
    })),
  ];
}
