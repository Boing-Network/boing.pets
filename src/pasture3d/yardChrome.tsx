/** Shared Yard materials: concrete textures, tokens, cheap neon bloom. */

import * as THREE from "three";

export const YARD = {
  ink: "#0A0A0A",
  ink2: "#111111",
  paper: "#F5F5F0",
  muted: "#A3A3A3",
  accent: "#FF4D00",
  concrete: "#c4c0b6",
  concreteDark: "#9a968c",
  concreteLight: "#e0dcd2",
  lane: "#c8c4ba",
  rust: "#6a4a3a",
  metal: "#6a6a68",
  water: "#5a9aaa",
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
  ctx.fillStyle = "#d4d0c6";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = ((i * 73) % size) + ((i * 17) % 9) * 0.2;
    const y = ((i * 47) % size) + ((i * 11) % 7) * 0.2;
    const tone = 190 + ((i * 13) % 40);
    ctx.fillStyle = `rgba(${tone}, ${tone - 3}, ${tone - 10}, 0.28)`;
    ctx.fillRect(x, y, 2 + (i % 6), 1 + (i % 4));
  }
  ctx.strokeStyle = "rgba(150, 146, 138, 0.45)";
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
  ctx.strokeStyle = "rgba(245, 245, 240, 0.95)";
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
  ctx.strokeStyle = "rgba(255, 77, 0, 0.9)";
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
  ctx.fillStyle = "#c8c4ba";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const x = ((i * 73) % size) + ((i * 17) % 9) * 0.2;
    const y = ((i * 47) % size) + ((i * 11) % 7) * 0.2;
    const tone = 175 + ((i * 13) % 40);
    ctx.fillStyle = `rgba(${tone}, ${tone - 2}, ${tone - 8}, 0.32)`;
    ctx.fillRect(x, y, 2 + (i % 5), 1 + (i % 4));
  }
  // Orange edge stripes and a dashed paper center line, both UV axes
  // so the ribbon reads even if U/V is swapped along the path.
  const paintStripes = (horizontal: boolean) => {
    ctx.strokeStyle = "rgba(255, 77, 0, 0.92)";
    ctx.lineWidth = 8;
    const edges = [14, size - 14];
    for (const e of edges) {
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(0, e);
        ctx.lineTo(size, e);
      } else {
        ctx.moveTo(e, 0);
        ctx.lineTo(e, size);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(245, 245, 240, 0.95)";
    ctx.lineWidth = 6;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
    } else {
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  paintStripes(true);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeChainTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(200, 200, 196, 0.12)";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(40, 40, 38, 0.95)";
  ctx.lineWidth = 3;
  const step = 18;
  for (let x = -size; x <= size * 2; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, size);
    ctx.lineTo(x + size, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeGraffitiTexture(seed = 3) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#d8d4cc";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 80; i++) {
    const x = (seed * 19 + i * 47) % size;
    const y = (seed * 13 + i * 31) % size;
    ctx.fillStyle = `rgba(160, 156, 148, ${0.08 + (i % 5) * 0.03})`;
    ctx.fillRect(x, y, 8, 6);
  }
  const palette = [
    "#FF4D00",
    "#F5F5F0",
    "#111111",
    "#2ec8e0",
    "#e23a8a",
    "#ffe14a",
  ];
  for (let i = 0; i < 10; i++) {
    const x = 8 + ((seed * 17 + i * 53) % 200);
    const y = 8 + ((seed * 11 + i * 41) % 200);
    const w = 28 + ((seed + i * 9) % 70);
    const h = 18 + ((seed + i * 5) % 50);
    ctx.fillStyle = palette[(seed + i) % palette.length]!;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#0A0A0A";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
  }
  // Bold tag strokes
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = palette[(seed + i + 2) % palette.length]!;
    ctx.lineWidth = 7;
    ctx.beginPath();
    const x0 = 16 + ((seed + i * 29) % 180);
    const y0 = 40 + ((seed + i * 17) % 160);
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + 40, y0 - 30, x0 + 80, y0 + 50, x0 + 120, y0 + 10);
    ctx.stroke();
  }
  // Stars and circles
  for (let i = 0; i < 6; i++) {
    const x = 20 + ((seed * 7 + i * 37) % 210);
    const y = 20 + ((seed * 5 + i * 23) % 210);
    ctx.fillStyle = palette[(seed + i + 1) % palette.length]!;
    ctx.beginPath();
    ctx.arc(x, y, 6 + (i % 3) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0A0A0A";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeWindowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#1a1a1c";
  ctx.fillRect(0, 0, size, size);
  const cols = 6;
  const rows = 10;
  const marginX = 14;
  const marginY = 12;
  const gapX = 8;
  const gapY = 7;
  const winW = (size - marginX * 2 - gapX * (cols - 1)) / cols;
  const winH = (size - marginY * 2 - gapY * (rows - 1)) / rows;
  const lit = ["#ffe8a8", "#ffd07a", "#fff3c4", "#ff9a4a"];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = (r * 13 + c * 7) % 10;
      const x = marginX + c * (winW + gapX);
      const y = marginY + r * (winH + gapY);
      if (n === 0 || n === 3) {
        ctx.fillStyle = "#141416";
      } else {
        ctx.fillStyle = lit[(r + c) % lit.length]!;
      }
      ctx.fillRect(x, y, winW, winH);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeSkyTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, "#c9d6f0");
  g.addColorStop(0.42, "#f3c8b0");
  g.addColorStop(0.62, "#ffb070");
  g.addColorStop(0.78, "#ff9a4a");
  g.addColorStop(1, "#e09060");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
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
