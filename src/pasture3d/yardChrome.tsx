/** Shared Yard materials: concrete textures, tokens, cheap neon bloom. */

import * as THREE from "three";

export const YARD = {
  ink: "#0A0A0A",
  ink2: "#111111",
  paper: "#F5F5F0",
  muted: "#A3A3A3",
  accent: "#FF4D00",
  concrete: "#8a877e",
  concreteDark: "#5c5a54",
  concreteLight: "#b0ada4",
  lane: "#4a4944",
  rust: "#6a4a3a",
  metal: "#3a3a3a",
  water: "#2a5460",
  sand: "#c4a56a",
  soil: "#4a3a28",
  foliage: "#3f7d4a",
  trunk: "#6d4a32",
} as const;

export function makeConcreteTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#8a877e";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2400; i++) {
    const x = ((i * 73) % size) + ((i * 17) % 9) * 0.2;
    const y = ((i * 47) % size) + ((i * 11) % 7) * 0.2;
    const tone = 110 + ((i * 13) % 50);
    ctx.fillStyle = `rgba(${tone}, ${tone - 4}, ${tone - 10}, 0.28)`;
    ctx.fillRect(x, y, 2 + (i % 6), 1 + (i % 4));
  }
  ctx.strokeStyle = "rgba(40, 38, 36, 0.35)";
  ctx.lineWidth = 2;
  for (let g = 0; g <= size; g += 64) {
    ctx.beginPath();
    ctx.moveTo(g, 0);
    ctx.lineTo(g, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, g);
    ctx.lineTo(size, g);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(245, 245, 240, 0.9)";
  ctx.lineWidth = 5;
  ctx.strokeRect(24, 24, size - 48, size - 48);
  ctx.beginPath();
  ctx.moveTo(24, size / 2);
  ctx.lineTo(size - 24, size / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size / 2, 24);
  ctx.lineTo(size / 2, size - 24);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 77, 0, 0.85)";
  ctx.lineWidth = 4;
  ctx.strokeRect(80, 80, size - 160, size - 160);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 48, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function makeLaneTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#4a4944";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const x = ((i * 73) % size) + ((i * 17) % 9) * 0.2;
    const y = ((i * 47) % size) + ((i * 11) % 7) * 0.2;
    const tone = 60 + ((i * 13) % 40);
    ctx.fillStyle = `rgba(${tone}, ${tone - 2}, ${tone - 6}, 0.35)`;
    ctx.fillRect(x, y, 2 + (i % 5), 1 + (i % 4));
  }
  ctx.fillStyle = "rgba(245, 245, 240, 0.18)";
  ctx.fillRect(0, size / 2 - 6, size, 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeChainTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(30, 30, 30, 0.92)";
  ctx.lineWidth = 2;
  const step = 10;
  for (let x = 0; x <= size; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeGraffitiTexture(seed: number) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#2a2a28";
  ctx.fillRect(0, 0, size, size);
  const palette = ["#F5F5F0", "#FF4D00", "#111111", "#A3A3A3", "#4a8fb5"];
  for (let i = 0; i < 18; i++) {
    const x = ((seed * 17 + i * 43) % 90) + 4;
    const y = ((seed * 11 + i * 29) % 90) + 4;
    const w = 16 + ((seed + i * 7) % 28);
    const h = 10 + ((seed + i * 5) % 22);
    ctx.fillStyle = palette[(seed + i) % palette.length]!;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#0A0A0A";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function NeonHalo({
  position,
  rotation,
  width = 2.4,
  height = 0.55,
  color = YARD.accent,
  preferPerf,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
  color?: string;
  preferPerf?: boolean;
}) {
  if (preferPerf) return null;
  return (
    <mesh
      position={position}
      rotation={rotation ?? [0, 0, 0]}
      renderOrder={8}
      frustumCulled={false}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.32}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
