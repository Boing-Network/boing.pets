/**
 * Geometry builder for procedural creatures. Primitives are placed in
 * creature-local space (ground at y = 0, facing +z), painted per vertex
 * (coat, countershading, coat noise, ground occlusion, patterns, glow), and
 * merged into one geometry per animated part. No textures and no
 * per-creature materials: everything a creature needs is in its vertices.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type Vec3 = readonly [number, number, number];

/** Muted night coat: back (sky-lit) to belly (shadowed) countershading. */
export type Coat = {
  back: string;
  belly: string;
  /** Points: feet, ear tips, nose. */
  dark: string;
};

/**
 * How a primitive is coloured. `coat` countershades between back and belly;
 * a plain colour paints it flat (plus noise and occlusion).
 */
export type Paint =
  | "coat"
  | "dark"
  | "belly"
  | { color: string; grain?: number; glow?: string; glowStrength?: number };

/** Surface grain the shader adds on top (fur, feathers, scale, smooth). */
export const GRAIN = { fur: 1, feather: 0.7, scale: 0.55, smooth: 0.15 };

export type PatternResult = {
  color?: string;
  mix?: number;
  glow?: string;
  glowStrength?: number;
};

export type PatternFn = (
  p: Vector3,
  n: Vector3,
  part: PartName,
) => PatternResult | null;

export type PartName =
  | "body"
  | "head"
  | "tail"
  | "legFL"
  | "legFR"
  | "legHL"
  | "legHR"
  | "wingL"
  | "wingR"
  | "wing2L"
  | "wing2R";

export type BuiltPart = {
  name: PartName;
  geometry: BufferGeometry;
  pivot: Vector3;
  /** Thin double-sided surfaces (wing membranes). */
  membrane: boolean;
};

const UP = new Vector3(0, 1, 0);
const tmpColor = new Color();
const tmpColor2 = new Color();

// Deterministic value noise for coat variation (no Math.random).
function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function valueNoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth01(x - xi);
  const v = smooth01(y - yi);
  const w = smooth01(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) =>
    hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

function smooth01(t: number): number {
  return t * t * (3 - 2 * t);
}

export function smoothstep(a: number, b: number, x: number): number {
  return smooth01(Math.min(1, Math.max(0, (x - a) / (b - a))));
}

export class CreatureBuilder {
  readonly #parts = new Map<PartName, BufferGeometry[]>();
  readonly #pivots = new Map<PartName, Vector3>();
  readonly #membranes = new Set<PartName>();
  #part: PartName = "body";
  #grain = GRAIN.fur;

  constructor(
    readonly coat: Coat,
    /** 1 for close-up detail, ~0.5 for the far, instanced body. */
    readonly detail: number,
    readonly pattern: PatternFn | null = null,
    /** Standing height, used to scale ground occlusion. */
    readonly height = 0.4,
  ) {}

  /** Following primitives belong to `name`, rotating about `pivot`. */
  part(name: PartName, pivot: Vec3 = [0, 0, 0], membrane = false): this {
    this.#part = name;
    if (!this.#pivots.has(name)) this.#pivots.set(name, new Vector3(...pivot));
    if (membrane) this.#membranes.add(name);
    return this;
  }

  grain(amount: number): this {
    this.#grain = amount;
    return this;
  }

  #segs(n: number): number {
    return Math.max(5, Math.round(n * this.detail));
  }

  /** Ellipsoid with radii `r`, optionally rotated (Euler xyz, radians). */
  ellipsoid(
    center: Vec3,
    r: Vec3,
    paint: Paint = "coat",
    rot: Vec3 = [0, 0, 0],
    segs = 16,
  ): this {
    const g = new SphereGeometry(
      1,
      this.#segs(segs),
      Math.max(4, this.#segs(segs * 0.7)),
    );
    g.applyMatrix4(
      new Matrix4().compose(
        new Vector3(...center),
        new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2])),
        new Vector3(...r),
      ),
    );
    return this.#add(g, paint);
  }

  /** Tapered tube from `a` (radius ra) to `b` (radius rb), round joints. */
  tube(
    a: Vec3,
    b: Vec3,
    ra: number,
    rb: number,
    paint: Paint = "coat",
    segs = 10,
  ): this {
    const va = new Vector3(...a);
    const dir = new Vector3(...b).sub(va);
    const len = dir.length();
    if (len < 1e-5) return this;
    const g = new CylinderGeometry(rb, ra, len, this.#segs(segs), 1, true);
    g.translate(0, len / 2, 0);
    const q = new Quaternion().setFromUnitVectors(UP, dir.normalize());
    g.applyMatrix4(new Matrix4().compose(va, q, new Vector3(1, 1, 1)));
    this.#add(g, paint);
    const joint = Math.max(6, segs - 2);
    this.ellipsoid(a, [ra, ra, ra], paint, [0, 0, 0], joint);
    this.ellipsoid(b, [rb, rb, rb], paint, [0, 0, 0], joint);
    return this;
  }

  /** Cone from base centre `a` (radius r) to tip `b`, flattened in z. */
  cone(
    a: Vec3,
    b: Vec3,
    r: number,
    paint: Paint = "coat",
    flatten = 1,
    segs = 8,
  ): this {
    const va = new Vector3(...a);
    const dir = new Vector3(...b).sub(va);
    const len = dir.length();
    if (len < 1e-5) return this;
    const g = new ConeGeometry(r, len, this.#segs(segs), 1, false);
    g.scale(1, 1, flatten);
    g.translate(0, len / 2, 0);
    const q = new Quaternion().setFromUnitVectors(UP, dir.normalize());
    g.applyMatrix4(new Matrix4().compose(va, q, new Vector3(1, 1, 1)));
    return this.#add(g, paint);
  }

  /** Flat membrane (wing) from a 2D outline on axes `u`, `v` at `origin`. */
  membrane(
    origin: Vec3,
    outline: [number, number][],
    u: Vec3,
    v: Vec3,
    paint: Paint,
  ): this {
    const g = new ShapeGeometry(
      new Shape(outline.map(([x, y]) => new Vector2(x, y))),
    );
    const pos = g.getAttribute("position");
    const o = new Vector3(...origin);
    const uu = new Vector3(...u);
    const vv = new Vector3(...v);
    const p = new Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      p.copy(o)
        .addScaledVector(uu, pos.getX(i))
        .addScaledVector(vv, pos.getY(i));
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    g.computeVertexNormals();
    return this.#add(g, paint);
  }

  #add(g: BufferGeometry, paint: Paint): this {
    g.deleteAttribute("uv");
    if (g.index == null) {
      const count = g.getAttribute("position").count;
      g.setIndex(Array.from({ length: count }, (_, i) => i));
    }
    this.#paint(g, paint);
    const list = this.#parts.get(this.#part) ?? [];
    list.push(g);
    this.#parts.set(this.#part, list);
    return this;
  }

  #paint(g: BufferGeometry, paint: Paint): void {
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const colors = new Float32Array(pos.count * 3);
    const glow = new Float32Array(pos.count * 4);
    const p = new Vector3();
    const n = new Vector3();
    const back = new Color(this.coat.back);
    const belly = new Color(this.coat.belly);
    const flat =
      typeof paint === "object"
        ? new Color(paint.color)
        : paint === "dark"
          ? new Color(this.coat.dark)
          : paint === "belly"
            ? belly
            : null;
    const grain =
      typeof paint === "object" && paint.grain != null
        ? paint.grain
        : this.#grain;
    const glowColor =
      typeof paint === "object" && paint.glow ? new Color(paint.glow) : null;
    const glowStrength =
      typeof paint === "object" ? (paint.glowStrength ?? 0.8) : 0;
    for (let i = 0; i < pos.count; i += 1) {
      p.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nor, i);
      if (flat) {
        tmpColor.copy(flat);
      } else {
        // Countershading: sky-facing coat reads as the back colour, the
        // underside and inner legs as the paler belly.
        tmpColor.copy(belly).lerp(back, smoothstep(-0.55, 0.45, n.y));
      }
      let gr = 0;
      let gg = 0;
      let gb = 0;
      if (glowColor) {
        gr = glowColor.r * glowStrength;
        gg = glowColor.g * glowStrength;
        gb = glowColor.b * glowStrength;
      }
      const pat = flat ? null : (this.pattern?.(p, n, this.#part) ?? null);
      if (pat?.color) {
        tmpColor2.set(pat.color);
        tmpColor.lerp(tmpColor2, pat.mix ?? 1);
      }
      if (pat?.glow) {
        tmpColor2.set(pat.glow);
        const s = pat.glowStrength ?? 0.6;
        gr += tmpColor2.r * s;
        gg += tmpColor2.g * s;
        gb += tmpColor2.b * s;
      }
      // Coat variation: broad patches plus a finer mottle.
      const broad = valueNoise3(p.x * 9, p.y * 9, p.z * 9);
      const fine = valueNoise3(p.x * 41 + 7, p.y * 41, p.z * 41);
      const vary = 0.86 + broad * 0.18 + fine * 0.1 * grain;
      // Occlusion: underside, and everything close to the ground.
      const under = 0.78 + 0.22 * smoothstep(-0.9, 0.2, n.y);
      const ground = 0.62 + 0.38 * smoothstep(0, this.height * 0.35, p.y);
      const k = vary * under * ground;
      colors[i * 3] = tmpColor.r * k;
      colors[i * 3 + 1] = tmpColor.g * k;
      colors[i * 3 + 2] = tmpColor.b * k;
      glow[i * 4] = gr;
      glow[i * 4 + 1] = gg;
      glow[i * 4 + 2] = gb;
      glow[i * 4 + 3] = grain;
    }
    g.setAttribute("color", new BufferAttribute(colors, 3));
    g.setAttribute("glow", new BufferAttribute(glow, 4));
  }

  /** One geometry per part, translated so its pivot is the origin. */
  build(): BuiltPart[] {
    const out: BuiltPart[] = [];
    for (const [name, list] of this.#parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const pivot = this.#pivots.get(name) ?? new Vector3();
      merged.translate(-pivot.x, -pivot.y, -pivot.z);
      merged.computeBoundingSphere();
      out.push({
        name,
        geometry: merged,
        pivot,
        membrane: this.#membranes.has(name),
      });
    }
    return out;
  }

  /** Everything in its rest pose as one geometry (far LOD, instanced). */
  buildMerged(): BufferGeometry {
    const all: BufferGeometry[] = [];
    for (const list of this.#parts.values()) all.push(...list);
    const merged = mergeGeometries(all, false);
    for (const g of all) g.dispose();
    if (!merged) throw new Error("empty creature");
    merged.computeBoundingSphere();
    return merged;
  }
}
