/**
 * Stylize StreetBody into a clearly cartoon, streetwear-proportioned mesh.
 *
 * Reads public/characters/street-body.source.glb, subdivides and rounds the
 * boxy body segments, then applies a bold bind-pose proportion / expression
 * pass and writes public/characters/street-body.glb.
 *
 * Skeleton (20 named joints), skin weights, +Z facing, and y=0 feet are kept.
 *
 * Usage: node scripts/stylize-street-body.mjs
 */
import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "public", "characters", "street-body.source.glb");
const outPath = join(root, "public", "characters", "street-body.glb");
const shippedPath = outPath;

const COMP = {
  5120: { fmt: "i8", size: 1 },
  5121: { fmt: "u8", size: 1 },
  5122: { fmt: "i16", size: 2 },
  5123: { fmt: "u16", size: 2 },
  5125: { fmt: "u32", size: 4 },
  5126: { fmt: "f32", size: 4 },
};
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

const SUBDIVIDE = new Set([
  "Pelvis",
  "Belly",
  "Chest",
  "Neck",
  "Skull",
  "UpperArm_L",
  "UpperArm_R",
  "Forearm_L",
  "Forearm_R",
  "Thigh_L",
  "Thigh_R",
  "Shin_L",
  "Shin_R",
  "Foot_L",
  "Foot_R",
  "Thumb_L",
  "Thumb_R",
  "Finger_L_0",
  "Finger_L_1",
  "Finger_L_2",
  "Finger_R_0",
  "Finger_R_1",
  "Finger_R_2",
]);

function loadGlb(path) {
  const data = readFileSync(path);
  const length = data.readUInt32LE(8);
  let off = 12;
  let js = null;
  let bin = Buffer.alloc(0);
  while (off + 8 <= length) {
    const clen = data.readUInt32LE(off);
    const ctype = data.toString("utf8", off + 4, off + 8);
    const chunk = data.subarray(off + 8, off + 8 + clen);
    off += 8 + clen;
    if (ctype.startsWith("JSON")) js = JSON.parse(chunk.toString("utf8"));
    else if (ctype.startsWith("BIN")) bin = Buffer.from(chunk);
  }
  return { js, bin };
}

function writeGlb(path, js, bin) {
  let raw = Buffer.from(JSON.stringify(js), "utf8");
  const padJ = (4 - (raw.length % 4)) % 4;
  if (padJ) raw = Buffer.concat([raw, Buffer.alloc(padJ, 0x20)]);
  const padB = (4 - (bin.length % 4)) % 4;
  const binP = padB ? Buffer.concat([bin, Buffer.alloc(padB, 0)]) : bin;
  const length = 12 + 8 + raw.length + 8 + binP.length;
  const out = Buffer.alloc(length);
  out.write("glTF", 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(length, 8);
  out.writeUInt32LE(raw.length, 12);
  out.write("JSON", 16);
  raw.copy(out, 20);
  const boff = 20 + raw.length;
  out.writeUInt32LE(binP.length, boff);
  out.write("BIN\0", boff + 4);
  binP.copy(out, boff + 8);
  writeFileSync(path, out);
}

function accessorInfo(js, accIdx) {
  const acc = js.accessors[accIdx];
  const view = js.bufferViews[acc.bufferView];
  const comp = COMP[acc.componentType];
  const ncomp = NCOMP[acc.type];
  const off = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = view.byteStride || comp.size * ncomp;
  return { acc, view, comp, ncomp, off, stride };
}

function readArray(js, bin, accIdx) {
  const {
    acc: a,
    comp: c,
    ncomp: nc,
    off: o,
    stride: s,
  } = accessorInfo(js, accIdx);
  const rows = [];
  for (let i = 0; i < a.count; i++) {
    const at = o + i * s;
    const row = [];
    for (let k = 0; k < nc; k++) {
      const p = at + k * c.size;
      if (c.fmt === "f32") row.push(bin.readFloatLE(p));
      else if (c.fmt === "u16") row.push(bin.readUInt16LE(p));
      else if (c.fmt === "u32") row.push(bin.readUInt32LE(p));
      else if (c.fmt === "u8") row.push(bin[p]);
      else if (c.fmt === "i16") row.push(bin.readInt16LE(p));
      else throw new Error("unsupported " + c.fmt);
    }
    rows.push(row);
  }
  return { rows, type: a.type, componentType: a.componentType };
}

function matMul(a, b) {
  const o = new Float64Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function trsMat(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  const xx = x * x,
    yy = y * y,
    zz = z * z,
    xy = x * y,
    xz = x * z,
    yz = y * z,
    wx = w * x,
    wy = w * y,
    wz = w * z;
  return new Float64Array([
    (1 - 2 * (yy + zz)) * s[0],
    2 * (xy + wz) * s[0],
    2 * (xz - wy) * s[0],
    0,
    2 * (xy - wz) * s[1],
    (1 - 2 * (xx + zz)) * s[1],
    2 * (yz + wx) * s[1],
    0,
    2 * (xz + wy) * s[2],
    2 * (yz - wx) * s[2],
    (1 - 2 * (xx + yy)) * s[2],
    0,
    t[0],
    t[1],
    t[2],
    1,
  ]);
}

function invertMat(m) {
  const out = new Float64Array(16);
  const n11 = m[0],
    n21 = m[1],
    n31 = m[2],
    n41 = m[3];
  const n12 = m[4],
    n22 = m[5],
    n32 = m[6],
    n42 = m[7];
  const n13 = m[8],
    n23 = m[9],
    n33 = m[10],
    n43 = m[11];
  const n14 = m[12],
    n24 = m[13],
    n34 = m[14],
    n44 = m[15];
  const t11 =
    n23 * n34 * n42 -
    n24 * n33 * n42 +
    n24 * n32 * n43 -
    n22 * n34 * n43 -
    n23 * n32 * n44 +
    n22 * n33 * n44;
  const t12 =
    n14 * n33 * n42 -
    n13 * n34 * n42 -
    n14 * n32 * n43 +
    n12 * n34 * n43 +
    n13 * n32 * n44 -
    n12 * n33 * n44;
  const t13 =
    n13 * n24 * n42 -
    n14 * n23 * n42 +
    n14 * n22 * n43 -
    n12 * n24 * n43 -
    n13 * n22 * n44 +
    n12 * n23 * n44;
  const t14 =
    n14 * n23 * n32 -
    n13 * n24 * n32 -
    n14 * n22 * n33 +
    n12 * n24 * n33 +
    n13 * n22 * n34 -
    n12 * n23 * n34;
  const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  if (Math.abs(det) < 1e-12) throw new Error("singular node matrix");
  const invDet = 1 / det;
  out[0] = t11 * invDet;
  out[1] =
    (n24 * n33 * n41 -
      n23 * n34 * n41 -
      n24 * n31 * n43 +
      n21 * n34 * n43 +
      n23 * n31 * n44 -
      n21 * n33 * n44) *
    invDet;
  out[2] =
    (n22 * n34 * n41 -
      n24 * n32 * n41 +
      n24 * n31 * n42 -
      n21 * n34 * n42 -
      n22 * n31 * n44 +
      n21 * n32 * n44) *
    invDet;
  out[3] =
    (n23 * n32 * n41 -
      n22 * n33 * n41 -
      n23 * n31 * n42 +
      n21 * n33 * n42 +
      n22 * n31 * n43 -
      n21 * n32 * n43) *
    invDet;
  out[4] = t12 * invDet;
  out[5] =
    (n13 * n34 * n41 -
      n14 * n33 * n41 +
      n14 * n31 * n43 -
      n11 * n34 * n43 -
      n13 * n31 * n44 +
      n11 * n33 * n44) *
    invDet;
  out[6] =
    (n14 * n32 * n41 -
      n12 * n34 * n41 -
      n14 * n31 * n42 +
      n11 * n34 * n42 +
      n12 * n31 * n44 -
      n11 * n32 * n44) *
    invDet;
  out[7] =
    (n12 * n33 * n41 -
      n13 * n32 * n41 +
      n13 * n31 * n42 -
      n11 * n33 * n42 -
      n12 * n31 * n43 +
      n11 * n32 * n43) *
    invDet;
  out[8] = t13 * invDet;
  out[9] =
    (n14 * n23 * n41 -
      n13 * n24 * n41 -
      n14 * n21 * n43 +
      n11 * n24 * n43 +
      n13 * n21 * n44 -
      n11 * n23 * n44) *
    invDet;
  out[10] =
    (n12 * n24 * n41 -
      n14 * n22 * n41 +
      n14 * n21 * n42 -
      n11 * n24 * n42 -
      n12 * n21 * n44 +
      n11 * n22 * n44) *
    invDet;
  out[11] =
    (n13 * n22 * n41 -
      n12 * n23 * n41 -
      n13 * n21 * n42 +
      n11 * n23 * n42 +
      n12 * n21 * n43 -
      n11 * n22 * n43) *
    invDet;
  out[12] = t14 * invDet;
  out[13] =
    (n13 * n24 * n31 -
      n14 * n23 * n31 +
      n14 * n21 * n33 -
      n11 * n24 * n33 -
      n13 * n21 * n34 +
      n11 * n23 * n34) *
    invDet;
  out[14] =
    (n14 * n22 * n31 -
      n12 * n24 * n31 -
      n14 * n21 * n32 +
      n11 * n24 * n32 +
      n12 * n21 * n34 -
      n11 * n22 * n34) *
    invDet;
  out[15] =
    (n12 * n23 * n31 -
      n13 * n22 * n31 +
      n13 * n21 * n32 -
      n11 * n23 * n32 -
      n12 * n21 * n33 +
      n11 * n22 * n33) *
    invDet;
  return out;
}

function xformPt(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

function nodeLocal(node) {
  if (node.matrix) return Float64Array.from(node.matrix);
  return trsMat(node.translation, node.rotation, node.scale);
}

function worldMats(nodes) {
  const parent = nodes.map(() => -1);
  nodes.forEach((n, i) => {
    for (const c of n.children || []) parent[c] = i;
  });
  const cache = new Map();
  const world = (i) => {
    if (cache.has(i)) return cache.get(i);
    const local = nodeLocal(nodes[i]);
    const w = parent[i] >= 0 ? matMul(world(parent[i]), local) : local;
    cache.set(i, w);
    return w;
  };
  return nodes.map((_, i) => world(i));
}

function regionOf(name) {
  if (/^(Eye_|Pupil_|Catch_|Brow_|Nose|Mouth|Cheek|Ear_|Skull)/.test(name)) {
    return "head";
  }
  if (/^Neck$/.test(name)) return "neck";
  if (/^(Palm_|Thumb_|Finger_)/.test(name)) return "hand";
  if (/^(Foot_|Toes_|FootSole_)/.test(name)) return "foot";
  if (/^Shoulder_/.test(name)) return "shoulder";
  if (/^(UpperArm_|Forearm_|Elbow_|Wrist_)/.test(name)) return "arm";
  if (/^(Thigh_|Shin_|Knee_)/.test(name)) return "leg";
  if (/^Chest$|^Shoulder_/.test(name)) return "chest";
  if (/^Belly$/.test(name)) return "waist";
  if (/^Pelvis$/.test(name)) return "hips";
  return "torso";
}

function centroid(pts) {
  const c = [0, 0, 0];
  for (const p of pts) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  const n = pts.length || 1;
  return [c[0] / n, c[1] / n, c[2] / n];
}

function scaleAbout(p, c, sx, sy, sz) {
  return [
    c[0] + (p[0] - c[0]) * sx,
    c[1] + (p[1] - c[1]) * sy,
    c[2] + (p[2] - c[2]) * sz,
  ];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function mulS(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function lerpV(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
function normalize(a) {
  const L = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / L, a[1] / L, a[2] / L];
}

function bboxOf(pts) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < mn[k]) mn[k] = p[k];
      if (p[k] > mx[k]) mx[k] = p[k];
    }
  }
  return { min: mn, max: mx };
}

function dominantAxis(bb) {
  const dx = bb.max[0] - bb.min[0];
  const dy = bb.max[1] - bb.min[1];
  const dz = bb.max[2] - bb.min[2];
  if (dx >= dy && dx >= dz) return 0;
  if (dy >= dx && dy >= dz) return 1;
  return 2;
}

function subdividePrim(pts, nrm, uvs, joints, weights, idx) {
  const keyOf = (a, b) => (a < b ? a + ":" + b : b + ":" + a);
  const mid = new Map();
  const midPt = (a, b) => {
    const k = keyOf(a, b);
    if (mid.has(k)) return mid.get(k);
    const i = pts.length;
    pts.push(lerpV(pts[a], pts[b], 0.5));
    nrm.push(normalize(add(nrm[a], nrm[b])));
    if (uvs)
      uvs.push([(uvs[a][0] + uvs[b][0]) * 0.5, (uvs[a][1] + uvs[b][1]) * 0.5]);
    if (joints) joints.push(joints[a].slice());
    if (weights) weights.push(weights[a].slice());
    mid.set(k, i);
    return i;
  };
  const out = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    const d = midPt(a, b);
    const e = midPt(b, c);
    const f = midPt(c, a);
    out.push(a, d, f, d, b, e, f, e, c, d, e, f);
  }
  return out;
}

function taubinSmooth(pts, idx, iterations = 8) {
  const n = pts.length;
  const adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i],
      b = idx[i + 1],
      c = idx[i + 2];
    adj[a].add(b);
    adj[a].add(c);
    adj[b].add(a);
    adj[b].add(c);
    adj[c].add(a);
    adj[c].add(b);
  }
  const bb = bboxOf(pts);
  const axis = dominantAxis(bb);
  const span = bb.max[axis] - bb.min[axis] || 1;
  const pin = pts.map((p) => {
    const u = (p[axis] - bb.min[axis]) / span;
    // Keep joint end-caps from shrinking away from neighboring segments.
    const edge = Math.min(u, 1 - u);
    return edge < 0.12 ? 0.2 : 1;
  });
  const step = (lambda) => {
    const next = pts.map((p) => p.slice());
    for (let i = 0; i < n; i++) {
      const nbrs = adj[i];
      if (nbrs.size === 0) continue;
      let ax = 0,
        ay = 0,
        az = 0;
      for (const j of nbrs) {
        ax += pts[j][0];
        ay += pts[j][1];
        az += pts[j][2];
      }
      const inv = 1 / nbrs.size;
      const t = lambda * pin[i];
      next[i][0] = pts[i][0] + (ax * inv - pts[i][0]) * t;
      next[i][1] = pts[i][1] + (ay * inv - pts[i][1]) * t;
      next[i][2] = pts[i][2] + (az * inv - pts[i][2]) * t;
    }
    for (let i = 0; i < n; i++) pts[i] = next[i];
  };
  for (let i = 0; i < iterations; i++) {
    step(0.33);
    step(-0.34);
  }
}

function recomputeNormals(pts, idx) {
  const nrm = pts.map(() => [0, 0, 0]);
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = pts[idx[i]];
    const b = pts[idx[i + 1]];
    const c = pts[idx[i + 2]];
    const e1 = sub(b, a);
    const e2 = sub(c, a);
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    for (const vi of [idx[i], idx[i + 1], idx[i + 2]]) {
      nrm[vi][0] += nx;
      nrm[vi][1] += ny;
      nrm[vi][2] += nz;
    }
  }
  return nrm.map((n) => normalize(n));
}

function flattenF32(rows, ncomp) {
  const out = new Float32Array(rows.length * ncomp);
  for (let i = 0; i < rows.length; i++) {
    for (let k = 0; k < ncomp; k++) out[i * ncomp + k] = rows[i][k];
  }
  return out;
}

function flattenU16(rows, ncomp) {
  const out = new Uint16Array(rows.length * ncomp);
  for (let i = 0; i < rows.length; i++) {
    if (ncomp === 1) out[i] = rows[i];
    else for (let k = 0; k < ncomp; k++) out[i * ncomp + k] = rows[i][k];
  }
  return out;
}

function minMax(rows, ncomp) {
  const min = Array(ncomp).fill(Infinity);
  const max = Array(ncomp).fill(-Infinity);
  for (const r of rows) {
    for (let k = 0; k < ncomp; k++) {
      const v = ncomp === 1 ? r : r[k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

if (!existsSync(sourcePath)) {
  if (!existsSync(shippedPath)) throw new Error("missing StreetBody glb");
  copyFileSync(shippedPath, sourcePath);
}

const { js, bin } = loadGlb(sourcePath);
const worlds = worldMats(js.nodes);

const prims = [];
for (let ni = 0; ni < js.nodes.length; ni++) {
  const node = js.nodes[ni];
  if (node.mesh == null) continue;
  const mesh = js.meshes[node.mesh];
  const name = node.name || mesh.name || "";
  const region = regionOf(name);
  const world = worlds[ni];
  const inv = invertMat(world);
  for (const prim of mesh.primitives || []) {
    const pos = readArray(js, bin, prim.attributes.POSITION).rows;
    const nrm =
      prim.attributes.NORMAL != null
        ? readArray(js, bin, prim.attributes.NORMAL).rows
        : pos.map(() => [0, 1, 0]);
    const uvs =
      prim.attributes.TEXCOORD_0 != null
        ? readArray(js, bin, prim.attributes.TEXCOORD_0).rows
        : null;
    const joints =
      prim.attributes.JOINTS_0 != null
        ? readArray(js, bin, prim.attributes.JOINTS_0).rows
        : null;
    const weights =
      prim.attributes.WEIGHTS_0 != null
        ? readArray(js, bin, prim.attributes.WEIGHTS_0).rows
        : null;
    const idx =
      prim.indices != null
        ? readArray(js, bin, prim.indices).rows.map((r) => r[0] ?? r)
        : pos.map((_, i) => i);
    const rec = {
      name,
      region,
      nodeIndex: ni,
      meshIndex: node.mesh,
      skin: node.skin,
      prim,
      pts: pos,
      nrm,
      uvs,
      joints,
      weights,
      idx,
      inv,
      world,
    };
    prims.push(rec);
  }
}

// --- 1. Subdivide + round the boxy body segments (local space) ---
for (const rec of prims) {
  if (!SUBDIVIDE.has(rec.name)) continue;
  rec.idx = subdividePrim(
    rec.pts,
    rec.nrm,
    rec.uvs,
    rec.joints,
    rec.weights,
    rec.idx,
  );
  taubinSmooth(rec.pts, rec.idx, rec.name === "Skull" ? 6 : 9);
  // Recover a little volume lost to smoothing, rounding the silhouette.
  rec.nrm = recomputeNormals(rec.pts, rec.idx);
  const infl =
    rec.region === "foot" ? 0.004 : rec.name === "Skull" ? 0.006 : 0.007;
  for (let i = 0; i < rec.pts.length; i++) {
    rec.pts[i] = add(rec.pts[i], mulS(rec.nrm[i], infl));
  }
}

// --- 2. World-space proportion pass ---
for (const rec of prims) {
  rec.worldPts = rec.pts.map((p) => xformPt(rec.world, p));
}

const groups = {
  head: [],
  neck: [],
  hand: [],
  foot: [],
  arm: [],
  leg: [],
  chest: [],
  shoulder: [],
  waist: [],
  hips: [],
  torso: [],
};
for (const rec of prims) groups[rec.region].push(...rec.worldPts);

const neckC = [0, 1.34, 0];
const handL = [];
const handR = [];
const footL = [];
const footR = [];
for (const rec of prims) {
  if (rec.region === "hand")
    (rec.name.includes("_L") ? handL : handR).push(...rec.worldPts);
  if (rec.region === "foot")
    (rec.name.includes("_L") ? footL : footR).push(...rec.worldPts);
}
const handCL = handL.length ? centroid(handL) : [-0.55, 1.22, 0];
const handCR = handR.length ? centroid(handR) : [0.55, 1.22, 0];
const footCL = footL.length ? centroid(footL) : [-0.12, 0.05, 0.05];
const footCR = footR.length ? centroid(footR) : [0.12, 0.05, 0.05];
const soleL = Math.min(
  ...(footL.length ? footL : [[0, 0, 0]]).map((p) => p[1]),
);
const soleR = Math.min(
  ...(footR.length ? footR : [[0, 0, 0]]).map((p) => p[1]),
);
const chestC = groups.chest.length ? centroid(groups.chest) : [0, 1.1, 0];
const waistC = groups.waist.length ? centroid(groups.waist) : [0, 0.93, 0];
const hipsC = groups.hips.length ? centroid(groups.hips) : [0, 0.8, 0];

for (const rec of prims) {
  const out = rec.worldPts.map((p) => p.slice());
  if (rec.region === "head") {
    for (let i = 0; i < out.length; i++) {
      out[i] = scaleAbout(out[i], neckC, 1.44, 1.4, 1.44);
    }
  } else if (rec.region === "neck") {
    const c = centroid(out);
    for (let i = 0; i < out.length; i++)
      out[i] = scaleAbout(out[i], c, 1.2, 1.0, 1.2);
  } else if (rec.region === "hand") {
    const c = rec.name.includes("_L") ? handCL : handCR;
    for (let i = 0; i < out.length; i++)
      out[i] = scaleAbout(out[i], c, 1.5, 1.42, 1.5);
  } else if (rec.region === "foot") {
    const c = rec.name.includes("_L") ? footCL : footCR;
    const soleY = rec.name.includes("_L") ? soleL : soleR;
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      const toe = Math.max(0, p[2] - c[2]);
      const sz = 1.42 + Math.min(0.28, toe * 1.3);
      const q = scaleAbout(p, [c[0], soleY, c[2]], 1.62, 1.52, sz);
      q[1] = soleY + Math.max(0, q[1] - soleY);
      out[i] = q;
    }
  } else if (rec.region === "shoulder") {
    const c = centroid(out);
    for (let i = 0; i < out.length; i++) {
      out[i] = scaleAbout(out[i], [0, c[1], 0], 1.32, 1.14, 1.2);
    }
  } else if (rec.region === "arm") {
    const c = centroid(out);
    for (let i = 0; i < out.length; i++) {
      out[i][1] = c[1] + (out[i][1] - c[1]) * 1.24;
      out[i][2] = c[2] + (out[i][2] - c[2]) * 1.24;
    }
  } else if (rec.region === "leg") {
    const c = centroid(out);
    for (let i = 0; i < out.length; i++) {
      out[i][0] = c[0] + (out[i][0] - c[0]) * 1.28;
      out[i][2] = c[2] + (out[i][2] - c[2]) * 1.28;
    }
  } else if (rec.region === "chest" || rec.name === "Chest") {
    for (let i = 0; i < out.length; i++) {
      out[i] = scaleAbout(out[i], [0, chestC[1], 0], 1.34, 1.08, 1.2);
    }
  } else if (rec.region === "waist") {
    for (let i = 0; i < out.length; i++) {
      out[i] = scaleAbout(out[i], [0, waistC[1], 0], 0.9, 1.0, 0.94);
    }
  } else if (rec.region === "hips") {
    for (let i = 0; i < out.length; i++) {
      out[i] = scaleAbout(out[i], [0, hipsC[1], 0], 1.14, 1.0, 1.1);
    }
  } else if (/^Shoulder_/.test(rec.name)) {
    const c = centroid(out);
    for (let i = 0; i < out.length; i++) {
      out[i] = scaleAbout(out[i], [0, c[1], 0], 1.28, 1.1, 1.18);
    }
  } else if (/ChestDrip/.test(rec.name)) {
    const c = [0, centroid(out)[1], 0];
    for (let i = 0; i < out.length; i++)
      out[i] = scaleAbout(out[i], c, 1.2, 1.05, 1.12);
  } else {
    const c = [0, centroid(out)[1], 0];
    for (let i = 0; i < out.length; i++)
      out[i] = scaleAbout(out[i], c, 1.12, 1.0, 1.08);
  }
  rec.out = out;
}

// --- 3. Cool / confident face (world space, after the head scale) ---
const browL = prims.filter((r) => r.name === "Brow_L");
const browR = prims.filter((r) => r.name === "Brow_R");
if (browL.length && browR.length) {
  const cL = centroid(browL[0].out);
  const cR = centroid(browR[0].out);
  const yAlign = Math.min(cL[1], cR[1]) - 0.018;
  for (const rec of [...browL, ...browR]) {
    const c = centroid(rec.out);
    const side = rec.name.includes("_L") ? 1 : -1;
    for (let i = 0; i < rec.out.length; i++) {
      rec.out[i][1] += yAlign - c[1];
      rec.out[i][1] -= side * 0.22 * (rec.out[i][0] - c[0]);
      rec.out[i] = scaleAbout(
        rec.out[i],
        [c[0], rec.out[i][1], c[2]],
        1.12,
        0.82,
        1.04,
      );
    }
  }
}
for (const rec of prims) {
  if (!/^Eye_|^Pupil_|^Catch_/.test(rec.name)) continue;
  const c = centroid(rec.out);
  const sy = /^Catch_/.test(rec.name) ? 0.9 : 0.78;
  for (let i = 0; i < rec.out.length; i++) {
    rec.out[i] = scaleAbout(rec.out[i], c, 1.16, sy, 1.12);
    rec.out[i][1] -= 0.006;
  }
}
for (const rec of prims) {
  if (rec.name !== "Mouth") continue;
  const c = centroid(rec.out);
  for (let i = 0; i < rec.out.length; i++) {
    rec.out[i] = scaleAbout(rec.out[i], c, 1.16, 0.18, 1.0);
    // Un-curve the authored smile into a nearly flat, slightly smirking line.
    rec.out[i][1] = c[1] + (rec.out[i][1] - c[1]) * 0.12 - 0.006;
    rec.out[i][1] += Math.max(0, rec.out[i][0] - c[0]) * 0.05;
  }
}

// --- 4. Ground the feet ---
let minY = Infinity;
let maxY = -Infinity;
for (const rec of prims) {
  for (const p of rec.out) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
}
const lift = minY < -1e-4 ? -minY : 0;
for (const rec of prims) {
  for (const p of rec.out) p[1] += lift;
}

// --- 5. Split a contrasting rubber sole off each foot ---
const soleH = 0.055;
const soleRecs = [];
for (const side of ["L", "R"]) {
  const sources = prims.filter(
    (r) => r.name === "Foot_" + side || r.name === "Toes_" + side,
  );
  if (!sources.length) continue;
  const pts = [];
  const uvs = [];
  const joints = [];
  const weights = [];
  const idx = [];
  const inv = sources[0].inv;
  const world = sources[0].world;
  const skin = sources[0].skin;
  const nodeIndex = sources[0].nodeIndex;
  const remapBase = () => pts.length;
  for (const rec of sources) {
    const base = remapBase();
    const keepVert = rec.out.map((p) => p[1] <= minY + lift + soleH + 0.012);
    // Flatten a platform sole.
    for (let i = 0; i < rec.out.length; i++) {
      if (keepVert[i] && rec.out[i][1] < minY + lift + soleH) {
        // Leave the very bottom at y=lift+minY, top of slab at soleH.
      }
    }
    for (let i = 0; i + 2 < rec.idx.length; i += 3) {
      const a = rec.idx[i],
        b = rec.idx[i + 1],
        c = rec.idx[i + 2];
      const ya = rec.out[a][1],
        yb = rec.out[b][1],
        yc = rec.out[c][1];
      const avg = (ya + yb + yc) / 3;
      if (avg > minY + lift + soleH) continue;
      const ia = pts.length;
      for (const vi of [a, b, c]) {
        const p = rec.out[vi].slice();
        if (p[1] > minY + lift + soleH * 0.85)
          p[1] = minY + lift + soleH * 0.85;
        pts.push(p);
        uvs.push(rec.uvs ? rec.uvs[vi].slice() : [0, 0]);
        joints.push(rec.joints ? rec.joints[vi].slice() : [0, 0, 0, 0]);
        weights.push(rec.weights ? rec.weights[vi].slice() : [1, 0, 0, 0]);
      }
      idx.push(ia, ia + 1, ia + 2);
      void base;
    }
  }
  if (idx.length < 3) continue;
  soleRecs.push({
    name: "FootSole_" + side,
    region: "foot",
    nodeIndex,
    meshIndex: -1,
    skin,
    prim: null,
    pts: pts.map((p) => xformPt(inv, p)),
    nrm: recomputeNormals(
      pts.map((p) => xformPt(inv, p)),
      idx,
    ),
    uvs,
    joints,
    weights,
    idx,
    inv,
    world,
    out: pts,
    isNewSole: true,
  });
}

// --- 6. Unbake + rebuild the GLB ---
for (const rec of prims) {
  rec.localOut = rec.out.map((p) => xformPt(rec.inv, p));
  rec.nrm = recomputeNormals(rec.localOut, rec.idx);
}

// Packer
const views = [];
const accessors = [];
const chunks = [];
let boff = 0;
function align4(n) {
  return (4 - (n % 4)) % 4;
}
function addAccessor(typed, type, componentType, withMinMax, scalarRows) {
  const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const pad = align4(bytes.length);
  const viewIdx = views.length;
  views.push({ buffer: 0, byteOffset: boff, byteLength: bytes.length });
  chunks.push(bytes);
  if (pad) chunks.push(Buffer.alloc(pad));
  boff += bytes.length + pad;
  const ncomp = NCOMP[type];
  const acc = {
    bufferView: viewIdx,
    componentType,
    count: typed.length / ncomp,
    type,
  };
  if (withMinMax) {
    const rows = scalarRows;
    const mm = minMax(rows, ncomp);
    acc.min = mm.min;
    acc.max = mm.max;
  }
  accessors.push(acc);
  return accessors.length - 1;
}

function packPrim(rec, localPts) {
  const posIdx = addAccessor(
    flattenF32(localPts, 3),
    "VEC3",
    5126,
    true,
    localPts,
  );
  const nrmIdx = addAccessor(flattenF32(rec.nrm, 3), "VEC3", 5126, false);
  const attrs = { POSITION: posIdx, NORMAL: nrmIdx };
  if (rec.uvs) {
    attrs.TEXCOORD_0 = addAccessor(flattenF32(rec.uvs, 2), "VEC2", 5126, false);
  }
  if (rec.joints) {
    attrs.JOINTS_0 = addAccessor(
      flattenU16(rec.joints, 4),
      "VEC4",
      5123,
      false,
    );
  }
  if (rec.weights) {
    attrs.WEIGHTS_0 = addAccessor(
      flattenF32(rec.weights, 4),
      "VEC4",
      5126,
      false,
    );
  }
  const indices = addAccessor(
    flattenU16(
      rec.idx.map((v) => [v]),
      1,
    ),
    "SCALAR",
    5123,
    true,
    rec.idx.map((v) => [v]),
  );
  return { attributes: attrs, indices };
}

// Copy IBMs first so skins stay valid
const ibmMap = new Map();
for (const skin of js.skins) {
  const old = skin.inverseBindMatrices;
  if (ibmMap.has(old)) {
    skin.inverseBindMatrices = ibmMap.get(old);
    continue;
  }
  const { rows } = readArray(js, bin, old);
  const idx = addAccessor(flattenF32(rows, 16), "MAT4", 5126, true, rows);
  ibmMap.set(old, idx);
  skin.inverseBindMatrices = idx;
}

// Rebuild every existing mesh primitive in node order
const packedByKey = new Map();
for (const rec of prims) {
  const packed = packPrim(rec, rec.localOut);
  packed.material = rec.prim.material;
  packed.mode = 4;
  packedByKey.set(rec, packed);
}

for (const mesh of js.meshes) mesh.primitives = [];
for (const rec of prims) {
  js.meshes[rec.meshIndex].primitives.push(packedByKey.get(rec));
}

// Sole material + meshes + nodes
const soleMat = js.materials.length;
js.materials.push({
  name: "SneakerSole",
  pbrMetallicRoughness: {
    baseColorFactor: [0.07, 0.06, 0.055, 1],
    metallicFactor: 0.02,
    roughnessFactor: 0.85,
  },
});

const streetRoot = 0;
for (const rec of soleRecs) {
  rec.localOut = rec.out.map((p) => xformPt(rec.inv, p));
  rec.nrm = recomputeNormals(rec.localOut, rec.idx);
  const packed = packPrim(rec, rec.localOut);
  packed.material = soleMat;
  packed.mode = 4;
  const meshIdx = js.meshes.length;
  js.meshes.push({ name: rec.name, primitives: [packed] });
  const nodeIdx = js.nodes.length;
  const node = { name: rec.name, mesh: meshIdx };
  if (rec.skin != null) node.skin = rec.skin;
  js.nodes.push(node);
  const parent =
    rec.nodeIndex >= 0
      ? js.nodes.findIndex(
          (n, i) =>
            i !== rec.nodeIndex && (n.children || []).includes(rec.nodeIndex),
        )
      : streetRoot;
  const pIdx = parent >= 0 ? parent : streetRoot;
  js.nodes[pIdx].children = [...(js.nodes[pIdx].children || []), nodeIdx];
}

js.accessors = accessors;
js.bufferViews = views;
js.buffers = [{ byteLength: boff }];
const outBin = Buffer.concat(chunks);

writeGlb(outPath, js, outBin);

const { js: js2 } = loadGlb(outPath);
let verts = 0;
let tris = 0;
for (const mesh of js2.meshes) {
  for (const prim of mesh.primitives || []) {
    verts += js2.accessors[prim.attributes.POSITION].count;
    if (prim.indices != null)
      tris += Math.floor(js2.accessors[prim.indices].count / 3);
  }
}
const jointCount = js2.skins?.[0]?.joints.length || 0;
const names = new Set();
for (const n of js2.nodes) if (n.name) names.add(n.name);
const report = {
  sourceBytes: readFileSync(sourcePath).length,
  outBytes: readFileSync(outPath).length,
  verts,
  tris,
  height: Number((maxY + lift).toFixed(4)),
  lift: Number(lift.toFixed(4)),
  joints: jointCount,
  soleMeshes: soleRecs.map((r) => r.name),
  hasSoles: soleRecs.length,
};
const reportText =
  JSON.stringify(report, null, 2).replace(
    /\[\n\s+"FootSole_L",\n\s+"FootSole_R"\n\s+\]/,
    '["FootSole_L", "FootSole_R"]',
  ) + "\n";
writeFileSync(
  join(root, "public", "characters", "street-body.stylize.json"),
  reportText,
);
console.log(JSON.stringify(report, null, 2));
if (tris >= 12000) {
  console.warn("WARNING: tris", tris, "exceeds 12k target");
}
if (jointCount !== 20) throw new Error("joint count changed: " + jointCount);
