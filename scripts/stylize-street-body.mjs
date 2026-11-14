/**
 * Stylize StreetBody into a tougher 3D-cartoon proportion pass.
 *
 * Reads public/characters/street-body.source.glb (the authored mesh),
 * scales regions in bind-pose WORLD space (face parts live in local
 * space under the Head/Face nodes), and writes public/characters/street-body.glb.
 * Skeleton, bone names, skin weights, triangle count, and node
 * transforms are preserved.
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
const shippedPath = join(root, "public", "characters", "street-body.glb");

const COMP = {
  5120: { fmt: "i8", size: 1 },
  5121: { fmt: "u8", size: 1 },
  5122: { fmt: "i16", size: 2 },
  5123: { fmt: "u16", size: 2 },
  5125: { fmt: "u32", size: 4 },
  5126: { fmt: "f32", size: 4 },
};
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

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

function readVec3s(js, bin, accIdx) {
  const { acc, comp, ncomp, off, stride } = accessorInfo(js, accIdx);
  const pts = [];
  for (let i = 0; i < acc.count; i++) {
    const o = off + i * stride;
    if (comp.fmt !== "f32")
      throw new Error("unsupported position type " + comp.fmt);
    pts.push([
      bin.readFloatLE(o),
      bin.readFloatLE(o + 4),
      ncomp > 2 ? bin.readFloatLE(o + 8) : 0,
    ]);
  }
  return pts;
}

function writeVec3s(js, bin, accIdx, pts) {
  const { acc, comp, off, stride } = accessorInfo(js, accIdx);
  if (comp.fmt !== "f32") throw new Error("positions must be float");
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const o = off + i * stride;
    bin.writeFloatLE(p[0], o);
    bin.writeFloatLE(p[1], o + 4);
    bin.writeFloatLE(p[2], o + 8);
    for (let k = 0; k < 3; k++) {
      if (p[k] < min[k]) min[k] = p[k];
      if (p[k] > max[k]) max[k] = p[k];
    }
  }
  acc.min = min;
  acc.max = max;
}

function readIndices(js, bin, accIdx) {
  const { acc, comp, off, stride } = accessorInfo(js, accIdx);
  const idx = [];
  for (let i = 0; i < acc.count; i++) {
    const o = off + i * stride;
    if (comp.fmt === "u16") idx.push(bin.readUInt16LE(o));
    else if (comp.fmt === "u32") idx.push(bin.readUInt32LE(o));
    else if (comp.fmt === "u8") idx.push(bin[o]);
    else throw new Error("bad index type");
  }
  return idx;
}

function writeVec3Direct(bin, off, stride, pts) {
  for (let i = 0; i < pts.length; i++) {
    const o = off + i * stride;
    bin.writeFloatLE(pts[i][0], o);
    bin.writeFloatLE(pts[i][1], o + 4);
    bin.writeFloatLE(pts[i][2], o + 8);
  }
}

function recomputeNormals(pts, idx) {
  const nrm = pts.map(() => [0, 0, 0]);
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = pts[idx[i]];
    const b = pts[idx[i + 1]];
    const c = pts[idx[i + 2]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    for (const vi of [idx[i], idx[i + 1], idx[i + 2]]) {
      nrm[vi][0] += nx;
      nrm[vi][1] += ny;
      nrm[vi][2] += nz;
    }
  }
  for (const n of nrm) {
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n[0] /= len;
    n[1] /= len;
    n[2] /= len;
  }
  return nrm;
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
  const inv = 1 / det;
  out[0] = t11 * inv;
  out[1] =
    (n24 * n33 * n41 -
      n23 * n34 * n41 -
      n24 * n31 * n43 +
      n21 * n34 * n43 +
      n23 * n31 * n44 -
      n21 * n33 * n44) *
    inv;
  out[2] =
    (n22 * n34 * n41 -
      n24 * n32 * n41 +
      n24 * n31 * n42 -
      n21 * n34 * n42 -
      n22 * n31 * n44 +
      n21 * n32 * n44) *
    inv;
  out[3] =
    (n23 * n32 * n41 -
      n22 * n33 * n41 -
      n23 * n31 * n42 +
      n21 * n33 * n42 +
      n22 * n31 * n43 -
      n21 * n32 * n43) *
    inv;
  out[4] = t12 * inv;
  out[5] =
    (n13 * n34 * n41 -
      n14 * n33 * n41 +
      n14 * n31 * n43 -
      n11 * n34 * n43 -
      n13 * n31 * n44 +
      n11 * n33 * n44) *
    inv;
  out[6] =
    (n14 * n32 * n41 -
      n12 * n34 * n41 -
      n14 * n31 * n42 +
      n11 * n34 * n42 +
      n12 * n31 * n44 -
      n11 * n32 * n44) *
    inv;
  out[7] =
    (n12 * n33 * n41 -
      n13 * n32 * n41 +
      n13 * n31 * n42 -
      n11 * n33 * n42 -
      n12 * n31 * n43 +
      n11 * n32 * n43) *
    inv;
  out[8] = t13 * inv;
  out[9] =
    (n14 * n23 * n41 -
      n13 * n24 * n41 -
      n14 * n21 * n43 +
      n11 * n24 * n43 +
      n13 * n21 * n44 -
      n11 * n23 * n44) *
    inv;
  out[10] =
    (n12 * n24 * n41 -
      n14 * n22 * n41 +
      n14 * n21 * n42 -
      n11 * n24 * n42 -
      n12 * n21 * n44 +
      n11 * n22 * n44) *
    inv;
  out[11] =
    (n13 * n22 * n41 -
      n12 * n23 * n41 -
      n13 * n21 * n42 +
      n11 * n23 * n42 +
      n12 * n21 * n43 -
      n11 * n22 * n43) *
    inv;
  out[12] = t14 * inv;
  out[13] =
    (n13 * n24 * n31 -
      n14 * n23 * n31 +
      n14 * n21 * n33 -
      n11 * n24 * n33 -
      n13 * n21 * n34 +
      n11 * n23 * n34) *
    inv;
  out[14] =
    (n14 * n22 * n31 -
      n12 * n24 * n31 -
      n14 * n21 * n32 +
      n11 * n24 * n32 +
      n12 * n21 * n34 -
      n11 * n22 * n34) *
    inv;
  out[15] =
    (n12 * n23 * n31 -
      n13 * n22 * n31 +
      n13 * n21 * n32 -
      n11 * n23 * n32 -
      n12 * n21 * n33 +
      n11 * n22 * n33) *
    inv;
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
  if (/^(Foot_|Toes_)/.test(name)) return "foot";
  if (/^(Shoulder_|UpperArm_|Forearm_|Elbow_|Wrist_)/.test(name)) return "arm";
  if (/^(Thigh_|Shin_|Knee_)/.test(name)) return "leg";
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

if (!existsSync(sourcePath)) {
  if (!existsSync(shippedPath)) throw new Error("missing StreetBody glb");
  copyFileSync(shippedPath, sourcePath);
}

const { js, bin } = loadGlb(sourcePath);
const worlds = worldMats(js.nodes);

const groups = {
  head: [],
  neck: [],
  hand: [],
  foot: [],
  arm: [],
  leg: [],
  torso: [],
};
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
    const local = readVec3s(js, bin, prim.attributes.POSITION);
    const pts = local.map((p) => xformPt(world, p));
    const rec = { name, region, prim, pts, local, inv };
    prims.push(rec);
    groups[region].push(...pts);
  }
}

const neckC = [0, 1.34, 0];
const handL = [];
const handR = [];
const footL = [];
const footR = [];
for (const rec of prims) {
  if (rec.region === "hand") {
    (rec.name.includes("_L") ? handL : handR).push(...rec.pts);
  }
  if (rec.region === "foot") {
    (rec.name.includes("_L") ? footL : footR).push(...rec.pts);
  }
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

for (const rec of prims) {
  const out = rec.pts.map((p) => p.slice());
  if (rec.region === "head") {
    // Grow the head from the neck junction so it gets rounder and taller.
    for (let i = 0; i < out.length; i++) {
      out[i] = scaleAbout(out[i], neckC, 1.16, 1.12, 1.16);
    }
    const c = centroid(out);
    if (/^Eye_|^Pupil_|^Catch_/.test(rec.name)) {
      for (let i = 0; i < out.length; i++)
        out[i] = scaleAbout(out[i], c, 1.12, 1.12, 1.16);
    } else if (/^Brow_/.test(rec.name)) {
      const side = rec.name.includes("_L") ? -1 : 1;
      for (let i = 0; i < out.length; i++) {
        // Lower and flatten the brows for a cooler, confident look.
        out[i][1] -= 0.01;
        out[i][0] += side * 0.003;
        out[i] = scaleAbout(out[i], [c[0], out[i][1], c[2]], 1.1, 1.16, 1.06);
      }
    } else if (/^Mouth$/.test(rec.name)) {
      for (let i = 0; i < out.length; i++) {
        out[i][1] -= 0.005;
        out[i] = scaleAbout(out[i], c, 1.1, 0.94, 1.04);
      }
    } else if (/^Ear_/.test(rec.name)) {
      for (let i = 0; i < out.length; i++)
        out[i] = scaleAbout(out[i], c, 1.12, 1.1, 1.08);
    }
  } else if (rec.region === "neck") {
    const c = centroid(out);
    for (let i = 0; i < out.length; i++) {
      out[i] = scaleAbout(out[i], c, 1.12, 1.0, 1.12);
    }
  } else if (rec.region === "hand") {
    const c = rec.name.includes("_L") ? handCL : handCR;
    for (let i = 0; i < out.length; i++)
      out[i] = scaleAbout(out[i], c, 1.26, 1.22, 1.26);
  } else if (rec.region === "foot") {
    const c = rec.name.includes("_L") ? footCL : footCR;
    const soleY = rec.name.includes("_L") ? soleL : soleR;
    // Chunky sneaker: wider, taller from the sole up, longer toe box (+Z).
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      const toe = Math.max(0, p[2] - c[2]);
      const sz = 1.22 + Math.min(0.18, toe * 1.1);
      const q = scaleAbout(p, [c[0], soleY, c[2]], 1.32, 1.18, sz);
      q[1] = soleY + Math.max(0, q[1] - soleY);
      out[i] = q;
    }
  } else if (rec.region === "arm") {
    const c = centroid(out);
    for (let i = 0; i < out.length; i++) {
      // Thicken perpendicular to the T-pose arm axis (X).
      out[i][1] = c[1] + (out[i][1] - c[1]) * 1.16;
      out[i][2] = c[2] + (out[i][2] - c[2]) * 1.16;
    }
  } else if (rec.region === "leg") {
    const c = centroid(out);
    for (let i = 0; i < out.length; i++) {
      out[i][0] = c[0] + (out[i][0] - c[0]) * 1.14;
      out[i][2] = c[2] + (out[i][2] - c[2]) * 1.14;
    }
  } else {
    const c = [0, centroid(out)[1], 0];
    for (let i = 0; i < out.length; i++)
      out[i] = scaleAbout(out[i], c, 1.08, 1.0, 1.06);
  }
  rec.out = out;
}

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
  const localOut = rec.out.map((p) => xformPt(rec.inv, p));
  writeVec3s(js, bin, rec.prim.attributes.POSITION, localOut);
  if (rec.prim.attributes.NORMAL != null && rec.prim.indices != null) {
    const idx = readIndices(js, bin, rec.prim.indices);
    const nrm = recomputeNormals(localOut, idx);
    const info = accessorInfo(js, rec.prim.attributes.NORMAL);
    if (info.comp.fmt === "f32")
      writeVec3Direct(bin, info.off, info.stride, nrm);
  }
}

writeGlb(outPath, js, bin);
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
const report = {
  sourceBytes: readFileSync(sourcePath).length,
  outBytes: readFileSync(outPath).length,
  verts,
  tris,
  height: Number((maxY + lift).toFixed(4)),
  lift: Number(lift.toFixed(4)),
  joints: (js2.skins || []).length ? js2.skins[0].joints.length : 0,
};
writeFileSync(
  join(root, "public", "characters", "street-body.stylize.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
