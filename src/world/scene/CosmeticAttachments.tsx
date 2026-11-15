import { useFrame } from "@react-three/fiber";
import {
  cloneElement,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactElement,
} from "react";
import type { Group, MeshToonMaterial } from "three";
import { MeshBasicMaterial, BackSide } from "three";
import type { EquippedCosmetics } from "../../content/cosmetics";
import { cartoonMaterial } from "./toonStyle";

const INK = "#2a1612";

/** Solid piece with the StreetBody toon ramp, warm rim, and ink shell. */
function ToonPart({
  color,
  emissive,
  emissiveIntensity = 0,
  inflate = 0.04,
  position,
  rotation,
  children,
}: {
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  inflate?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  children: ReactElement;
}) {
  const mat = useMemo(
    () => cartoonMaterial({ color, emissive, emissiveIntensity }),
    [color, emissive, emissiveIntensity],
  );
  const ink = useMemo(
    () => new MeshBasicMaterial({ color: INK, side: BackSide }),
    [],
  );
  useEffect(
    () => () => {
      mat.dispose();
      ink.dispose();
    },
    [mat, ink],
  );
  return (
    <group position={position} rotation={rotation}>
      <mesh material={mat} castShadow>
        {children}
      </mesh>
      <mesh material={ink} scale={1 + inflate}>
        {cloneElement(children)}
      </mesh>
    </group>
  );
}

/** Visual attachments for equipped cosmetics. Positions assume a ~0.45 body radius. */
export function CosmeticAttachments({
  cosmetics,
  moving = false,
  movingRef,
  scale = 1,
  hatY,
  accessoryY,
  accessoryRadius,
}: {
  cosmetics?: EquippedCosmetics;
  moving?: boolean;
  movingRef?: MutableRefObject<boolean>;
  scale?: number;
  hatY?: number;
  accessoryY?: number;
  accessoryRadius?: number;
}) {
  if (!cosmetics) return null;
  return (
    <group scale={scale}>
      {cosmetics.hat ? <Hat id={cosmetics.hat} hatY={hatY} /> : null}
      {cosmetics.accessory ? (
        <Accessory
          id={cosmetics.accessory}
          y={accessoryY}
          radius={accessoryRadius}
        />
      ) : null}
      {cosmetics.trail ? (
        <Trail id={cosmetics.trail} moving={moving} movingRef={movingRef} />
      ) : null}
    </group>
  );
}

function Hat({ id, hatY }: { id: string; hatY?: number }) {
  const y = hatY ?? 0.62;
  if (id === "hat-antenna") return <GlowAntenna y={y} />;
  if (id === "hat-stardust") return <NeonHalo y={y} />;
  if (id === "hat-leaf") return <FernCap y={y} />;
  if (id === "hat-comet") return <CometPin y={y} />;
  if (id === "hat-beanie") return <NightBeanie y={y} />;
  if (id === "hat-cap") return <BlockCap y={y} />;
  if (id === "hat-bucket") return <LotBucket y={y} />;
  if (id === "hat-phones") return <YardCans y={y} />;
  return <StreetRibbon y={y} />;
}

function StreetRibbon({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <ToonPart color="#2a2428" position={[0, 0.08, 0]}>
        <sphereGeometry args={[0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </ToonPart>
      <ToonPart color="#ff4d00" position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.205, 0.21, 0.045, 16]} />
      </ToonPart>
      <ToonPart
        color="#f5f5f0"
        position={[0.16, 0.02, 0.08]}
        rotation={[0.2, 0.3, 0.7]}
      >
        <boxGeometry args={[0.16, 0.035, 0.07]} />
      </ToonPart>
      <ToonPart
        color="#f5f5f0"
        position={[0.16, 0.02, -0.02]}
        rotation={[0.1, -0.4, -0.5]}
      >
        <boxGeometry args={[0.14, 0.035, 0.06]} />
      </ToonPart>
      <ToonPart color="#ff4d00" position={[0.12, 0.02, 0.03]}>
        <sphereGeometry args={[0.035, 10, 8]} />
      </ToonPart>
    </group>
  );
}

function GlowAntenna({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <ToonPart color="#1c1c22" position={[0, 0.04, 0]}>
        <sphereGeometry args={[0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </ToonPart>
      <ToonPart color="#d7dde8" position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.028, 0.034, 0.28, 8]} />
      </ToonPart>
      <ToonPart color="#3a4250" position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.03, 10]} />
      </ToonPart>
      <ToonPart
        color="#9be7ff"
        emissive="#4aa7ff"
        emissiveIntensity={0.7}
        position={[0, 0.36, 0]}
      >
        <sphereGeometry args={[0.09, 14, 12]} />
      </ToonPart>
    </group>
  );
}

function NeonHalo({ y }: { y: number }) {
  return (
    <group position={[0, y + 0.08, 0]}>
      <ToonPart
        color="#ffe08a"
        emissive="#ffb020"
        emissiveIntensity={0.45}
        rotation={[Math.PI / 2.4, 0.2, 0]}
        inflate={0.04}
      >
        <torusGeometry args={[0.26, 0.045, 10, 24]} />
      </ToonPart>
      <ToonPart
        color="#fff4c8"
        emissive="#ffd36a"
        emissiveIntensity={0.55}
        position={[0.18, 0.08, 0]}
      >
        <octahedronGeometry args={[0.07, 0]} />
      </ToonPart>
    </group>
  );
}

function FernCap({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <ToonPart color="#2d4a32" position={[0, 0.07, 0]}>
        <sphereGeometry args={[0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </ToonPart>
      <ToonPart color="#6a8f4a" position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.2, 0.205, 0.04, 14]} />
      </ToonPart>
      {(
        [
          [-0.1, 0.16, 0.04, 0.4],
          [0.08, 0.18, -0.02, -0.3],
          [0.0, 0.2, 0.08, 0.1],
        ] as const
      ).map(([x, ly, z, tilt], i) => (
        <ToonPart
          key={i}
          color={i === 1 ? "#8fbf62" : "#3f7d4a"}
          position={[x, ly, z]}
          rotation={[tilt, 0, tilt]}
        >
          <sphereGeometry args={[0.07, 8, 6]} />
        </ToonPart>
      ))}
    </group>
  );
}

function CometPin({ y }: { y: number }) {
  return (
    <group position={[0.12, y - 0.02, 0.12]} rotation={[0.4, 0.6, -0.8]}>
      <ToonPart
        color="#ff4d00"
        emissive="#ff6a1a"
        emissiveIntensity={0.4}
        position={[0, 0.08, 0]}
      >
        <sphereGeometry args={[0.055, 12, 10]} />
      </ToonPart>
      <ToonPart color="#ffd2a8" position={[0, -0.06, 0]} rotation={[0, 0, 0.2]}>
        <coneGeometry args={[0.04, 0.16, 8]} />
      </ToonPart>
    </group>
  );
}

function NightBeanie({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <ToonPart color="#1c1c22" position={[0, 0.1, 0]}>
        <sphereGeometry
          args={[0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.7]}
        />
      </ToonPart>
      <ToonPart color="#ff4d00" position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.205, 0.05, 16]} />
      </ToonPart>
      <ToonPart color="#f5f5f0" position={[0.02, 0.16, 0.04]}>
        <sphereGeometry args={[0.035, 8, 8]} />
      </ToonPart>
    </group>
  );
}

function BlockCap({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <ToonPart color="#141418" position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.16, 0.17, 0.12, 16]} />
      </ToonPart>
      <ToonPart color="#141418" position={[0, 0.14, 0]}>
        <sphereGeometry args={[0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </ToonPart>
      <ToonPart
        color="#2a2a30"
        position={[0, 0.02, 0.12]}
        rotation={[0.15, 0, 0]}
      >
        <boxGeometry args={[0.28, 0.025, 0.16]} />
      </ToonPart>
      <ToonPart color="#ff4d00" position={[0, 0.08, 0.16]}>
        <boxGeometry args={[0.08, 0.04, 0.012]} />
      </ToonPart>
    </group>
  );
}

function LotBucket({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <ToonPart color="#e8d7b0" position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.12, 16]} />
      </ToonPart>
      <ToonPart
        color="#f4ead0"
        position={[0, 0.02, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.28, 0.28, 0.02, 20]} />
      </ToonPart>
      <ToonPart color="#ff4d00" position={[0, 0.08, 0]}>
        <torusGeometry args={[0.17, 0.012, 8, 20]} />
      </ToonPart>
    </group>
  );
}

function YardCans({ y }: { y: number }) {
  return (
    <group position={[0, y - 0.22, 0]}>
      <ToonPart color="#1c1c22">
        <torusGeometry args={[0.2, 0.022, 8, 20, Math.PI]} />
      </ToonPart>
      {([-0.2, 0.2] as const).map((x) => (
        <ToonPart
          key={x}
          color="#2a2a30"
          position={[x, 0, 0.02]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.078, 0.078, 0.055, 12]} />
        </ToonPart>
      ))}
      {([-0.2, 0.2] as const).map((x) => (
        <ToonPart
          key={`pad-${x}`}
          color="#ff4d00"
          position={[x * 0.86, 0, 0.03]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.045, 0.045, 0.016, 10]} />
        </ToonPart>
      ))}
    </group>
  );
}

function Accessory({
  id,
  y,
  radius,
}: {
  id: string;
  y?: number;
  radius?: number;
}) {
  if (id === "frame-chain") return <CurbChain y={y} />;
  if (id === "frame-hoops") return <SignalHoops y={y} />;
  if (id === "frame-shades") return <BlockShades y={y} />;
  const aurora = id === "frame-aurora";
  const ring = radius ?? 0.34;
  return (
    <group position={[0, y ?? 0.32, 0]}>
      <ToonPart
        color={aurora ? "#7fd0ff" : "#e8b15a"}
        emissive={aurora ? "#3aa0ff" : "#8a5a18"}
        emissiveIntensity={aurora ? 0.4 : 0.18}
        rotation={[Math.PI / 2.2, 0, 0]}
        inflate={0.045}
      >
        <torusGeometry args={[ring, aurora ? 0.028 : 0.034, 10, 28]} />
      </ToonPart>
      {aurora ? (
        <ToonPart
          color="#d7b4ff"
          emissive="#9a6aff"
          emissiveIntensity={0.35}
          rotation={[Math.PI / 2, 0.4, 0.2]}
          inflate={0.04}
        >
          <torusGeometry args={[ring * 0.86, 0.018, 8, 24]} />
        </ToonPart>
      ) : (
        [-0.7, 0, 0.7].map((angle) => (
          <ToonPart
            key={angle}
            color="#fff1c9"
            position={[Math.sin(angle) * ring, -0.02, Math.cos(angle) * ring]}
          >
            <sphereGeometry args={[0.028, 8, 8]} />
          </ToonPart>
        ))
      )}
    </group>
  );
}

/** Grip for an equipped pick. Parent this to the StreetBody `held` hand anchor. */
export function HeldPick({ id }: { id: string }) {
  const crystal = id === "tool-pick-crystal";
  const aether = id === "tool-pick-aether";
  const wood = id === "tool-pick-wood";
  const head = crystal
    ? "#9be7ff"
    : aether
      ? "#e4c6ff"
      : wood
        ? "#d7b48a"
        : "#d5dbe3";
  const handle = wood ? "#6b4a2a" : "#3a342e";
  const glow = crystal || aether;
  return (
    <group>
      <ToonPart color={handle} position={[0, 0.16, 0.02]}>
        <cylinderGeometry args={[0.026, 0.03, 0.36, 8]} />
      </ToonPart>
      <ToonPart color="#c4a574" position={[0, 0.22, 0.02]}>
        <cylinderGeometry args={[0.034, 0.034, 0.05, 8]} />
      </ToonPart>
      <ToonPart
        color={head}
        emissive={glow ? head : undefined}
        emissiveIntensity={glow ? 0.4 : 0}
        position={[0.01, 0.34, 0.04]}
        rotation={[0.4, 0.1, 0.5]}
      >
        <boxGeometry args={[0.18, 0.05, 0.07]} />
      </ToonPart>
      <ToonPart
        color={head}
        emissive={glow ? head : undefined}
        emissiveIntensity={glow ? 0.25 : 0}
        position={[0.1, 0.36, 0.05]}
        rotation={[0.5, 0, 0.9]}
      >
        <coneGeometry args={[0.035, 0.1, 6]} />
      </ToonPart>
    </group>
  );
}

function CurbChain({ y }: { y?: number }) {
  const beads = [-0.9, -0.45, 0, 0.45, 0.9];
  return (
    <group position={[0, (y ?? 0.32) - 0.08, 0]}>
      {beads.map((angle) => (
        <ToonPart
          key={angle}
          color="#e8b15a"
          emissive="#8a5a18"
          emissiveIntensity={0.15}
          position={[
            Math.sin(angle) * 0.22,
            -Math.cos(angle) * 0.04,
            Math.cos(angle) * 0.16,
          ]}
        >
          <sphereGeometry args={[0.035, 10, 8]} />
        </ToonPart>
      ))}
    </group>
  );
}

function SignalHoops({ y }: { y?: number }) {
  return (
    <group position={[0, (y ?? 0.32) + 0.39, 0.02]}>
      {([-0.22, 0.22] as const).map((x) => (
        <ToonPart
          key={x}
          color="#d7dde8"
          emissive="#8aa0b8"
          emissiveIntensity={0.12}
          position={[x, 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <torusGeometry args={[0.07, 0.014, 8, 18]} />
        </ToonPart>
      ))}
    </group>
  );
}

function BlockShades({ y }: { y?: number }) {
  return (
    <group position={[0, (y ?? 0.32) + 0.4, 0.2]}>
      <ToonPart color="#141418" position={[0, 0, 0]}>
        <boxGeometry args={[0.34, 0.016, 0.016]} />
      </ToonPart>
      {([-0.1, 0.1] as const).map((x) => (
        <ToonPart key={x} color="#1c2430" position={[x, -0.02, 0.012]}>
          <boxGeometry args={[0.15, 0.07, 0.016]} />
        </ToonPart>
      ))}
      <ToonPart
        color="#7fd0ff"
        emissive="#3aa0ff"
        emissiveIntensity={0.25}
        position={[-0.1, -0.02, 0.022]}
      >
        <boxGeometry args={[0.1, 0.04, 0.008]} />
      </ToonPart>
      <ToonPart
        color="#ff4d00"
        emissive="#ff6a1a"
        emissiveIntensity={0.2}
        position={[0.1, -0.02, 0.022]}
      >
        <boxGeometry args={[0.1, 0.04, 0.008]} />
      </ToonPart>
    </group>
  );
}

function Trail({
  id,
  moving,
  movingRef,
}: {
  id: string;
  moving: boolean;
  movingRef?: MutableRefObject<boolean>;
}) {
  const group = useRef<Group>(null);
  const crystal = id === "tool-pick-crystal";
  const aether = id === "tool-pick-aether";
  const color = crystal ? "#9be7ff" : aether ? "#e4c6ff" : "#ffb089";
  const emissive = crystal ? "#5ad0ff" : aether ? "#b48aff" : "#ff4d00";
  const mats = useMemo(() => {
    return [0, 1, 2].map((i) =>
      cartoonMaterial({
        color,
        emissive,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.55 - i * 0.14,
      }),
    );
  }, [color, emissive]);
  useEffect(() => () => mats.forEach((mat) => mat.dispose()), [mats]);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const isMoving = movingRef?.current ?? moving;
    group.current.children.forEach((child, i) => {
      child.position.y = 0.14 + Math.sin(t * 4 + i) * (isMoving ? 0.08 : 0.03);
      const mat = (child as { material?: MeshToonMaterial }).material;
      if (mat) mat.opacity = isMoving ? 0.6 - i * 0.16 : 0.22;
    });
  });
  return (
    <group ref={group} position={[0, 0.08, -0.38]}>
      {mats.map((mat, i) => (
        <mesh key={i} position={[0, 0, -0.16 * i]} material={mat}>
          <sphereGeometry args={[0.08 - i * 0.016, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}
