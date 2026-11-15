import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { PASTURE_ZONE } from "../src/world/config/zones";
import { blocked, obstaclesForZone } from "../src/pasture3d/pathing";
import { YARD_KIT_PRELOAD } from "../src/pasture3d/YardKits";
import {
  prepareYardKit,
  restyleYardKit,
  separateStackedFaces,
  YARD_KIT_BASE,
} from "../src/pasture3d/yardKitLoader";
import { yardKitObstacles } from "../src/pasture3d/yardKitObstacles";

describe("yard kits", () => {
  it("serves kits from the public yard-kits folder", () => {
    expect(YARD_KIT_BASE).toBe("/yard-kits/");
    expect(YARD_KIT_PRELOAD.length).toBeGreaterThan(20);
    expect(YARD_KIT_PRELOAD).toContain("shop-wide");
    expect(YARD_KIT_PRELOAD).toContain("skate-bench");
  });

  it("samples building color atlases without mipmaps", () => {
    const map = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
    );
    map.generateMipmaps = true;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    const mat = new THREE.MeshStandardMaterial({ map, color: "#ffffff" });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    restyleYardKit(mesh);
    expect(map.generateMipmaps).toBe(false);
    expect(map.minFilter).toBe(THREE.NearestFilter);
    mesh.geometry.dispose();
    mat.dispose();
    map.dispose();
  });

  it("drops a second wall stacked on the same plane and keeps a quad", () => {
    const positions = new Float32Array([
      // A wall quad, two triangles that only share the diagonal.
      0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
      // The same first triangle again, which used to flash against it.
      0, 0, 0, 1, 0, 0, 0, 1, 0,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const out = separateStackedFaces(geo);
    expect(out.getAttribute("position").count).toBe(6);
    geo.dispose();
    out.dispose();
  });

  it("keeps most of a shop after unstacking the flashing wall copies", async () => {
    (globalThis as { self?: unknown }).self = globalThis;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const buf = readFileSync("public/yard-kits/shop-small.glb");
    const gltf = await loader.parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      "",
    );
    let before = 0;
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const index = mesh.geometry.getIndex();
      before += index
        ? index.count / 3
        : mesh.geometry.getAttribute("position").count / 3;
    });
    const prepared = prepareYardKit(gltf.scene, { scale: 1 });
    let after = 0;
    prepared.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      after += mesh.geometry.getAttribute("position").count / 3;
    });
    expect(before).toBeGreaterThan(500);
    expect(after).toBeGreaterThan(before * 0.85);
    expect(after).toBeLessThan(before);
  });

  it("keeps spawn walkable after kit solids are added", () => {
    const obstacles = obstaclesForZone(PASTURE_ZONE);
    expect(
      blocked({ x: PASTURE_ZONE.spawn.x, z: PASTURE_ZONE.spawn.z }, obstacles),
    ).toBeNull();
  });

  it("keeps station interact spots outside the new kit solids", () => {
    const extras = yardKitObstacles();
    expect(extras.length).toBeGreaterThan(0);
    for (const station of PASTURE_ZONE.stations) {
      expect(
        blocked({ x: station.position.x, z: station.position.z }, extras),
        station.id,
      ).toBeNull();
    }
  });
});
