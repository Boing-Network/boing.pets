import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  type BufferGeometry,
} from "three";
import { makeFoliageMaterial } from "./Flora";
import { merge, part } from "./flora-geometry";
import type { WorldModel } from "./world-model";

/** Unit floating island; `city` adds the far-off lit skyline. */
function island(city: boolean): BufferGeometry {
  const parts = [
    part(new CylinderGeometry(1, 0.86, 0.2, 9), {
      color: "#2b5a52",
      shade: [0.7, 1],
    }),
    part(new ConeGeometry(0.86, 1.5, 9), {
      color: "#2a3850",
      at: [0, -0.85, 0],
      rotate: [Math.PI, 0, 0],
      shade: [0.55, 1],
    }),
    part(new ConeGeometry(0.3, 0.9, 6), {
      color: "#26324a",
      at: [0.45, -0.75, 0.2],
      rotate: [Math.PI, 0, 0],
    }),
    part(new ConeGeometry(0.25, 0.7, 6), {
      color: "#26324a",
      at: [-0.5, -0.6, -0.25],
      rotate: [Math.PI, 0, 0],
    }),
    // Waterfalls spilling off the rim.
    part(new BoxGeometry(0.07, 3.2, 0.02), {
      color: "#8fd4ff",
      at: [0.2, -1.6, 0.97],
      glow: 0.55,
      shade: [0.25, 1],
    }),
    part(new BoxGeometry(0.045, 2.4, 0.02), {
      color: "#8fd4ff",
      at: [-0.55, -1.2, 0.8],
      glow: 0.45,
      shade: [0.25, 1],
    }),
  ];
  for (let i = 0; i < 9; i += 1) {
    const angle = i * 2.4;
    const reach = 0.25 + ((i * 37) % 60) / 100;
    parts.push(
      part(new ConeGeometry(0.09, 0.3, 5), {
        color: "#1f4a44",
        at: [Math.cos(angle) * reach, 0.25, Math.sin(angle) * reach],
      }),
    );
  }
  if (city) {
    const towers: Array<[number, number, number, number]> = [
      [-0.3, 0.5, 0.05, 0.11],
      [-0.12, 0.72, -0.05, 0.1],
      [0.05, 0.58, 0.08, 0.12],
      [0.22, 0.86, 0, 0.09],
      [0.38, 0.46, -0.08, 0.11],
    ];
    parts.push(
      part(new BoxGeometry(1.0, 0.16, 0.5), {
        color: "#e9d6b0",
        at: [0.04, 0.18, 0],
        glow: 0.35,
      }),
    );
    for (const [x, h, z, w] of towers) {
      parts.push(
        part(new BoxGeometry(w, h, w), {
          color: "#ffd58a",
          at: [x, 0.26 + h / 2, z],
          glow: 0.6,
          shade: [0.5, 1],
        }),
      );
    }
    parts.push(
      part(new SphereGeometry(0.13, 8, 6), {
        color: "#ffe2a8",
        at: [0.05, 0.94, 0.08],
        glow: 0.8,
      }),
    );
  }
  return merge(parts);
}

/**
 * Far set dressing from the key art: floating land and a distant city glow.
 * Scenery only. It implies nothing about the simulation.
 */
export function Backdrop({ model }: { model: WorldModel }) {
  const plain = useMemo(() => island(false), []);
  const city = useMemo(() => island(true), []);
  const material = useMemo(() => {
    const m = makeFoliageMaterial({
      flat: true,
      twoSided: false,
      shadow: false,
      wind: 0,
      glow: 1.5,
      glowTinted: false,
      roughness: 0.9,
      reach: Infinity,
    });
    // Too far for scene fog to leave anything; their haze is in the colors.
    m.fog = false;
    return m;
  }, []);
  useEffect(
    () => () => {
      plain.dispose();
      city.dispose();
      material.dispose();
    },
    [plain, city, material],
  );

  const { bounds } = model;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);

  return (
    <group>
      <mesh
        geometry={city}
        material={material}
        position={[cx + span * 0.35, 150, cz - span * 1.25]}
        scale={95}
      />
      <mesh
        geometry={plain}
        material={material}
        position={[cx - span * 0.75, 115, cz - span * 1.05]}
        rotation={[0, 1.1, 0]}
        scale={58}
      />
      <mesh
        geometry={plain}
        material={material}
        position={[cx + span * 1.25, 95, cz - span * 0.55]}
        rotation={[0, 2.6, 0]}
        scale={46}
      />
      <mesh
        geometry={plain}
        material={material}
        position={[cx - span * 1.35, 80, cz - span * 0.2]}
        rotation={[0, 4.0, 0]}
        scale={38}
      />
    </group>
  );
}
