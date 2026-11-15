import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshToonMaterial } from "three";
import type { Material, Mesh, Object3D } from "three";
import {
  STREET_BODY_ANCHOR_SLOTS,
  STREET_BODY_ANCHORS,
  STREET_BODY_JOINTS,
  STREET_BODY_URL,
  streetBodyTintSlot,
} from "../src/pasture3d/streetBodyAnchors";
import { styleStreetBody } from "../src/world/scene/StreetBodyModel";
import {
  STREET_BODY_ARM_DROP,
  STREET_BODY_RUN_SPEED,
  armsOpposeLegs,
  leftLegForward,
  streetBodyGait,
  streetBodyPose,
} from "../src/pasture3d/streetBodyAnim";
import {
  STREETWEAR_PROPS,
  STREET_PROP_BASE,
} from "../src/pasture3d/streetProps";
import {
  CITY_RESERVED_LOTS,
  cityBuildingCameraSolids,
  cityBuildingFootprints,
  cityDressingSolids,
  cityStreetwearBuildings,
  cityStreetwearProps,
  onCityStreet,
} from "../src/pasture3d/cityLayout";
import { PASTURE_ZONE } from "../src/world/config/zones";

describe("StreetBody anchors and gait", () => {
  it("exposes the 16 wardrobe attach slots on the 20-joint skeleton", () => {
    expect(STREET_BODY_URL).toBe("/characters/street-body.glb");
    expect(STREET_BODY_ANCHOR_SLOTS).toHaveLength(16);
    expect(STREET_BODY_ANCHORS.map((a) => a.id)).toEqual([
      ...STREET_BODY_ANCHOR_SLOTS,
    ]);
    expect(new Set(STREET_BODY_ANCHORS.map((a) => a.id)).size).toBe(16);
    expect(STREET_BODY_JOINTS).toHaveLength(20);
    const bones = new Set<string>(STREET_BODY_JOINTS);
    for (const anchor of STREET_BODY_ANCHORS) {
      expect(bones.has(anchor.bone), anchor.id).toBe(true);
    }
  });

  it("classifies idle, walk, and run from speed", () => {
    expect(streetBodyGait(0, false)).toBe("idle");
    expect(streetBodyGait(0.1, true)).toBe("idle");
    expect(streetBodyGait(1.35, true)).toBe("walk");
    expect(streetBodyGait(5.2, true)).toBe("run");
    expect(streetBodyGait(STREET_BODY_RUN_SPEED, true)).toBe("run");
  });

  it("keeps the authored A-pose and walks with opposite-phase legs facing +Z", () => {
    expect(STREET_BODY_ARM_DROP).toBe(0);
    const rest = streetBodyPose("idle", 0, true);
    expect(rest.shoulderL[2]).toBeCloseTo(STREET_BODY_ARM_DROP);
    expect(rest.shoulderR[2]).toBeCloseTo(-STREET_BODY_ARM_DROP);

    const omega = 7.5;
    const pose = streetBodyPose("walk", Math.PI / (2 * omega));
    expect(leftLegForward(pose)).toBe(true);
    expect(pose.upperLegR[0]).toBeGreaterThan(0);
    expect(armsOpposeLegs(pose)).toBe(true);
    expect(pose.shoulderL[2]).toBeCloseTo(STREET_BODY_ARM_DROP);
    expect(pose.shoulderR[2]).toBeCloseTo(-STREET_BODY_ARM_DROP);
  });
});

describe("StreetBody v3 shoe GLB", () => {
  const glb = readStreetBodyGlb();

  it("ships an uncompressed skin with Shoe, Body, and Sole split apart", () => {
    expect(existsSync("public/characters/street-body.v1.glb")).toBe(true);
    expect(existsSync("public/characters/street-body.v2.glb")).toBe(true);
    expect(glb.byteLength).toBe(468552);
    expect(glb.json.extensionsUsed).toBeUndefined();
    expect(glb.json.extensionsRequired).toBeUndefined();
    expect(glb.json.skins).toHaveLength(1);
    expect(glb.json.skins?.[0]?.joints).toHaveLength(20);
    expect(glb.json.materials?.map((mat) => mat.name)).toEqual([
      "EyeWhite",
      "Pupil",
      "Body",
      "Brow",
      "Mouth",
      "Sole",
      "Shoe",
      "Tank",
      "Shorts",
    ]);
    const shoe = glb.json.materials?.find((mat) => mat.name === "Shoe");
    expect(shoe?.pbrMetallicRoughness?.baseColorFactor).toEqual([
      1, 0.07421356837213867, 0.010329823026364548, 1,
    ]);
    for (const accessor of glb.json.accessors ?? []) {
      if (accessor.type !== "VEC3") continue;
      expect(accessor.componentType).toBe(5126);
      expect(accessor.normalized).toBeUndefined();
    }
    expect(triangleCount(glb.json)).toBe(11116);
  });

  it("keeps the sneaker upper off the per-NFT tint", () => {
    expect(streetBodyTintSlot("Body")).toBe("body");
    expect(streetBodyTintSlot("Shoe")).toBe("shoe");
    expect(streetBodyTintSlot("Sole")).toBe("sole");
    expect(streetBodyTintSlot("Tank")).toBe("clothes");
    expect(streetBodyTintSlot("Shorts")).toBe("clothes");
    expect(streetBodyTintSlot("EyeWhite")).toBe("face");
    expect(streetBodyTintSlot("Pupil")).toBe("face");
    expect(streetBodyTintSlot("Brow")).toBe("face");
    expect(streetBodyTintSlot("Mouth")).toBe("face");
    const tinted = (glb.json.materials ?? [])
      .map((mat) => mat.name ?? "")
      .filter((name) => streetBodyTintSlot(name) === "body");
    expect(tinted).toEqual(["Body"]);
  });

  it("cuts the upper on a welded cuff at y = 0.22", () => {
    const mesh = glb.json.meshes?.at(-1);
    const body = mesh?.primitives.find(
      (prim) => glb.json.materials?.[prim.material ?? -1]?.name === "Body",
    );
    const shoe = mesh?.primitives.find(
      (prim) => glb.json.materials?.[prim.material ?? -1]?.name === "Shoe",
    );
    expect(body?.attributes.POSITION).toBe(shoe?.attributes.POSITION);
    const shoeVerts = primitivePositions(glb, shoe!);
    const bodyVerts = primitivePositions(glb, body!);
    const ring = shoeVerts.filter((p) => p[1] > 0.2195);
    expect(ring.length).toBeGreaterThan(0);
    for (const p of ring) expect(p[1]).toBeCloseTo(0.22, 4);
    for (const p of ring) {
      expect(
        bodyVerts.some(
          (q) =>
            Math.abs(q[0] - p[0]) < 1e-5 &&
            Math.abs(q[1] - p[1]) < 1e-5 &&
            Math.abs(q[2] - p[2]) < 1e-5,
        ),
      ).toBe(true);
    }
  });

  it("gives Shoe the toon ramp and an outline without the body tint", async () => {
    const buf = readFileSync("public/characters/street-body.glb");
    const gltf = await parseGlb(buf);
    styleStreetBody(gltf.scene, { hue: 200, accent: 20 });
    const shoes = meshesNamed(gltf.scene, "Shoe");
    expect(shoes.length).toBeGreaterThan(0);
    for (const mesh of shoes) {
      const mat = mesh.material as MeshToonMaterial;
      expect(mat).toBeInstanceOf(MeshToonMaterial);
      expect(mat.gradientMap).toBeTruthy();
      expect(mat.customProgramCacheKey()).toBe("street-body-vinyl-v1");
      expect(mat.color.getHexString()).toBe("ff4d1a");
      const outline = mesh.parent?.children.find(
        (child) => child.name === `${mesh.name}_Outline`,
      );
      expect(outline).toBeTruthy();
    }
    const bodies = meshesNamed(gltf.scene, "Body");
    expect(bodies.length).toBeGreaterThan(0);
    for (const mesh of bodies) {
      const mat = mesh.material as MeshToonMaterial;
      expect(mat.color.getHexString()).not.toBe("ff4d1a");
      expect(mat.gradientMap).toBeTruthy();
    }
    const soles = meshesNamed(gltf.scene, "Sole");
    expect(soles.length).toBeGreaterThan(0);
    for (const mesh of soles) {
      expect((mesh.material as MeshToonMaterial).color.getHexString()).not.toBe(
        "ff4d1a",
      );
    }
  });
});

type GltfJson = {
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  materials?: {
    name?: string;
    pbrMetallicRoughness?: { baseColorFactor?: number[] };
  }[];
  meshes?: {
    primitives: {
      material?: number;
      mode?: number;
      indices?: number;
      attributes: { POSITION?: number };
    }[];
  }[];
  accessors?: {
    bufferView?: number;
    byteOffset?: number;
    componentType?: number;
    count: number;
    type?: string;
    normalized?: boolean;
  }[];
  bufferViews?: { byteOffset?: number; byteStride?: number }[];
  skins?: { joints?: number[] }[];
};

type StreetBodyGlb = { json: GltfJson; bin: Buffer; byteLength: number };

function meshesNamed(root: Object3D, materialName: string): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || mesh.name.endsWith("_Outline")) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.some((mat: Material) => mat.name === materialName))
      found.push(mesh);
  });
  return found;
}

function parseGlb(buf: Buffer) {
  const loader = new GLTFLoader();
  const bytes = new ArrayBuffer(buf.byteLength);
  new Uint8Array(bytes).set(buf);
  return new Promise<{ scene: Object3D }>((resolve, reject) => {
    loader.parse(bytes, "", (gltf) => resolve(gltf), reject);
  });
}

function readStreetBodyGlb(): StreetBodyGlb {
  const buf = readFileSync("public/characters/street-body.glb");
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Buffer | null = null;
  while (offset + 8 <= buf.length) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + chunkLen);
    if (chunkType === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    if (chunkType === 0x004e4942) bin = data;
    offset += 8 + chunkLen;
  }
  if (!json || !bin) throw new Error("street-body.glb is missing a chunk");
  return { json, bin, byteLength: buf.length };
}

function triangleCount(json: GltfJson): number {
  let total = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const mode = prim.mode ?? 4;
      const count =
        prim.indices != null
          ? (json.accessors?.[prim.indices]?.count ?? 0)
          : (json.accessors?.[prim.attributes.POSITION ?? -1]?.count ?? 0);
      if (mode === 4) total += count / 3;
      else if (mode === 5 || mode === 6) total += Math.max(0, count - 2);
    }
  }
  return total;
}

function primitivePositions(
  glb: StreetBodyGlb,
  prim: NonNullable<GltfJson["meshes"]>[number]["primitives"][number],
): number[][] {
  const json = glb.json;
  const posAcc = json.accessors?.[prim.attributes.POSITION ?? -1];
  const idxAcc =
    prim.indices != null ? json.accessors?.[prim.indices] : undefined;
  if (!posAcc || posAcc.bufferView == null) return [];
  const posView = json.bufferViews?.[posAcc.bufferView];
  if (!posView) return [];
  const stride = posView.byteStride ?? 12;
  const posStart = (posView.byteOffset ?? 0) + (posAcc.byteOffset ?? 0);
  const unique = new Map<number, number[]>();
  const push = (vi: number) => {
    if (unique.has(vi)) return;
    const o = posStart + vi * stride;
    unique.set(vi, [
      glb.bin.readFloatLE(o),
      glb.bin.readFloatLE(o + 4),
      glb.bin.readFloatLE(o + 8),
    ]);
  };
  if (!idxAcc) {
    const count = posAcc.count;
    for (let i = 0; i < count; i++) push(i);
    return [...unique.values()];
  }
  const idxView = json.bufferViews?.[idxAcc.bufferView ?? -1];
  if (!idxView) return [];
  const idxStart = (idxView.byteOffset ?? 0) + (idxAcc.byteOffset ?? 0);
  for (let i = 0; i < idxAcc.count; i++) {
    const vi =
      idxAcc.componentType === 5125
        ? glb.bin.readUInt32LE(idxStart + i * 4)
        : glb.bin.readUInt16LE(idxStart + i * 2);
    push(vi);
  }
  return [...unique.values()];
}

describe("Nico streetwear props", () => {
  it("ships the 11 singles from /street-props, skipping the kit bundles", () => {
    expect(STREET_PROP_BASE).toBe("/street-props/");
    const props = cityStreetwearProps();
    expect(props).toHaveLength(11);
    expect(props.map((p) => p.name).sort()).toEqual(
      [
        "corner-store",
        "fat-caps",
        "night-cart",
        "pigeon-drum",
        "site-fence",
        "sticker-box",
        "tagged-cone",
        "tagged-hydrant",
        "walk-up",
        "wheatpaste",
        "wood-crate",
      ].sort(),
    );
    expect(
      cityStreetwearBuildings()
        .map((p) => p.name)
        .sort(),
    ).toEqual(["corner-store", "walk-up"].sort());
    expect(STREETWEAR_PROPS.some((p) => p.name.startsWith("alley"))).toBe(
      false,
    );
  });

  it("keeps every prop off reserved lots, streets, the court, and spawn", () => {
    const drop = { x: 25, z: -11 };
    for (const item of cityStreetwearProps()) {
      const x = item.position[0];
      const z = item.position[2];
      const streetPad = item.kind === "building" ? 4.4 : 2.4;
      expect(onCityStreet(x, z, streetPad), item.name).toBe(false);
      expect(
        CITY_RESERVED_LOTS.some(
          (lot) =>
            Math.hypot(x - lot.x, z - lot.z) <=
            lot.r + (item.kind === "building" ? 1.15 : 0.8),
        ),
        item.name,
      ).toBe(false);
      expect(
        Math.hypot(x - PASTURE_ZONE.spawn.x, z - PASTURE_ZONE.spawn.z),
        item.name,
      ).toBeGreaterThan(4);
    }
    const cart = cityStreetwearProps().find((p) => p.name === "night-cart")!;
    const dist = Math.hypot(
      cart.position[0] - drop.x,
      cart.position[2] - drop.z,
    );
    expect(dist).toBeGreaterThan(7);
    expect(dist).toBeLessThan(14);
  });

  it("registers landmark buildings as footprints and camera solids", () => {
    const marks = cityStreetwearBuildings();
    const footprints = cityBuildingFootprints();
    const cams = cityBuildingCameraSolids();
    expect(cams.length).toBe(footprints.length);
    for (const b of marks) {
      expect(
        footprints.some(
          (f) => Math.hypot(f.x - b.position[0], f.z - b.position[2]) < 0.2,
        ),
        b.name,
      ).toBe(true);
    }
    const dressing = cityDressingSolids();
    expect(
      dressing.some(
        (s) =>
          s.id.startsWith("streetwear-building-") &&
          marks.some(
            (b) => Math.hypot(s.x - b.position[0], s.z - b.position[2]) < 0.2,
          ),
      ),
    ).toBe(true);
    for (const item of cityStreetwearProps().filter(
      (p) => p.kind === "clutter",
    )) {
      expect(
        dressing.some(
          (s) =>
            Math.hypot(s.x - item.position[0], s.z - item.position[2]) < 0.2,
        ),
        item.name,
      ).toBe(true);
    }
  });
});

describe("cartoon polish layout", () => {
  it("places Walk-Up and Corner Store on the central avenue in camera view", () => {
    const marks = Object.fromEntries(
      cityStreetwearBuildings().map((b) => [b.name, b]),
    );
    const walk = marks["walk-up"]!;
    const store = marks["corner-store"]!;
    // West and east of the N-S avenue, south of spawn, inside the district.
    expect(walk.position[0]).toBeLessThan(-4.4);
    expect(walk.position[0]).toBeGreaterThan(-8);
    expect(store.position[0]).toBeGreaterThan(4.4);
    expect(store.position[0]).toBeLessThan(8);
    for (const b of [walk, store]) {
      expect(b.position[2]).toBeLessThan(-6);
      expect(b.position[2]).toBeGreaterThan(-16);
    }
    expect(walk.rotationY).toBeCloseTo(Math.PI / 2);
    expect(store.rotationY).toBeCloseTo(-Math.PI / 2);
  });
});
