import * as THREE from "three";
import type { traits } from "./core";

export interface YardPet {
  owner: string;
  traits: ReturnType<typeof traits>;
  state: { status: string };
  spot: { x: number; z: number };
  online: boolean;
  nft: { staked: boolean } | null;
  buildings: string[];
}

export function mountYard(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#050a1a", 18, 42);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  camera.position.set(0, 11, 16);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight("#9eb6ff", 1.4));
  const sun = new THREE.DirectionalLight("#fff4d2", 2.2);
  sun.position.set(6, 12, 4);
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 48),
    new THREE.MeshStandardMaterial({ color: "#12305a", roughness: 0.9 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const meshes = new Map<string, THREE.Group>();
  let frame = 0;
  let running = true;
  function resize() {
    const width = canvas.clientWidth || 640;
    const height = canvas.clientHeight || 420;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function petMesh(pet: YardPet) {
    const group = new THREE.Group();
    const color = new THREE.Color(`hsl(${pet.traits.hue} 75% 68%)`);
    const accent = new THREE.Color(`hsl(${pet.traits.accent} 80% 66%)`);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 16),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45 }),
    );
    body.position.y = 0.7;
    group.add(body);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 12), new THREE.MeshStandardMaterial({ color: accent }));
    ear.position.set(-0.22, 1.2, 0);
    group.add(ear);
    const ear2 = ear.clone();
    ear2.position.x = 0.22;
    group.add(ear2);
    if (pet.nft?.staked) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.045, 8, 24),
        new THREE.MeshStandardMaterial({ color: "#f2d48a", emissive: "#f2d48a", emissiveIntensity: 0.4 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08;
      group.add(ring);
    }
    pet.buildings.forEach((kind, index) => {
      const stall = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, kind === "pen" ? 0.7 : 0.38, 0.42),
        new THREE.MeshStandardMaterial({ color: kind === "toy" ? "#f08bb8" : kind === "stand" ? "#f0c36a" : "#8eb6ff" }),
      );
      stall.position.set(0.9 + index * 0.5, 0.25, -0.4);
      group.add(stall);
    });
    if (!pet.online || pet.state.status === "stray") {
      body.material.transparent = true;
      body.material.opacity = pet.state.status === "stray" ? 0.45 : 0.72;
    }
    group.position.set(pet.spot.x, 0, pet.spot.z);
    return group;
  }
  function update(pets: YardPet[]) {
    const ids = new Set(pets.map((pet) => pet.owner));
    for (const [owner, mesh] of meshes) {
      if (!ids.has(owner)) {
        scene.remove(mesh);
        meshes.delete(owner);
      }
    }
    for (const pet of pets) {
      if (meshes.has(pet.owner)) continue;
      const mesh = petMesh(pet);
      meshes.set(pet.owner, mesh);
      scene.add(mesh);
    }
  }
  function loop() {
    if (!running) return;
    frame += 1;
    if (!reduced) {
      for (const mesh of meshes.values()) mesh.position.y = Math.sin(frame / 30 + mesh.position.x) * 0.08;
    }
    resize();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();
  return { update, stop: () => (running = false) };
}
