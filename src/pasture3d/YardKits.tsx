/** Kenney CC0 kit placements for The Yard. Procedural meshes stay as the
 *  loading fallback via YardKitSwap / conditional renders. */

import "@react-three/fiber";
import { useMemo } from "react";
import { PASTURE_ZONE } from "../world/config/zones";
import { lilyPondEllipse } from "./meadowFootprints";
import { meadowHeight } from "./meadowHeight";
import { MEADOW_BUSH_SPOTS, MEADOW_ROCK_SPOTS } from "./meadowLayout";
import { NeonHalo, YARD } from "./yardChrome";
import {
  InstancedYardKit,
  YardKit,
  YardKitSwap,
  type YardKitInstance,
} from "./yardKitLoader";

export const YARD_KIT_PRELOAD = [
  "shop-wide",
  "shop-narrow",
  "shop-small",
  "shop-mid",
  "sky-low-a",
  "sky-low-b",
  "sky-low-e",
  "sky-low-g",
  "sky-low-i",
  "sky-low-wide-a",
  "sky-low-wide-b",
  "sky-tower-a",
  "sky-tower-e",
  "awning-wide",
  "container-a",
  "container-b",
  "planter",
  "fence-low",
  "tree-detailed",
  "pot-large",
  "bush",
  "flower-red",
  "flower-yellow",
  "lily",
  "rock-tall",
  "stone-tall",
  "coat-rack",
  "potted-plant",
  "box-closed",
  "kitchen-bar",
  "fridge",
  "stove",
  "stool",
  "desk",
  "burger",
  "fries",
  "hotdog",
  "soda",
  "pizza",
  "coffee",
  "barrel",
  "bowl-side",
  "bowl-corner-inner",
  "bowl-corner-outer",
  "bowl-platform",
  "skate-ramp",
  "rail-low",
  "skate-fence",
  "skate-bench",
] as const;

function ground(x: number, z: number): number {
  return meadowHeight(x, z);
}

/** The Drop — wide commercial shopfront facing the plaza. */
export function YardDropKit({
  fallback,
  children,
}: {
  fallback?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <YardKitSwap name="shop-wide" scale={5.1} frontZ={0.85} fallback={fallback}>
      {children}
      <mesh position={[0, 4.05, 0.95]}>
        <boxGeometry args={[6.4, 0.16, 0.18]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={1.35}
        />
      </mesh>
      <mesh position={[0, 3.9, 0.95]}>
        <boxGeometry args={[6.0, 0.06, 0.14]} />
        <meshStandardMaterial
          color="#2ec8e0"
          emissive="#2ec8e0"
          emissiveIntensity={0.9}
        />
      </mesh>
      <NeonHalo position={[0, 4.05, 1.15]} width={6.6} height={0.55} />
    </YardKitSwap>
  );
}

export function YardPrintShopKit({ children }: { children?: React.ReactNode }) {
  return (
    <YardKitSwap
      name="shop-narrow"
      scale={3.6}
      frontZ={0.7}
      fallback={children}
    >
      <YardKit name="desk" scale={2.1} position={[0.15, 0, 0.55]} />
      <mesh position={[0, 3.35, 0.8]}>
        <boxGeometry args={[2.4, 0.1, 0.12]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={1.2}
        />
      </mesh>
      <mesh position={[0.55, 3.22, 0.8]}>
        <boxGeometry args={[0.9, 0.05, 0.1]} />
        <meshStandardMaterial
          color="#2ec8e0"
          emissive="#2ec8e0"
          emissiveIntensity={0.85}
        />
      </mesh>
    </YardKitSwap>
  );
}

export function YardFittingKit({ children }: { children?: React.ReactNode }) {
  return (
    <YardKitSwap name="shop-small" scale={3.5} frontZ={0.7} fallback={children}>
      <YardKit name="coat-rack" scale={2.2} position={[-0.7, 0, 0.55]} />
      <YardKit name="potted-plant" scale={2} position={[0.85, 0, 0.5]} />
    </YardKitSwap>
  );
}

export function YardKitchenKit() {
  return (
    <group>
      <YardKit
        name="kitchen-bar"
        scale={2.6}
        position={[0, 0, 0.15]}
        frontZ={0.35}
      />
      <YardKit name="fridge" scale={2.4} position={[-1.15, 0, -0.15]} />
      <YardKit name="stove" scale={2.3} position={[1.1, 0, -0.1]} />
      <YardKit name="stool" scale={2.1} position={[-0.55, 0, 0.85]} />
      <YardKit name="stool" scale={2.1} position={[0.45, 0, 0.85]} />
      <YardKit name="barrel" scale={1.6} position={[1.55, 0, 0.55]} />
      <YardKit name="burger" scale={2.2} position={[-0.25, 1.05, 0.2]} />
      <YardKit name="fries" scale={2} position={[0.15, 1.05, 0.22]} />
      <YardKit name="hotdog" scale={2} position={[0.5, 1.02, 0.18]} />
      <YardKit name="soda" scale={2} position={[-0.55, 1.05, 0.15]} />
      <YardKit name="coffee" scale={2} position={[0.85, 1.02, 0.2]} />
      <YardKit name="pizza" scale={1.6} position={[0.15, 1.08, -0.15]} />
      <mesh position={[0, 2.42, 0.7]}>
        <boxGeometry args={[3.2, 0.1, 0.12]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={1.2}
        />
      </mesh>
      <mesh position={[0, 2.3, 0.7]}>
        <boxGeometry args={[2.8, 0.05, 0.1]} />
        <meshStandardMaterial
          color="#2ec8e0"
          emissive="#2ec8e0"
          emissiveIntensity={0.8}
        />
      </mesh>
    </group>
  );
}

export function YardHomeKit() {
  const y = 0;
  return (
    <group>
      <YardKit name="planter" scale={2.6} position={[-2.2, y, -2.2]} />
      <YardKit name="planter" scale={2.6} position={[2.2, y, -2.2]} />
      <YardKit name="potted-plant" scale={1.8} position={[-2.2, y, 2.15]} />
      <YardKit name="potted-plant" scale={1.8} position={[2.2, y, 2.15]} />
    </group>
  );
}

export function YardTreasureKit() {
  return (
    <group>
      <YardKit
        name="container-a"
        scale={6}
        position={[-2.4, 0, -1.6]}
        rotation={[0, 0.4, 0]}
      />
      <YardKit
        name="container-b"
        scale={6}
        position={[2.6, 0, -1.8]}
        rotation={[0, -0.2, 0]}
      />
      <YardKit name="box-closed" scale={3} position={[-0.9, 0, 1.1]} />
      <YardKit name="box-closed" scale={2.4} position={[-0.55, 0, 1.35]} />
    </group>
  );
}

export function YardCrystalKit() {
  return (
    <group>
      <YardKit name="rock-tall" scale={2.2} position={[-1.6, 0, -1.1]} />
      <YardKit name="stone-tall" scale={2} position={[1.5, 0, -0.9]} />
      <YardKit name="rock-tall" scale={1.6} position={[0.9, 0, 1.3]} />
    </group>
  );
}

export function YardGardenKit() {
  return (
    <group>
      <YardKit name="planter" scale={3} position={[-1.2, 0, -0.8]} />
      <YardKit name="planter" scale={3} position={[1.1, 0, 0.7]} />
      <YardKit name="pot-large" scale={2.2} position={[-0.2, 0, 1.2]} />
      <YardKit name="flower-red" scale={2.4} position={[-1.2, 0.45, -0.8]} />
      <YardKit name="flower-yellow" scale={2.4} position={[1.1, 0.45, 0.7]} />
      <YardKit name="bush" scale={2} position={[0.2, 0, -1.15]} />
    </group>
  );
}

export function YardCanalKit() {
  const pond = lilyPondEllipse();
  if (!pond) return null;
  const { x, z, rx, rz } = pond;
  const y = ground(x, z);
  const w = rx * 2.2;
  const d = rz * 2.2;
  const railY = y + 0.02;
  return (
    <group>
      {([-w / 2, w / 2] as const).map((px) => (
        <YardKit
          key={`x${px}`}
          name="skate-fence"
          scale={Math.max(2.2, d / 1.05)}
          position={[x + px, railY, z]}
          rotation={[0, Math.PI / 2, 0]}
        />
      ))}
      {([-d / 2, d / 2] as const).map((pz) => (
        <YardKit
          key={`z${pz}`}
          name="skate-fence"
          scale={Math.max(2.2, w / 1.05)}
          position={[x, railY, z + pz]}
        />
      ))}
      {(
        [
          [0.28, 0.18],
          [-0.36, -0.12],
          [0.08, -0.42],
        ] as const
      ).map(([nx, nz], i) => (
        <YardKit
          key={i}
          name="lily"
          scale={2.4}
          position={[x + nx * (w / 2), y + 0.16, z + nz * (d / 2)]}
        />
      ))}
    </group>
  );
}

export function YardOakKit({ fallback }: { fallback: React.ReactNode }) {
  return <YardKitSwap name="tree-detailed" scale={5.2} fallback={fallback} />;
}

/** Modular Mini Skate bowl to the side of the race strip (local +X). */
export function YardRaceBowlKit() {
  const s = 2.15;
  const tiles: { name: string; x: number; z: number; rotY: number }[] = [
    { name: "bowl-corner-inner", x: 2.2, z: 0.4, rotY: Math.PI },
    { name: "bowl-side", x: 4.35, z: 0.4, rotY: Math.PI },
    { name: "bowl-corner-inner", x: 6.5, z: 0.4, rotY: Math.PI / 2 },
    { name: "bowl-side", x: 2.2, z: 2.55, rotY: -Math.PI / 2 },
    { name: "bowl-platform", x: 4.35, z: 2.55, rotY: 0 },
    { name: "bowl-side", x: 6.5, z: 2.55, rotY: Math.PI / 2 },
    { name: "bowl-corner-inner", x: 2.2, z: 4.7, rotY: -Math.PI / 2 },
    { name: "bowl-side", x: 4.35, z: 4.7, rotY: 0 },
    { name: "bowl-corner-inner", x: 6.5, z: 4.7, rotY: 0 },
  ];
  return (
    <group>
      {tiles.map((tile, i) => (
        <YardKit
          key={i}
          name={tile.name}
          scale={s}
          position={[tile.x, 0, tile.z]}
          rotation={[0, tile.rotY, 0]}
        />
      ))}
      <YardKit name="skate-ramp" scale={s} position={[0.6, 0, 6.4]} />
      <YardKit name="rail-low" scale={s} position={[-0.9, 0, 4.2]} />
      <YardKit
        name="skate-bench"
        scale={1.8}
        position={[8.2, 0, 2.4]}
        rotation={[0, -0.4, 0]}
      />
    </group>
  );
}

function hash01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function YardSkylineKits({ preferPerf }: { preferPerf: boolean }) {
  const groups = useMemo(() => {
    const bounds = PASTURE_ZONE.bounds;
    const lows = preferPerf
      ? (["sky-low-a", "sky-low-e", "sky-low-wide-a"] as const)
      : ([
          "sky-low-a",
          "sky-low-b",
          "sky-low-e",
          "sky-low-g",
          "sky-low-i",
          "sky-low-wide-a",
          "sky-low-wide-b",
        ] as const);
    const towers = preferPerf
      ? (["sky-tower-a"] as const)
      : (["sky-tower-a", "sky-tower-e"] as const);
    const byName: Record<string, YardKitInstance[]> = {};
    const push = (name: string, item: YardKitInstance) => {
      (byName[name] ||= []).push(item);
    };
    const sides: {
      along: "x" | "z";
      pos: number;
      rotY: number;
      a0: number;
      a1: number;
    }[] = [
      {
        along: "x",
        pos: bounds.maxZ + 7,
        rotY: Math.PI,
        a0: bounds.minX - 8,
        a1: bounds.maxX + 8,
      },
      {
        along: "x",
        pos: bounds.minZ - 7,
        rotY: 0,
        a0: bounds.minX - 8,
        a1: bounds.maxX + 8,
      },
      {
        along: "z",
        pos: bounds.maxX + 7,
        rotY: -Math.PI / 2,
        a0: bounds.minZ - 8,
        a1: bounds.maxZ + 8,
      },
      {
        along: "z",
        pos: bounds.minX - 7,
        rotY: Math.PI / 2,
        a0: bounds.minZ - 8,
        a1: bounds.maxZ + 8,
      },
    ];
    const rows = preferPerf ? [0] : [0, 1, 2];
    let n = 0;
    for (const side of sides) {
      for (const row of rows) {
        const outward = row * (preferPerf ? 9 : 10);
        const step = row === 2 ? 11 : 6.4;
        for (let a = side.a0; a <= side.a1; a += step) {
          const jitter = (hash01(n) - 0.5) * 2.2;
          const x =
            side.along === "x"
              ? a + jitter
              : side.pos + Math.sign(side.pos) * outward;
          const z =
            side.along === "z"
              ? a + jitter
              : side.pos + Math.sign(side.pos) * outward;
          const isTower = row === 2 || (row === 1 && hash01(n + 9) > 0.78);
          const name = isTower
            ? towers[n % towers.length]
            : lows[n % lows.length];
          const sc = isTower ? 10 + hash01(n + 3) * 6 : 8 + hash01(n + 5) * 5;
          push(name, {
            position: [x, 0, z],
            rotationY: side.rotY + (hash01(n + 2) - 0.5) * 0.08,
            scale: sc,
          });
          n += 1;
        }
      }
    }
    return byName;
  }, [preferPerf]);
  return (
    <group>
      {Object.entries(groups).map(([name, items]) => (
        <InstancedYardKit key={name} name={name} items={items} scale={1} />
      ))}
    </group>
  );
}

export function YardPlazaDecorKits({ preferPerf }: { preferPerf: boolean }) {
  const planters = useMemo(() => {
    const src = preferPerf ? MEADOW_BUSH_SPOTS.slice(0, 8) : MEADOW_BUSH_SPOTS;
    return src.map(([x, z], i) => ({
      position: [x, ground(x, z), z] as [number, number, number],
      rotationY: i * 0.4,
      scale: 2.4,
    }));
  }, [preferPerf]);
  const pots = useMemo(() => {
    const src = preferPerf ? MEADOW_ROCK_SPOTS.slice(0, 6) : MEADOW_ROCK_SPOTS;
    return src.map(([x, z], i) => ({
      position: [x, ground(x, z), z] as [number, number, number],
      rotationY: i * 0.7,
      scale: 2.1,
    }));
  }, [preferPerf]);
  return (
    <group>
      <InstancedYardKit name="planter" items={planters} />
      <InstancedYardKit name="pot-large" items={pots} />
    </group>
  );
}
