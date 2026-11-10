import {
  Color,
  ExtrudeGeometry,
  QuadraticBezierCurve3,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import {
  PET_ACCENT_HSL,
  PET_BODY_HSL,
  PET_CARD_ART,
  PET_FACE_COLOR,
  SPECIES,
  SPECIES_FEATURES,
  speciesFeatureKind,
  type SpeciesFeatureKind,
  type SpeciesFeatureSpec,
} from "../../core";

/** World units per SVG user unit, so the body rx of 54 maps to BODY_RX. */
export const PET_BODY_RX = 0.45;
export const PET_SVG_SCALE = PET_BODY_RX / PET_CARD_ART.body.rx;
/** ACES + pastel card lightness washes out to white; keep hue/sat, drop L slightly. */
export const PET_3D_LIGHTNESS_SCALE = 0.78;

const FOOT = PET_CARD_ART.feet[0]!;
const FOOT_BOTTOM =
  (PET_CARD_ART.body.cy - (FOOT.cy + FOOT.ry)) * PET_SVG_SCALE;
/** Lift the model so the feet rest just above the ground plane. */
export const PET_BODY_CENTER_Y = 0.03 - FOOT_BOTTOM;

export type PetModelLook = {
  species?: string;
  hue: number;
  accent: number;
  antenna?: number;
  spots?: number;
  shape?: number;
};

export type PetModelParams = {
  species: string;
  shape: number;
  featureKind: SpeciesFeatureKind;
  feature: SpeciesFeatureSpec;
  bodyColor: Color;
  accentColor: Color;
  faceColor: string;
  body: { x: number; y: number; z: number; cx: number; cy: number; cz: number };
  feet: {
    x: number;
    y: number;
    z: number;
    cx: number;
    cy: number;
    cz: number;
  }[];
  eyes: { x: number; y: number; z: number; r: number }[];
  spots: { x: number; y: number; z: number; r: number }[];
  showAntenna: boolean;
  antenna: { x: number; y: number; z: number; r: number };
  featureTopY: number;
  bodyTopY: number;
  hatAnchorY: number;
  accessoryY: number;
  accessoryRadius: number;
  labelY: number;
  smile: {
    x1: number;
    y1: number;
    cx: number;
    cy: number;
    x2: number;
    y2: number;
    z: number;
  };
};

export function resolveShape(look: PetModelLook): number {
  if (
    typeof look.shape === "number" &&
    look.shape >= 0 &&
    look.shape < SPECIES.length
  ) {
    return look.shape;
  }
  const index = look.species
    ? (SPECIES as readonly string[]).indexOf(look.species)
    : -1;
  return index >= 0 ? index : 0;
}

export function svgToWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: (x - PET_CARD_ART.body.cx) * PET_SVG_SCALE,
    y: (PET_CARD_ART.body.cy - y) * PET_SVG_SCALE,
  };
}

export function svgScale(n: number): number {
  return n * PET_SVG_SCALE;
}

/** Same hue and saturation as the card; 3D lightness is scaled for ACES. */
export function petMaterialColor(
  hue: number,
  channel: "body" | "accent",
): Color {
  const src = channel === "body" ? PET_BODY_HSL : PET_ACCENT_HSL;
  return new Color().setHSL(
    (((hue % 360) + 360) % 360) / 360,
    src.s / 100,
    (src.l / 100) * PET_3D_LIGHTNESS_SCALE,
  );
}

const HAT_ON_FEATURE_TOP = new Set<SpeciesFeatureKind>([
  "stone-cap",
  "star-crest",
  "mushroom-cap",
  "tuft-crown",
]);

export function featureBounds(spec: SpeciesFeatureSpec): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const points: { x: number; y: number }[] = [];
  if (spec.kind === "ellipses") {
    for (const part of spec.parts) {
      points.push(
        { x: part.cx - part.rx, y: part.cy - part.ry },
        { x: part.cx + part.rx, y: part.cy + part.ry },
      );
    }
  } else if (spec.kind === "circles") {
    for (const part of spec.parts) {
      points.push(
        { x: part.cx - part.r, y: part.cy - part.r },
        { x: part.cx + part.r, y: part.cy + part.r },
      );
    }
  } else {
    points.push(...svgPathPoints(spec.d));
  }
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

export function svgPathPoints(d: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (const cmd of tokenizeSvgPath(d)) {
    for (let i = 0; i + 1 < cmd.values.length; i += 2) {
      points.push({ x: cmd.values[i]!, y: cmd.values[i + 1]! });
    }
  }
  return points;
}

export function tokenizeSvgPath(
  d: string,
): { type: string; values: number[] }[] {
  const tokens: { type: string; values: number[] }[] = [];
  const re = /([MLQZmlqz])|([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)/g;
  let current: { type: string; values: number[] } | null = null;
  let match: RegExpExecArray | null;
  const arity: Record<string, number> = { M: 2, L: 2, Q: 4, Z: 0 };
  while ((match = re.exec(d))) {
    const cmd = match[1];
    if (cmd) {
      const type = cmd.toUpperCase();
      current = { type, values: [] };
      tokens.push(current);
      continue;
    }
    if (!current) continue;
    current.values.push(Number(match[2]));
    const need = arity[current.type] ?? 2;
    if (need > 0 && current.values.length > need) {
      const extra = current.values.splice(need);
      const next: { type: string; values: number[] } = {
        type: current.type === "M" ? "L" : current.type,
        values: extra,
      };
      tokens.push(next);
      current = next;
    }
  }
  return tokens.filter((t) => t.type === "Z" || t.values.length > 0);
}

export function shapesFromSvgPath(d: string): Shape[] {
  const shapes: Shape[] = [];
  let shape: Shape | null = null;
  for (const cmd of tokenizeSvgPath(d)) {
    if (cmd.type === "M") {
      const p = svgToWorld(cmd.values[0]!, cmd.values[1]!);
      shape = new Shape();
      shape.moveTo(p.x, p.y);
      shapes.push(shape);
    } else if (cmd.type === "L" && shape) {
      const p = svgToWorld(cmd.values[0]!, cmd.values[1]!);
      shape.lineTo(p.x, p.y);
    } else if (cmd.type === "Q" && shape) {
      const c = svgToWorld(cmd.values[0]!, cmd.values[1]!);
      const p = svgToWorld(cmd.values[2]!, cmd.values[3]!);
      shape.quadraticCurveTo(c.x, c.y, p.x, p.y);
    } else if (cmd.type === "Z" && shape) {
      shape.closePath();
    }
  }
  return shapes;
}

const FEATURE_DEPTH: Record<SpeciesFeatureKind, number> = {
  "blob-ears": 0.14,
  "sprout-leaves": 0.1,
  "cat-ears": 0.12,
  "cloud-puffs": 0.22,
  "bunny-ears": 0.12,
  "axolotl-gills": 0.16,
  "stone-cap": 0.3,
  "star-crest": 0.1,
  "mushroom-cap": 0.36,
  "tuft-crown": 0.14,
};

export function featureDepth(kind: SpeciesFeatureKind): number {
  return FEATURE_DEPTH[kind];
}

const featureGeoCache = new Map<string, BufferGeometry>();

export function featureExtrudeGeometry(
  shape: number,
  kind: SpeciesFeatureKind,
  d: string,
): BufferGeometry {
  const key = `${shape}:${kind}`;
  const cached = featureGeoCache.get(key);
  if (cached) return cached;
  const shapes = shapesFromSvgPath(d);
  const depth = featureDepth(kind);
  const geo = new ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: false,
    curveSegments: 6,
    steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  featureGeoCache.set(key, geo);
  return geo;
}

export const UNIT_SPHERE = new SphereGeometry(1, 16, 16);
export const UNIT_SPHERE_MED = new SphereGeometry(1, 12, 10);
export const UNIT_SPHERE_LO = new SphereGeometry(1, 8, 8);

let smileGeo: TubeGeometry | null = null;
export function smileTubeGeometry(): TubeGeometry {
  if (smileGeo) return smileGeo;
  const art = PET_CARD_ART.smile;
  const a = svgToWorld(art.x1, art.y1);
  const c = svgToWorld(art.cx, art.cy);
  const b = svgToWorld(art.x2, art.y2);
  const z = PET_BODY_RX * 0.86;
  const curve = new QuadraticBezierCurve3(
    new Vector3(a.x, a.y, z),
    new Vector3(c.x, c.y, z + 0.02),
    new Vector3(b.x, b.y, z),
  );
  smileGeo = new TubeGeometry(curve, 8, svgScale(2.2), 5, false);
  return smileGeo;
}

function surfaceZ(
  x: number,
  y: number,
  rx: number,
  ry: number,
  rz: number,
): number {
  const nx = x / rx;
  const ny = y / ry;
  const inside = 1 - nx * nx - ny * ny;
  return inside > 0 ? rz * Math.sqrt(inside) : rz * 0.2;
}

export function petModelParams(look: PetModelLook): PetModelParams {
  const shape = resolveShape(look);
  const species = SPECIES[shape]!;
  const feature = SPECIES_FEATURES[shape]!;
  const featureKind = speciesFeatureKind(shape);
  const bodyRx = svgScale(PET_CARD_ART.body.rx);
  const bodyRy = svgScale(PET_CARD_ART.body.ry);
  const bodyRz = bodyRx;
  const cy = PET_BODY_CENTER_Y;
  const bounds = featureBounds(feature);
  const featureTop = svgToWorld((bounds.minX + bounds.maxX) / 2, bounds.minY).y;
  const bodyTopY = cy + bodyRy;
  const hatAnchorY = HAT_ON_FEATURE_TOP.has(featureKind)
    ? cy + featureTop + 0.04
    : bodyTopY + 0.02;
  const spots = Math.max(0, Math.min(look.spots ?? 0, 3));
  const feet = PET_CARD_ART.feet.map((foot) => {
    const p = svgToWorld(foot.cx, foot.cy);
    return {
      x: p.x,
      y: cy + p.y,
      z: svgScale(8),
      cx: svgScale(foot.rx),
      cy: svgScale(foot.ry),
      cz: svgScale(foot.rx) * 0.85,
    };
  });
  const eyes = PET_CARD_ART.eyes.map((eye) => {
    const p = svgToWorld(eye.cx, eye.cy);
    const z = surfaceZ(p.x, p.y, bodyRx, bodyRy, bodyRz) + svgScale(1.5);
    return { x: p.x, y: cy + p.y, z, r: svgScale(eye.r) };
  });
  const spotItems = Array.from({ length: spots }, (_, i) => {
    const sx = PET_CARD_ART.spots.cx0 + i * PET_CARD_ART.spots.gap;
    const p = svgToWorld(sx, PET_CARD_ART.spots.cy);
    const z = surfaceZ(p.x, p.y, bodyRx, bodyRy, bodyRz) + svgScale(1);
    return { x: p.x, y: cy + p.y, z, r: svgScale(PET_CARD_ART.spots.r) };
  });
  const ant = svgToWorld(PET_CARD_ART.antenna.cx, PET_CARD_ART.antenna.cy);
  const antZ = surfaceZ(ant.x, ant.y, bodyRx, bodyRy, bodyRz) + svgScale(1);
  return {
    species,
    shape,
    featureKind,
    feature,
    bodyColor: petMaterialColor(look.hue, "body"),
    accentColor: petMaterialColor(look.accent, "accent"),
    faceColor: PET_FACE_COLOR,
    body: { x: bodyRx, y: bodyRy, z: bodyRz, cx: 0, cy, cz: 0 },
    feet,
    eyes,
    spots: spotItems,
    showAntenna: look.antenna === 1,
    antenna: {
      x: ant.x,
      y: cy + ant.y,
      z: antZ,
      r: svgScale(PET_CARD_ART.antenna.r),
    },
    featureTopY: cy + featureTop,
    bodyTopY,
    hatAnchorY,
    accessoryY: cy - 0.08,
    accessoryRadius: bodyRx + 0.08,
    labelY: Math.max(1.45, hatAnchorY + 0.38, cy + featureTop + 0.42),
    smile: {
      x1: svgToWorld(PET_CARD_ART.smile.x1, PET_CARD_ART.smile.y1).x,
      y1: cy + svgToWorld(PET_CARD_ART.smile.x1, PET_CARD_ART.smile.y1).y,
      cx: svgToWorld(PET_CARD_ART.smile.cx, PET_CARD_ART.smile.cy).x,
      cy: cy + svgToWorld(PET_CARD_ART.smile.cx, PET_CARD_ART.smile.cy).y,
      x2: svgToWorld(PET_CARD_ART.smile.x2, PET_CARD_ART.smile.y2).x,
      y2: cy + svgToWorld(PET_CARD_ART.smile.x2, PET_CARD_ART.smile.y2).y,
      z: bodyRx * 0.86,
    },
  };
}
