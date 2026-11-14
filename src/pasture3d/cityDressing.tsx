/** Gritty lot dressing: parked cars, a basketball court, and mural walls. */

import { useMemo } from "react";
import * as THREE from "three";
import {
  CITY_COURT,
  cityMuralWalls,
  cityParkedCars,
  type CityCarSpot,
} from "./cityLayout";
import { YARD, makeGraffitiTexture } from "./yardChrome";

function Car({ spot }: { spot: CityCarSpot }) {
  const { x, z, rotationY, color } = spot;
  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow={false} receiveShadow>
        <boxGeometry args={[2.1, 0.55, 1.05]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.35} />
      </mesh>
      <mesh position={[0.15, 0.82, 0]} castShadow={false}>
        <boxGeometry args={[1.15, 0.42, 0.96]} />
        <meshStandardMaterial color="#1c2228" roughness={0.3} metalness={0.2} />
      </mesh>
      {(
        [
          [-0.7, -0.55],
          [-0.7, 0.55],
          [0.7, -0.55],
          [0.7, 0.55],
        ] as const
      ).map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.22, lz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.22, 8]} />
          <meshStandardMaterial color="#111111" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[-0.95, 0.42, 0]}>
        <boxGeometry args={[0.08, 0.16, 0.9]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={0.25}
        />
      </mesh>
    </group>
  );
}

function courtTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#2a2a28";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const tone = 36 + ((i * 13) % 28);
    ctx.fillStyle = `rgba(${tone}, ${tone - 1}, ${tone - 3}, 0.28)`;
    ctx.fillRect((i * 73) % size, (i * 47) % size, 3, 2);
  }
  ctx.strokeStyle = "#FF4D00";
  ctx.lineWidth = 5;
  ctx.strokeRect(10, 10, size - 20, size - 20);
  ctx.strokeStyle = "#F5F5F0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(size / 2, 10);
  ctx.lineTo(size / 2, size - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 28, 0, Math.PI * 2);
  ctx.stroke();
  for (const side of [0, 1]) {
    const x = side ? size - 10 : 10;
    ctx.strokeStyle = "#FF4D00";
    ctx.strokeRect(side ? x - 36 : x, size / 2 - 28, 36, 56);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

function BasketballCourt() {
  const { x, z, rotY, width, depth } = CITY_COURT;
  const map = useMemo(() => courtTexture(), []);
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh
        position={[0, 0.035, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          map={map ?? undefined}
          color={map ? "#ffffff" : "#2a2a28"}
          roughness={0.9}
        />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[(width / 2 - 0.15) * side, 0, 0]}>
          <mesh position={[0, 1.55, 0]}>
            <boxGeometry args={[0.12, 3.1, 0.12]} />
            <meshStandardMaterial
              color="#1a1a1c"
              roughness={0.5}
              metalness={0.4}
            />
          </mesh>
          <mesh position={[0.08 * -side, 2.85, 0]}>
            <boxGeometry args={[0.08, 0.7, 1.15]} />
            <meshStandardMaterial color="#F5F5F0" roughness={0.4} />
          </mesh>
          <mesh
            position={[0.45 * -side, 2.55, 0]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <torusGeometry args={[0.32, 0.03, 6, 12]} />
            <meshStandardMaterial
              color={YARD.accent}
              roughness={0.35}
              metalness={0.5}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function MuralWalls() {
  const walls = cityMuralWalls();
  const maps = useMemo(
    () => walls.map((wall) => makeGraffitiTexture(wall.seed)),
    [walls],
  );
  return (
    <group>
      {walls.map((wall, i) => (
        <group
          key={i}
          position={[wall.x, wall.height / 2, wall.z]}
          rotation={[0, wall.rotationY, 0]}
        >
          <mesh receiveShadow>
            <boxGeometry args={[wall.width, wall.height, 0.28]} />
            <meshStandardMaterial
              map={maps[i] ?? undefined}
              color={maps[i] ? "#ffffff" : "#1a1a1c"}
              roughness={0.85}
            />
          </mesh>
          <mesh position={[0, 0, -0.16]}>
            <boxGeometry args={[wall.width + 0.2, wall.height + 0.2, 0.12]} />
            <meshStandardMaterial color="#111111" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function CityStreetDressing() {
  const cars = useMemo(() => cityParkedCars(), []);
  return (
    <group>
      <BasketballCourt />
      <MuralWalls />
      {cars.map((spot, i) => (
        <Car key={i} spot={spot} />
      ))}
    </group>
  );
}
