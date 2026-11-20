/**
 * Body plans: parametric builders for quadrupeds, birds, the bat, the moth,
 * the tortoise and the newt. Each species is a parameter set over one of
 * these (see `species.ts`), so proportions come from the animal rather than
 * a shared toy template. Units are creature-local: ground at y = 0, facing
 * +z. The token applies each species' world scale.
 */
import {
  GRAIN,
  type Coat,
  type CreatureBuilder,
  type Paint,
  type PartName,
  type PatternFn,
  type Vec3,
} from "./builder";

export type GaitStyle =
  | "walk"
  | "trot"
  | "bound"
  | "hop"
  | "waddle"
  | "scurry"
  | "crawl"
  | "wade"
  | "fly";

/** What the animator needs to know about a built body. */
export type RigInfo = {
  gait: GaitStyle;
  /** Leg swing amplitude (radians) at full gait weight. */
  stride: number;
  /** Radius of the soft contact shadow, creature-local. */
  footprint: number;
  /** Breaths per second at rest (small animals breathe faster). */
  breathRate: number;
  /** Wing beat amplitude (radians); 0 for walkers. */
  flap: number;
  /** Lateral body wave for sprawling crawlers (radians). */
  undulate: number;
  /** Typical standing height, creature-local. */
  height: number;
  /** How far the head turns to look around (radians). */
  lookRange: number;
};

export type Anatomy = {
  coat: Coat;
  pattern?: PatternFn;
  info: RigInfo;
  build: (b: CreatureBuilder) => void;
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export type EarKind = "pointed" | "round" | "long" | "tufted" | "none";
export type TailKind = "bushy" | "thin" | "short" | "plume" | "ringed";

export type QuadSpec = {
  coat: Coat;
  pattern?: PatternFn;
  gait: GaitStyle;
  /** Ground to the underside of the chest. */
  legH: number;
  /** Chest-centre to rump-centre distance along z. */
  bodyLen: number;
  /** Tucked waist (0 barrel-bodied … 1 greyhound-lean). */
  waist?: number;
  chest: Vec3;
  rump: Vec3;
  /** Rump centre height relative to the chest centre. */
  rumpLift?: number;
  legR: number;
  foot: "paw" | "hoof";
  /** Dark lower legs ("points"): 0 none, ~0.5 to the knee, 1 full. */
  socks?: number;
  /** Legs splayed sideways (badgers) as a fraction of body width. */
  splay?: number;
  /** Long folded hind legs (hares, squirrels, marmots). */
  hindFold?: number;
  neck: { len: number; pitch: number; r: number };
  head: {
    r: Vec3;
    snoutLen: number;
    snoutR: number;
    /** Snout droop below the cranium centre. */
    snoutDrop?: number;
    eye?: number;
    /** Night eyeshine, a faint glow. */
    eyeshine?: string;
  };
  ears: { kind: EarKind; len: number; w: number; tilt?: number };
  tail: { kind: TailKind; len: number; r: number; lift: number; tip?: string };
  extras?: (b: CreatureBuilder, at: QuadFrame) => void;
  info?: Partial<RigInfo>;
};

/** Key points of a built quadruped, for extras (antlers, quills, manes). */
export type QuadFrame = {
  chest: Vec3;
  rump: Vec3;
  headPivot: Vec3;
  /** Cranium centre relative to the head pivot. */
  cranium: Vec3;
  spec: QuadSpec;
};

const GAIT_STRIDE: Record<GaitStyle, number> = {
  walk: 0.42,
  trot: 0.5,
  bound: 0.62,
  hop: 0.7,
  waddle: 0.38,
  scurry: 0.55,
  crawl: 0.5,
  wade: 0.45,
  fly: 0,
};

export function quadruped(spec: QuadSpec): Anatomy {
  const chestY = spec.legH + spec.chest[1];
  const chest: Vec3 = [0, chestY, spec.bodyLen / 2];
  const rump: Vec3 = [0, chestY + (spec.rumpLift ?? 0), -spec.bodyLen / 2];
  const neckBase: Vec3 = [
    0,
    chestY + spec.chest[1] * 0.45,
    chest[2] + spec.chest[2] * 0.55,
  ];
  const headPivot: Vec3 = [
    0,
    neckBase[1] + Math.sin(spec.neck.pitch) * spec.neck.len,
    neckBase[2] + Math.cos(spec.neck.pitch) * spec.neck.len,
  ];
  const hr = spec.head.r;
  const cranium: Vec3 = [0, hr[1] * 0.35, hr[2] * 0.45];
  const height = headPivot[1] + hr[1];
  const frame: QuadFrame = { chest, rump, headPivot, cranium, spec };

  return {
    coat: spec.coat,
    pattern: spec.pattern,
    info: {
      gait: spec.gait,
      stride: GAIT_STRIDE[spec.gait],
      footprint:
        Math.max(spec.chest[0], spec.rump[0]) * 1.3 + spec.bodyLen * 0.45,
      breathRate: 0.22 + 0.06 / Math.max(0.08, height),
      flap: 0,
      undulate: 0,
      height,
      lookRange: 0.6,
      ...spec.info,
    },
    build(b) {
      // Torso: one lofted silhouette from tail root to withers, with a
      // tucked waist for lean runners.
      b.part("body");
      const [cx, cy, cz] = spec.chest;
      const [rx, ry, rz] = spec.rump;
      const waist = spec.waist ?? 0;
      const midY = (chest[1] + rump[1]) / 2;
      const midRy = ((cy + ry) / 2) * (1 - waist * 0.22);
      b.loft([
        {
          z: rump[2] - rz * 1.0,
          y: rump[1] + ry * 0.12,
          rx: rx * 0.2,
          ry: ry * 0.2,
        },
        {
          z: rump[2] - rz * 0.75,
          y: rump[1] + ry * 0.05,
          rx: rx * 0.78,
          ry: ry * 0.8,
        },
        { z: rump[2] - rz * 0.1, y: rump[1], rx, ry },
        {
          z: (chest[2] + rump[2]) / 2,
          y: midY + (cy + ry) * 0.5 * waist * 0.12,
          rx: ((cx + rx) / 2) * (1 - waist * 0.12),
          ry: midRy,
        },
        { z: chest[2], y: chest[1], rx: cx, ry: cy },
        {
          z: chest[2] + cz * 0.6,
          y: chest[1] + cy * 0.12,
          rx: cx * 0.82,
          ry: cy * 0.85,
        },
        {
          z: chest[2] + cz * 1.0,
          y: chest[1] + cy * 0.3,
          rx: cx * 0.3,
          ry: cy * 0.32,
        },
      ]);
      b.tube(
        neckBase,
        add(headPivot, [0, -hr[1] * 0.1, -hr[2] * 0.1]),
        spec.neck.r,
        spec.neck.r * 0.72,
        "coat",
        12,
      );

      // Head.
      b.part("head", headPivot);
      const H = (v: Vec3): Vec3 => add(headPivot, v);
      b.ellipsoid(H(cranium), hr, "coat", [0, 0, 0], 18);
      const drop = spec.head.snoutDrop ?? hr[1] * 0.2;
      const snoutStart: Vec3 = [
        0,
        cranium[1] - drop * 0.5,
        cranium[2] + hr[2] * 0.55,
      ];
      const snoutEnd: Vec3 = [
        0,
        cranium[1] - drop,
        cranium[2] + hr[2] * 0.55 + spec.head.snoutLen,
      ];
      b.tube(
        H(snoutStart),
        H(snoutEnd),
        spec.head.snoutR,
        spec.head.snoutR * 0.62,
        "coat",
        12,
      );
      b.ellipsoid(
        H(add(snoutEnd, [0, spec.head.snoutR * 0.12, spec.head.snoutR * 0.4])),
        [
          spec.head.snoutR * 0.42,
          spec.head.snoutR * 0.3,
          spec.head.snoutR * 0.28,
        ],
        { color: spec.coat.dark, grain: GRAIN.smooth },
      );
      const eye = spec.head.eye ?? hr[0] * 0.16;
      for (const side of [1, -1]) {
        b.ellipsoid(
          H([
            side * hr[0] * 0.66,
            cranium[1] + hr[1] * 0.18,
            cranium[2] + hr[2] * 0.52,
          ]),
          [eye, eye, eye * 0.8],
          {
            color: "#0b0a09",
            grain: GRAIN.smooth,
            glow: spec.head.eyeshine,
            glowStrength: 0.35,
          },
          [0, 0, 0],
          10,
        );
      }
      buildEars(b, spec, H, cranium);

      // Legs: pivot inside the body; fore legs with an elbow, hind legs
      // with a hock that bends back; paws or hooves.
      const legTop = chestY - spec.chest[1] * 0.25;
      const splay = spec.splay ?? 0;
      const fx = spec.chest[0] * (0.55 + splay);
      const hx = spec.rump[0] * (0.55 + splay);
      const fz = chest[2] + spec.chest[2] * 0.15;
      const hz = rump[2] - spec.rump[2] * 0.05;
      const hindTop = rump[1] - spec.rump[1] * 0.25;
      const legs: [PartName, Vec3, boolean][] = [
        ["legFL", [fx, legTop, fz], false],
        ["legFR", [-fx, legTop, fz], false],
        ["legHL", [hx, hindTop, hz], true],
        ["legHR", [-hx, hindTop, hz], true],
      ];
      for (const [name, top, hind] of legs) {
        b.part(name, top);
        buildLeg(b, spec, top, hind);
      }

      const base: Vec3 = [
        0,
        rump[1] + spec.rump[1] * 0.35,
        rump[2] - spec.rump[2] * 0.85,
      ];
      b.part("tail", base);
      buildTail(b, spec, base);
      spec.extras?.(b, frame);
    },
  };
}

function buildEars(
  b: CreatureBuilder,
  spec: QuadSpec,
  H: (v: Vec3) => Vec3,
  cranium: Vec3,
): void {
  const { kind, len, w } = spec.ears;
  if (kind === "none") return;
  const hr = spec.head.r;
  const tilt = spec.ears.tilt ?? 0.35;
  for (const side of [1, -1]) {
    const base: Vec3 = [
      side * hr[0] * 0.5,
      cranium[1] + hr[1] * 0.72,
      cranium[2] - hr[2] * 0.15,
    ];
    const tip: Vec3 = [
      base[0] + side * Math.sin(tilt) * len,
      base[1] + Math.cos(tilt) * len,
      base[2] - len * (kind === "long" ? 0.35 : 0.12),
    ];
    if (kind === "pointed" || kind === "tufted") {
      b.cone(H(base), H(tip), w, "coat", 0.45);
      b.cone(
        H(add(base, [0, 0, w * 0.2])),
        H(add(tip, [0, -len * 0.15, w * 0.2])),
        w * 0.62,
        "belly",
        0.3,
      );
      if (kind === "tufted") {
        b.cone(
          H(tip),
          H(add(tip, [0, len * 0.4, -len * 0.05])),
          w * 0.16,
          "dark",
          1,
        );
      }
    } else if (kind === "round") {
      b.ellipsoid(
        H(add(base, [side * w * 0.2, len * 0.35, 0])),
        [w, len * 0.6, w * 0.4],
        "coat",
        [0, 0, side * -0.3],
        10,
      );
    } else {
      const mid: Vec3 = [
        (base[0] + tip[0]) / 2,
        (base[1] + tip[1]) / 2,
        (base[2] + tip[2]) / 2,
      ];
      b.ellipsoid(
        H(mid),
        [w, len * 0.55, w * 0.35],
        "coat",
        [-0.3, 0, side * -tilt],
        12,
      );
      b.ellipsoid(
        H(add(mid, [0, 0, w * 0.15])),
        [w * 0.6, len * 0.45, w * 0.2],
        "belly",
        [-0.3, 0, side * -tilt],
        10,
      );
    }
  }
}

function buildLeg(
  b: CreatureBuilder,
  spec: QuadSpec,
  top: Vec3,
  hind: boolean,
): void {
  const r = spec.legR;
  const y0 = top[1];
  const fold = hind ? (spec.hindFold ?? 0) : 0;
  const socks = spec.socks ?? 0;
  const footZ = top[2] + (hind ? fold * 0.04 : 0.01);
  const lower = (from: number): Paint => (socks >= from ? "dark" : "coat");
  // Upper limb: muscled, blends into the body.
  b.ellipsoid(
    add(top, [0, -y0 * 0.12, hind ? -r * 0.6 : 0]),
    [r * 1.9, y0 * 0.3, r * (hind ? 2.6 + fold * 2 : 2.0)],
    "coat",
    [0, 0, 0],
    12,
  );
  if (hind) {
    const knee: Vec3 = [
      top[0],
      y0 * (0.55 - fold * 0.1),
      top[2] + r * 1.4 + fold * y0 * 0.25,
    ];
    const hock: Vec3 = [top[0], y0 * 0.24, top[2] - r * 2.4 - fold * y0 * 0.35];
    b.tube(top, knee, r * 1.3, r, "coat");
    b.tube(knee, hock, r, r * 0.78, lower(0.75));
    b.tube(hock, [top[0], r * 0.6, footZ], r * 0.72, r * 0.62, lower(0.3));
  } else {
    const elbow: Vec3 = [top[0], y0 * 0.6, top[2] - r * 1.1];
    const wrist: Vec3 = [top[0], y0 * 0.2, top[2] + r * 0.2];
    b.tube(top, elbow, r * 1.15, r * 0.9, "coat");
    b.tube(elbow, wrist, r * 0.9, r * 0.7, lower(0.6));
    b.tube(wrist, [top[0], r * 0.6, footZ], r * 0.7, r * 0.62, lower(0.01));
  }
  if (spec.foot === "hoof") {
    b.tube(
      [top[0], r * 0.9, footZ],
      [top[0], 0.004, footZ + r * 0.2],
      r * 0.62,
      r * 0.75,
      { color: "#2a2520", grain: GRAIN.scale },
    );
  } else {
    b.ellipsoid(
      [top[0], r * 0.45, footZ + r * 0.55 + fold * 0.02],
      [r * 0.95, r * 0.5, r * (1.35 + fold * 1.5)],
      lower(0.01),
      [0, 0, 0],
      10,
    );
  }
}

function buildTail(b: CreatureBuilder, spec: QuadSpec, base: Vec3): void {
  const { kind, len, r, lift, tip } = spec.tail;
  const tipPaint: Paint = tip ? { color: tip } : "coat";
  if (kind === "short") {
    b.ellipsoid(
      add(base, [0, Math.sin(lift) * len * 0.4, -len * 0.4]),
      [r, r * 0.9, len * 0.55],
      tip ? tipPaint : "coat",
    );
    return;
  }
  if (kind === "thin") {
    const mid = add(base, [
      0,
      Math.sin(lift) * len * 0.5,
      -Math.cos(lift) * len * 0.5,
    ]);
    const end = add(mid, [
      0,
      Math.sin(lift - 0.5) * len * 0.5,
      -Math.cos(lift - 0.5) * len * 0.5,
    ]);
    b.tube(base, mid, r, r * 0.7, "coat");
    b.tube(mid, end, r * 0.7, r * 0.25, tipPaint);
    return;
  }
  // Bushy, plume and ringed tails: one swept brush along a curve. A plume
  // (squirrel) rises behind the back and curls forward at the top.
  const plume = kind === "plume";
  const steps = 9;
  const rings = [];
  let y = base[1];
  let z = base[2];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const swell = Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.1));
    const rr = r * (0.35 + swell * 0.9) * (i === steps ? 0.3 : 1);
    rings.push({ z, y, rx: rr * 0.9, ry: rr });
    const a = plume ? lift + t * 2.6 : lift - t * 0.6;
    const seg = len / steps;
    y += Math.sin(a) * seg;
    z -= Math.cos(a) * seg;
  }
  if (kind === "ringed") {
    for (let i = 0; i < steps; i += 1) {
      b.loft(rings.slice(i, i + 2), i % 2 === 1 ? "dark" : "coat", 4, 14);
    }
    return;
  }
  const cut = tip ? Math.round(steps * 0.68) : steps;
  b.loft(rings.slice(0, cut + 1), "coat", 20, 14);
  if (tip) b.loft(rings.slice(cut - 1), tipPaint, 10, 14);
}

// ---------------------------------------------------------------- birds --

export type BirdSpec = {
  coat: Coat;
  pattern?: PatternFn;
  gait: "wade" | "fly";
  body: Vec3;
  bodyY: number;
  /** Body pitch (radians, + head up / tail down). */
  bodyPitch: number;
  neck: { len: number; r: number; s: number };
  head: {
    r: Vec3;
    bill: { len: number; r: number; color: string; drop?: number };
    eye: number;
    eyeColor?: string;
    eyeshine?: string;
    /** Owl facial disc colour. */
    disc?: string;
    crest?: number;
    tufts?: number;
  };
  legs: { len: number; r: number; color: string };
  wings: { span: number; chord: number; color: string };
  tail: { len: number; w: number };
  glow?: { color: string; at: Vec3; r: number };
  info?: Partial<RigInfo>;
};

export function bird(spec: BirdSpec): Anatomy {
  const wading = spec.gait === "wade";
  const bodyC: Vec3 = [0, spec.bodyY, 0];
  const front: Vec3 = [
    0,
    spec.bodyY + Math.sin(spec.bodyPitch) * spec.body[2] * 0.75,
    Math.cos(spec.bodyPitch) * spec.body[2] * 0.75,
  ];
  const neckMid = add(front, [
    0,
    spec.neck.len * 0.55,
    -spec.neck.s * spec.neck.len * 0.25,
  ]);
  const headPivot = add(front, [
    0,
    spec.neck.len,
    spec.neck.s * spec.neck.len * 0.15,
  ]);
  const hr = spec.head.r;
  const height = headPivot[1] + hr[1];
  return {
    coat: spec.coat,
    pattern: spec.pattern,
    info: {
      gait: spec.gait,
      stride: wading ? 0.55 : 0,
      footprint: spec.body[0] * 1.8,
      breathRate: 0.35 + 0.05 / Math.max(0.08, height),
      flap: wading ? 0 : 1.0,
      undulate: 0,
      height,
      lookRange: spec.head.disc ? 1.2 : 0.7,
      ...spec.info,
    },
    build(b) {
      b.grain(GRAIN.feather);
      b.part("body");
      b.ellipsoid(bodyC, spec.body, "coat", [-spec.bodyPitch, 0, 0], 20);
      if (spec.neck.len > 0.01) {
        b.tube(front, neckMid, spec.neck.r * 1.25, spec.neck.r, "coat", 10);
        b.tube(neckMid, headPivot, spec.neck.r, spec.neck.r * 0.85, "coat", 10);
      }
      b.ellipsoid(
        add(bodyC, [
          0,
          -Math.sin(spec.bodyPitch) * spec.body[2] * 0.9,
          -Math.cos(spec.bodyPitch) * spec.body[2] * 0.95,
        ]),
        [spec.tail.w, spec.body[1] * 0.16, spec.tail.len],
        { color: spec.wings.color, grain: GRAIN.feather },
        [-spec.bodyPitch + 0.12, 0, 0],
        12,
      );
      if (spec.glow) {
        b.ellipsoid(
          spec.glow.at,
          [spec.glow.r, spec.glow.r * 0.6, spec.glow.r],
          {
            color: spec.coat.belly,
            glow: spec.glow.color,
            glowStrength: 0.5,
          },
        );
      }

      b.part("head", headPivot);
      const H = (v: Vec3): Vec3 => add(headPivot, v);
      b.ellipsoid(H([0, hr[1] * 0.3, hr[2] * 0.2]), hr, "coat", [0, 0, 0], 16);
      if (spec.head.disc) {
        b.ellipsoid(
          H([0, hr[1] * 0.3, hr[2] * 0.72]),
          [hr[0] * 0.92, hr[1] * 0.82, hr[2] * 0.3],
          { color: spec.head.disc, grain: GRAIN.feather },
          [0, 0, 0],
          16,
        );
      }
      const bill = spec.head.bill;
      const billDrop = bill.drop ?? 0;
      const billBase: Vec3 = [
        0,
        hr[1] * 0.2,
        hr[2] * (spec.head.disc ? 0.95 : 0.85),
      ];
      b.cone(
        H(billBase),
        H(add(billBase, [0, -billDrop, bill.len])),
        bill.r,
        { color: bill.color, grain: GRAIN.smooth },
        0.75,
        10,
      );
      for (const side of [1, -1]) {
        const eyeZ = spec.head.disc ? hr[2] * 0.9 : hr[2] * 0.55;
        const eyeX = spec.head.disc ? hr[0] * 0.38 : hr[0] * 0.72;
        b.ellipsoid(
          H([side * eyeX, hr[1] * 0.45, eyeZ]),
          [spec.head.eye, spec.head.eye, spec.head.eye * 0.6],
          {
            color: spec.head.eyeColor ?? "#0b0a09",
            grain: GRAIN.smooth,
            glow: spec.head.eyeshine,
            glowStrength: 0.45,
          },
          [0, 0, 0],
          10,
        );
        if (spec.head.tufts) {
          b.cone(
            H([side * hr[0] * 0.55, hr[1] * 0.95, hr[2] * 0.1]),
            H([
              side * hr[0] * 0.85,
              hr[1] * 0.95 + spec.head.tufts,
              -hr[2] * 0.1,
            ]),
            hr[0] * 0.22,
            "coat",
            0.4,
          );
        }
      }
      if (spec.head.crest) {
        b.cone(
          H([0, hr[1] * 0.75, -hr[2] * 0.2]),
          H([0, hr[1] * 0.55, -hr[2] - spec.head.crest]),
          hr[0] * 0.2,
          "dark",
          0.3,
        );
      }

      // Legs: wading birds walk on them; fliers keep them tucked.
      const legTop = spec.bodyY - spec.body[1] * 0.45;
      const legPaint: Paint = { color: spec.legs.color, grain: GRAIN.scale };
      for (const [name, side] of [
        ["legHL", 1],
        ["legHR", -1],
      ] as const) {
        const top: Vec3 = [side * spec.body[0] * 0.4, legTop, 0];
        b.part(name, top);
        const len = spec.legs.len;
        const knee: Vec3 = wading
          ? [top[0], top[1] - len * 0.48, top[2] - len * 0.06]
          : [top[0], top[1] - len * 0.4, top[2] - len * 0.35];
        const foot: Vec3 = wading
          ? [top[0], 0.012, top[2] + 0.01]
          : [top[0], top[1] - len * 0.6, top[2] - len * 0.75];
        b.tube(top, knee, spec.legs.r * 1.3, spec.legs.r, legPaint, 8);
        b.tube(knee, foot, spec.legs.r, spec.legs.r * 0.85, legPaint, 8);
        for (const toe of [-0.55, 0, 0.55]) {
          b.tube(
            foot,
            add(foot, [
              Math.sin(toe) * len * 0.13,
              0,
              Math.cos(toe) * len * 0.15 * (wading ? 1 : -1),
            ]),
            spec.legs.r * 0.5,
            spec.legs.r * 0.3,
            legPaint,
            6,
          );
        }
      }

      const span = spec.wings.span;
      const chord = spec.wings.chord;
      for (const [name, side] of [
        ["wingL", 1],
        ["wingR", -1],
      ] as const) {
        const shoulder: Vec3 = [
          side * spec.body[0] * 0.7,
          spec.bodyY + spec.body[1] * 0.35,
          spec.body[2] * 0.3,
        ];
        b.part(name, shoulder, !wading);
        if (wading) {
          // Folded along the flank.
          b.ellipsoid(
            add(shoulder, [
              -side * spec.body[0] * 0.12,
              -spec.body[1] * 0.3,
              -spec.body[2] * 0.5,
            ]),
            [spec.body[0] * 0.38, spec.body[1] * 0.62, spec.body[2] * 0.95],
            { color: spec.wings.color, grain: GRAIN.feather },
            [-spec.bodyPitch, 0, 0],
            14,
          );
        } else {
          const outline: [number, number][] = [
            [0, 0.02],
            [span * 0.45, 0.012],
            [span * 0.85, -chord * 0.12],
            [span, -chord * 0.42],
            [span * 0.82, -chord * 0.72],
            [span * 0.5, -chord * 0.9],
            [span * 0.18, -chord],
            [0, -chord * 0.8],
          ];
          b.membrane(shoulder, outline, [side, 0, 0], [0, 0, 1], {
            color: spec.wings.color,
            grain: GRAIN.feather,
            pattern: true,
          });
          b.tube(
            shoulder,
            add(shoulder, [side * span * 0.6, 0, 0.004]),
            chord * 0.09,
            chord * 0.04,
            { color: spec.wings.color, grain: GRAIN.feather },
            8,
          );
        }
      }
    },
  };
}

// ------------------------------------------------------------------ bat --

export type BatSpec = {
  coat: Coat;
  membrane: string;
  glow: string;
  body: Vec3;
  span: number;
};

export function bat(spec: BatSpec): Anatomy {
  const y = spec.body[1] * 2.4;
  const hr = spec.body[0] * 0.78;
  return {
    coat: spec.coat,
    info: {
      gait: "fly",
      stride: 0,
      footprint: spec.span * 0.5,
      breathRate: 1.1,
      flap: 1.2,
      undulate: 0,
      height: y,
      lookRange: 0.5,
    },
    build(b) {
      b.part("body");
      b.ellipsoid([0, y, 0], spec.body, "coat");
      const neck: Vec3 = [0, y + spec.body[1] * 0.3, spec.body[2] * 0.8];
      b.part("head", neck);
      const h = add(neck, [0, spec.body[1] * 0.15, hr * 0.6]);
      b.ellipsoid(h, [hr, hr * 0.9, hr * 1.05], "coat");
      b.ellipsoid(
        add(h, [0, -hr * 0.2, hr * 0.85]),
        [hr * 0.45, hr * 0.38, hr * 0.5],
        "dark",
      );
      for (const side of [1, -1]) {
        b.cone(
          add(h, [side * hr * 0.5, hr * 0.5, -hr * 0.1]),
          add(h, [side * hr * 1.05, hr * 2.0, -hr * 0.35]),
          hr * 0.42,
          "dark",
          0.35,
        );
        b.ellipsoid(
          add(h, [side * hr * 0.45, hr * 0.15, hr * 0.8]),
          [hr * 0.12, hr * 0.12, hr * 0.08],
          {
            color: "#090807",
            grain: GRAIN.smooth,
            glow: spec.glow,
            glowStrength: 0.4,
          },
          [0, 0, 0],
          8,
        );
      }
      const s = spec.span;
      for (const [name, side] of [
        ["wingL", 1],
        ["wingR", -1],
      ] as const) {
        const shoulder: Vec3 = [
          side * spec.body[0] * 0.6,
          y + spec.body[1] * 0.4,
          spec.body[2] * 0.35,
        ];
        b.part(name, shoulder, true);
        const outline: [number, number][] = [
          [0, 0.03],
          [s * 0.35, 0.06],
          [s * 0.62, 0.02],
          [s, -0.02],
          [s * 0.86, -s * 0.18],
          [s * 0.7, -s * 0.13],
          [s * 0.58, -s * 0.32],
          [s * 0.42, -s * 0.22],
          [s * 0.22, -s * 0.4],
          [0, -spec.body[2] * 1.6],
        ];
        b.membrane(shoulder, outline, [side, 0, 0], [0, 0, 1], {
          color: spec.membrane,
          grain: GRAIN.smooth,
          glow: spec.glow,
          glowStrength: 0.07,
        });
        const wrist = add(shoulder, [side * s * 0.33, 0.004, 0.05]);
        b.tube(shoulder, wrist, 0.014, 0.01, "dark", 6);
        for (const [fx, fz] of [
          [s, -0.02],
          [s * 0.7, -s * 0.13],
          [s * 0.42, -s * 0.22],
        ] as const) {
          b.tube(
            wrist,
            add(shoulder, [side * fx, 0.004, fz]),
            0.008,
            0.004,
            "dark",
            5,
          );
        }
      }
      for (const [name, side] of [
        ["legHL", 1],
        ["legHR", -1],
      ] as const) {
        const top: Vec3 = [
          side * spec.body[0] * 0.4,
          y - spec.body[1] * 0.6,
          -spec.body[2] * 0.6,
        ];
        b.part(name, top);
        b.tube(
          top,
          add(top, [side * 0.02, -0.05, -0.04]),
          0.012,
          0.008,
          "dark",
          5,
        );
      }
    },
  };
}

// ----------------------------------------------------------------- moth --

export type MothSpec = {
  coat: Coat;
  wing: string;
  hindWing: string;
  glow: string;
  span: number;
  pattern?: PatternFn;
};

export function moth(spec: MothSpec): Anatomy {
  const y = 0.22;
  const s = spec.span;
  return {
    coat: spec.coat,
    pattern: spec.pattern,
    info: {
      gait: "fly",
      stride: 0,
      footprint: s * 0.5,
      breathRate: 0.9,
      flap: 0.95,
      undulate: 0,
      height: y,
      lookRange: 0.2,
    },
    build(b) {
      b.part("body");
      b.ellipsoid([0, y, 0.03], [0.05, 0.05, 0.065], "coat");
      b.ellipsoid([0, y - 0.01, -0.09], [0.04, 0.038, 0.1], "coat");
      // The lantern: a warm glow through the abdomen's down.
      b.ellipsoid([0, y - 0.022, -0.13], [0.03, 0.022, 0.06], {
        color: spec.coat.belly,
        glow: spec.glow,
        glowStrength: 0.85,
      });
      b.part("head", [0, y, 0.09]);
      b.ellipsoid([0, y + 0.005, 0.11], [0.035, 0.032, 0.03], "coat");
      for (const side of [1, -1]) {
        b.ellipsoid([side * 0.024, y + 0.01, 0.125], [0.014, 0.016, 0.012], {
          color: "#100d0c",
          grain: GRAIN.smooth,
        });
        b.cone(
          [side * 0.012, y + 0.03, 0.12],
          [side * 0.07, y + 0.1, 0.19],
          0.018,
          "dark",
          0.25,
          6,
        );
      }
      for (const [name, side] of [
        ["wingL", 1],
        ["wingR", -1],
      ] as const) {
        const root: Vec3 = [side * 0.035, y + 0.02, 0.04];
        b.part(name, root, true);
        b.membrane(
          root,
          [
            [0, 0.03],
            [s * 0.55, 0.06],
            [s, 0.0],
            [s * 0.92, -s * 0.38],
            [s * 0.45, -s * 0.42],
            [0, -0.06],
          ],
          [side, 0, 0],
          [0, 0, 1],
          { color: spec.wing, grain: GRAIN.feather, pattern: true },
        );
      }
      for (const [name, side] of [
        ["wing2L", 1],
        ["wing2R", -1],
      ] as const) {
        const root: Vec3 = [side * 0.03, y + 0.012, -0.03];
        b.part(name, root, true);
        b.membrane(
          root,
          [
            [0, 0.0],
            [s * 0.6, -0.02],
            [s * 0.7, -s * 0.3],
            [s * 0.3, -s * 0.42],
            [0, -0.1],
          ],
          [side, 0, 0],
          [0, 0, 1],
          { color: spec.hindWing, grain: GRAIN.feather },
        );
      }
    },
  };
}

// ------------------------------------------------------------- tortoise --

export type TortoiseSpec = {
  coat: Coat;
  shell: string;
  seam: string;
  glow: string;
};

export function tortoise(spec: TortoiseSpec): Anatomy {
  const shellY = 0.12;
  const pattern: PatternFn = (p, n, part) => {
    if (part !== "body" || p.y < shellY - 0.02) return null;
    // Scutes: a staggered cell grid seen from above; seams glow faintly.
    const row = Math.round(p.z * 16);
    const col = p.x * 14 + (Math.abs(row) % 2) * 0.5;
    const edge = Math.max(
      Math.abs(p.z * 16 - row),
      Math.abs(col - Math.round(col)),
    );
    if (edge > 0.43 && n.y > 0.2) {
      return {
        color: spec.seam,
        mix: 0.8,
        glow: spec.glow,
        glowStrength: 0.09,
      };
    }
    return { color: spec.shell, mix: 0.85 };
  };
  return {
    coat: spec.coat,
    pattern,
    info: {
      gait: "crawl",
      stride: 0.35,
      footprint: 0.32,
      breathRate: 0.18,
      flap: 0,
      undulate: 0,
      height: 0.27,
      lookRange: 0.5,
    },
    build(b) {
      b.part("body").grain(GRAIN.scale);
      b.ellipsoid([0, shellY, 0], [0.2, 0.15, 0.25], "coat", [0, 0, 0], 28);
      b.ellipsoid(
        [0, 0.085, 0],
        [0.205, 0.05, 0.255],
        { color: spec.coat.belly, grain: GRAIN.scale },
        [0, 0, 0],
        20,
      );
      b.part("head", [0, 0.1, 0.22]);
      b.tube([0, 0.09, 0.2], [0, 0.12, 0.3], 0.045, 0.038, "coat");
      b.ellipsoid([0, 0.13, 0.33], [0.045, 0.04, 0.06], "coat");
      for (const side of [1, -1]) {
        b.ellipsoid(
          [side * 0.03, 0.145, 0.36],
          [0.008, 0.008, 0.006],
          { color: "#0a0908", grain: GRAIN.smooth },
          [0, 0, 0],
          8,
        );
      }
      const legs = [
        ["legFL", 0.15, 0.14],
        ["legFR", -0.15, 0.14],
        ["legHL", 0.14, -0.15],
        ["legHR", -0.14, -0.15],
      ] as const;
      for (const [name, x, z] of legs) {
        b.part(name, [x, 0.09, z]);
        b.tube([x, 0.09, z], [x * 1.25, 0.025, z * 1.1], 0.045, 0.04, "coat");
        b.ellipsoid(
          [x * 1.25, 0.018, z * 1.1 + 0.01],
          [0.045, 0.02, 0.05],
          "dark",
        );
      }
      b.part("tail", [0, 0.08, -0.24]);
      b.cone([0, 0.08, -0.24], [0, 0.05, -0.31], 0.022, "coat");
    },
  };
}

// ----------------------------------------------------------------- newt --

export type NewtSpec = { coat: Coat; spots: string; glow: string };

export function newt(spec: NewtSpec): Anatomy {
  const y = 0.05;
  const pattern: PatternFn = (p, n) => {
    // Ember belly and glowing flank spots.
    if (n.y < -0.3) return { color: spec.spots, mix: 0.85 };
    const cell = Math.sin(p.z * 70) * Math.sin(p.x * 90 + 1.3);
    if (n.y > -0.2 && n.y < 0.6 && cell > 0.7) {
      return {
        color: spec.spots,
        mix: 0.9,
        glow: spec.glow,
        glowStrength: 0.5,
      };
    }
    return null;
  };
  return {
    coat: spec.coat,
    pattern,
    info: {
      gait: "crawl",
      stride: 0.6,
      footprint: 0.16,
      breathRate: 0.6,
      flap: 0,
      undulate: 0.22,
      height: 0.1,
      lookRange: 0.4,
    },
    build(b) {
      b.part("body").grain(GRAIN.smooth);
      b.loft([
        { z: -0.14, y, rx: 0.026, ry: 0.024 },
        { z: -0.08, y, rx: 0.036, ry: 0.03 },
        { z: 0.02, y: y + 0.003, rx: 0.042, ry: 0.032 },
        { z: 0.1, y: y + 0.002, rx: 0.036, ry: 0.028 },
        { z: 0.15, y: y + 0.004, rx: 0.02, ry: 0.018 },
      ]);
      b.part("head", [0, y + 0.005, 0.14]);
      b.ellipsoid(
        [0, y + 0.005, 0.18],
        [0.04, 0.022, 0.05],
        "coat",
        [0, 0, 0],
        14,
      );
      for (const side of [1, -1]) {
        b.ellipsoid(
          [side * 0.025, y + 0.02, 0.19],
          [0.009, 0.009, 0.008],
          { color: "#0a0807", grain: GRAIN.smooth },
          [0, 0, 0],
          8,
        );
      }
      const legs = [
        ["legFL", 0.04, 0.09],
        ["legFR", -0.04, 0.09],
        ["legHL", 0.035, -0.07],
        ["legHR", -0.035, -0.07],
      ] as const;
      for (const [name, x, z] of legs) {
        b.part(name, [x, y, z]);
        const elbow: Vec3 = [x * 2.0, y + 0.012, z];
        b.tube([x, y, z], elbow, 0.011, 0.009, "coat", 6);
        b.tube(elbow, [x * 2.3, 0.006, z + 0.015], 0.009, 0.007, "coat", 6);
        b.ellipsoid(
          [x * 2.35, 0.005, z + 0.022],
          [0.012, 0.004, 0.012],
          "coat",
          [0, 0, 0],
          6,
        );
      }
      b.part("tail", [0, y, -0.13]);
      b.loft([
        { z: -0.12, y, rx: 0.024, ry: 0.024 },
        { z: -0.2, y: y - 0.004, rx: 0.016, ry: 0.024 },
        { z: -0.29, y: y - 0.008, rx: 0.01, ry: 0.018 },
        { z: -0.36, y: y - 0.01, rx: 0.004, ry: 0.006 },
      ]);
    },
  };
}
