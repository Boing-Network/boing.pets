/**
 * Low-poly plant and rock shapes. Each kind is one merged geometry so a whole
 * species of plant draws in a single instanced call. Vertex attributes:
 * `color` (tinted per instance), `aSway` (how much the wind moves the vertex)
 * and `aGlow` (how strongly it emits its own color).
 */
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FloraKind } from "./flora-placement";
import { hash01 } from "./noise";

export type PartOptions = {
  color: string;
  at?: [number, number, number];
  scale?: [number, number, number] | number;
  rotate?: [number, number, number];
  glow?: number;
  /** Wind response as a function of the finished vertex height. */
  sway?: (y: number) => number;
  /** Vertical shading: color is multiplied from `shade[0]` at the lowest vertex to `shade[1]` at the highest. */
  shade?: [number, number];
  upNormals?: boolean;
};

const scratchColor = new Color();

export function part(
  source: BufferGeometry,
  options: PartOptions,
): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  source.dispose();
  const scale =
    typeof options.scale === "number"
      ? new Vector3(options.scale, options.scale, options.scale)
      : new Vector3(...(options.scale ?? [1, 1, 1]));
  const matrix = new Matrix4().compose(
    new Vector3(...(options.at ?? [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...(options.rotate ?? [0, 0, 0]))),
    scale,
  );
  geometry.applyMatrix4(matrix);
  geometry.deleteAttribute("uv");

  const position = geometry.getAttribute("position");
  const count = position.count;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i += 1) {
    minY = Math.min(minY, position.getY(i));
    maxY = Math.max(maxY, position.getY(i));
  }
  const colors = new Float32Array(count * 3);
  const sway = new Float32Array(count);
  const glow = new Float32Array(count);
  scratchColor.set(options.color);
  const [lo, hi] = options.shade ?? [1, 1];
  for (let i = 0; i < count; i += 1) {
    const y = position.getY(i);
    const t = maxY > minY ? (y - minY) / (maxY - minY) : 1;
    const k = lo + (hi - lo) * t;
    colors[i * 3] = scratchColor.r * k;
    colors[i * 3 + 1] = scratchColor.g * k;
    colors[i * 3 + 2] = scratchColor.b * k;
    sway[i] = options.sway ? options.sway(y) : 0;
    glow[i] = options.glow ?? 0;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("aSway", new BufferAttribute(sway, 1));
  geometry.setAttribute("aGlow", new BufferAttribute(glow, 1));
  if (options.upNormals) {
    const normal = geometry.getAttribute("normal");
    for (let i = 0; i < count; i += 1) normal.setXYZ(i, 0, 1, 0);
  }
  return geometry;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error("flora geometry merge failed");
  merged.computeBoundingSphere();
  return merged;
}

/** A tapered blade standing at `at`, leaning toward `lean`. */
function blade(
  height: number,
  width: number,
  yaw: number,
  lean: number,
  at: [number, number, number],
): BufferGeometry {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const point = (side: number, y: number, forward: number) => [
    at[0] + cos * side - sin * forward,
    at[1] + y,
    at[2] + sin * side + cos * forward,
  ];
  const a = point(-width, 0, 0);
  const b = point(width, 0, 0);
  const c = point(-width * 0.6, height * 0.55, lean * 0.4);
  const d = point(width * 0.6, height * 0.55, lean * 0.4);
  const e = point(0, height, lean);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([...a, ...b, ...c, ...b, ...d, ...c, ...c, ...d, ...e]),
      3,
    ),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array(27).fill(0), 3),
  );
  return geometry;
}

const canopySway = (top: number) => (y: number) => {
  const t = Math.max(0, y / top);
  return t * t * 0.16;
};

function broadleaf(): BufferGeometry {
  const sway = canopySway(5.4);
  return merge([
    part(new CylinderGeometry(0.16, 0.32, 2.8, 5), {
      color: "#4a3a30",
      at: [0, 1.4, 0],
      sway,
    }),
    part(new IcosahedronGeometry(1.55, 0), {
      color: "#ffffff",
      at: [0, 3.7, 0],
      scale: [1.15, 0.9, 1.15],
      shade: [0.55, 1],
      sway,
    }),
    part(new IcosahedronGeometry(1.05, 0), {
      color: "#e6e6e6",
      at: [1.0, 3.1, 0.35],
      shade: [0.55, 1],
      sway,
    }),
    part(new IcosahedronGeometry(1.1, 0), {
      color: "#d4d4d4",
      at: [-0.9, 3.3, -0.45],
      rotate: [0.4, 1.1, 0],
      shade: [0.55, 1],
      sway,
    }),
    part(new IcosahedronGeometry(1.0, 0), {
      color: "#f2f2f2",
      at: [0.1, 4.7, -0.2],
      rotate: [0, 0.7, 0.3],
      shade: [0.6, 1],
      sway,
    }),
  ]);
}

function pine(): BufferGeometry {
  const sway = canopySway(7.3);
  const tier = (radius: number, height: number, y: number, tone: string) =>
    part(new ConeGeometry(radius, height, 7), {
      color: tone,
      at: [0, y, 0],
      rotate: [0, y, 0],
      shade: [0.5, 1],
      sway,
    });
  return merge([
    part(new CylinderGeometry(0.12, 0.28, 2.2, 5), {
      color: "#40342c",
      at: [0, 1.1, 0],
      sway,
    }),
    tier(1.55, 2.6, 2.7, "#c8c8c8"),
    tier(1.2, 2.3, 4.2, "#dcdcdc"),
    tier(0.85, 2.0, 5.6, "#eeeeee"),
    tier(0.5, 1.5, 6.7, "#ffffff"),
  ]);
}

function lanternTree(): BufferGeometry {
  const sway = canopySway(8.6);
  const parts = [
    part(new CylinderGeometry(0.24, 0.55, 4.8, 6), {
      color: "#3a343c",
      at: [0, 2.4, 0],
      sway,
    }),
    part(new IcosahedronGeometry(2.3, 0), {
      color: "#ffffff",
      at: [0, 6.1, 0],
      scale: [1.3, 0.72, 1.3],
      shade: [0.45, 1],
      sway,
    }),
    part(new IcosahedronGeometry(1.5, 0), {
      color: "#dedede",
      at: [1.7, 5.5, 0.6],
      shade: [0.45, 1],
      sway,
    }),
    part(new IcosahedronGeometry(1.6, 0), {
      color: "#cfcfcf",
      at: [-1.6, 5.7, -0.5],
      rotate: [0.3, 0.9, 0],
      shade: [0.45, 1],
      sway,
    }),
    part(new IcosahedronGeometry(1.45, 0), {
      color: "#f0f0f0",
      at: [0, 7.3, 0],
      rotate: [0, 0.5, 0.2],
      shade: [0.5, 1],
      sway,
    }),
  ];
  // Lantern fruit hanging under the canopy.
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.4;
    const reach = 1.3 + (i % 3) * 0.45;
    parts.push(
      part(new OctahedronGeometry(0.2, 0), {
        color: "#ffd27a",
        at: [
          Math.cos(angle) * reach,
          4.5 + (i % 2) * 0.35,
          Math.sin(angle) * reach,
        ],
        scale: [1, 1.5, 1],
        glow: 1,
        sway,
      }),
    );
  }
  return merge(parts);
}

function deadTree(): BufferGeometry {
  const limb = (
    length: number,
    y: number,
    rotate: [number, number, number],
    at: [number, number],
  ) =>
    part(new CylinderGeometry(0.035, 0.085, length, 4), {
      color: "#d8d2c4",
      at: [at[0], y, at[1]],
      rotate,
    });
  return merge([
    part(new CylinderGeometry(0.07, 0.27, 4.4, 5), {
      color: "#c8c0b0",
      at: [0, 2.2, 0],
      shade: [0.6, 1],
    }),
    limb(1.7, 3.0, [0, 0, 0.95], [-0.62, 0]),
    limb(1.4, 3.6, [0, 0, -0.85], [0.5, 0]),
    limb(1.2, 2.5, [0.9, 0, 0], [0, 0.45]),
    limb(0.9, 3.9, [-0.8, 0, 0.2], [0, -0.3]),
  ]);
}

function bush(): BufferGeometry {
  const sway = (y: number) => y * 0.05;
  return merge([
    part(new IcosahedronGeometry(0.6, 0), {
      color: "#ffffff",
      at: [0, 0.42, 0],
      shade: [0.5, 1],
      sway,
    }),
    part(new IcosahedronGeometry(0.42, 0), {
      color: "#dcdcdc",
      at: [0.48, 0.3, 0.1],
      rotate: [0.5, 0.3, 0],
      shade: [0.5, 1],
      sway,
    }),
    part(new IcosahedronGeometry(0.45, 0), {
      color: "#ececec",
      at: [-0.38, 0.32, -0.22],
      rotate: [0, 0.8, 0.4],
      shade: [0.5, 1],
      sway,
    }),
  ]);
}

function rock(): BufferGeometry {
  const geometry = new DodecahedronGeometry(0.8, 0).toNonIndexed();
  const position = geometry.getAttribute("position");
  // Knock the corners about so no two faces match. Coincident vertices get
  // the same nudge because the nudge is a hash of where they are.
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const k =
      Math.round(x * 97) + Math.round(y * 89) * 31 + Math.round(z * 83) * 17;
    const push = 0.78 + hash01(k, 3) * 0.44;
    position.setXYZ(i, x * push * 1.2, y * push * 0.72, z * push);
  }
  geometry.computeVertexNormals();
  return merge([
    part(geometry, { color: "#ffffff", at: [0, 0.3, 0], shade: [0.6, 1] }),
  ]);
}

function stone(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.3, 0.5, 2.9, 5), {
      color: "#ffffff",
      at: [0, 1.45, 0],
      scale: [1, 1, 0.55],
      shade: [0.55, 1],
    }),
  ]);
}

function grass(): BufferGeometry {
  const sway = (y: number) => Math.pow(Math.max(0, y) / 0.75, 1.5) * 0.16;
  const options: PartOptions = {
    color: "#ffffff",
    shade: [0.45, 1.05],
    sway,
    upNormals: true,
  };
  return merge([
    part(blade(0.78, 0.07, 0.2, 0.22, [0, 0, 0]), options),
    part(blade(0.6, 0.065, 2.3, 0.2, [0.1, 0, 0.06]), options),
    part(blade(0.68, 0.06, 4.4, 0.26, [-0.08, 0, 0.05]), options),
    part(blade(0.5, 0.06, 5.5, 0.18, [0.02, 0, -0.1]), options),
  ]);
}

function flower(): BufferGeometry {
  const sway = (y: number) => y * 0.22;
  return merge([
    part(blade(0.42, 0.018, 0.4, 0.04, [0, 0, 0]), {
      color: "#2a3a2a",
      sway,
      upNormals: true,
    }),
    part(new OctahedronGeometry(0.11, 0), {
      color: "#ffffff",
      at: [0, 0.44, 0.04],
      scale: [1.5, 0.7, 1.5],
      glow: 1,
      sway,
    }),
  ]);
}

function mushroom(): BufferGeometry {
  const one = (x: number, z: number, size: number) => [
    part(new CylinderGeometry(0.045, 0.07, 0.3, 5), {
      color: "#d8d0c0",
      at: [x, 0.15 * size, z],
      scale: size,
      glow: 0.12,
    }),
    part(new SphereGeometry(0.22, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), {
      color: "#ffffff",
      at: [x, 0.27 * size, z],
      scale: [size, size * 0.8, size],
      glow: 1,
    }),
  ];
  return merge([
    ...one(0, 0, 1),
    ...one(0.24, 0.1, 0.6),
    ...one(-0.1, 0.22, 0.45),
  ]);
}

function crystal(): BufferGeometry {
  const shard = (
    at: [number, number, number],
    size: number,
    rotate: [number, number, number],
  ) =>
    part(new OctahedronGeometry(0.3, 0), {
      color: "#ffffff",
      at,
      scale: [size, size * 3, size],
      rotate,
      glow: 0.85,
      shade: [0.55, 1],
    });
  return merge([
    shard([0, 0.75, 0], 1, [0, 0.3, 0]),
    shard([0.32, 0.45, 0.1], 0.7, [0.1, 0, -0.45]),
    shard([-0.27, 0.4, -0.15], 0.6, [-0.2, 0, 0.5]),
  ]);
}

function reed(): BufferGeometry {
  const sway = (y: number) => Math.pow(Math.max(0, y) / 1.8, 1.4) * 0.3;
  const stalk = (
    x: number,
    z: number,
    height: number,
    yaw: number,
    lean: number,
    lit: boolean,
  ) => {
    const parts = [
      part(blade(height, 0.035, yaw, lean, [x, 0, z]), {
        color: "#4f8f6a",
        shade: [0.5, 1.1],
        sway,
        upNormals: true,
      }),
    ];
    if (lit) {
      parts.push(
        part(new OctahedronGeometry(0.05, 0), {
          color: "#5ef2d6",
          at: [x - Math.sin(yaw) * lean, height, z + Math.cos(yaw) * lean],
          scale: [1, 3.2, 1],
          glow: 1,
          sway,
        }),
      );
    }
    return parts;
  };
  return merge([
    ...stalk(0, 0, 1.8, 0.3, 0.16, true),
    ...stalk(0.14, 0.05, 1.45, 1.9, 0.2, false),
    ...stalk(-0.1, 0.12, 1.6, 3.7, 0.14, true),
    ...stalk(0.03, -0.14, 1.2, 5.2, 0.22, false),
    ...stalk(-0.16, -0.06, 1.35, 2.6, 0.12, false),
  ]);
}

function lily(): BufferGeometry {
  return merge([
    part(new CircleGeometry(0.44, 7, 0.35, Math.PI * 2 - 0.7), {
      color: "#3f8a56",
      rotate: [-Math.PI / 2, 0, 0],
      upNormals: true,
    }),
    part(new OctahedronGeometry(0.09, 0), {
      color: "#ffffff",
      at: [0.05, 0.07, 0.02],
      scale: [1.3, 0.8, 1.3],
      glow: 1,
    }),
  ]);
}

const BUILDERS: Record<FloraKind, () => BufferGeometry> = {
  broadleaf,
  pine,
  lanternTree,
  deadTree,
  bush,
  rock,
  stone,
  grass,
  flower,
  mushroom,
  crystal,
  reed,
  lily,
};

export function buildFloraGeometry(kind: FloraKind): BufferGeometry {
  return BUILDERS[kind]();
}
