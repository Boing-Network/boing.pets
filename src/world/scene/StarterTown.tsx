import { Float } from "@react-three/drei";
import { WorldText } from "./WorldText";
import type { WorldLandmark, WorldZoneConfig } from "../config/zones";

function Landmark({ item, y = 0 }: { item: WorldLandmark; y?: number }) {
  const roofY = item.height + 0.35;
  return (
    <group position={[item.position.x, item.position.y + y, item.position.z]}>
      <mesh position={[0, item.height / 2, 0]}>
        <boxGeometry args={[item.width, item.height, item.depth]} />
        <meshStandardMaterial color={item.color} roughness={0.85} />
      </mesh>
      <mesh position={[0, roofY, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry
          args={[Math.max(item.width, item.depth) * 0.72, 1.4, 4]}
        />
        <meshStandardMaterial color="#5d7eb8" roughness={0.7} />
      </mesh>
      <WorldText
        position={[0, item.height + 1.8, 0]}
        fontSize={0.45}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        {item.label}
      </WorldText>
    </group>
  );
}

function PathRibbon({
  a,
  b,
  y = 0.03,
}: {
  a: { x: number; z: number };
  b: { x: number; z: number };
  y?: number;
}) {
  const midX = (a.x + b.x) / 2;
  const midZ = (a.z + b.z) / 2;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  return (
    <mesh position={[midX, y, midZ]} rotation={[-Math.PI / 2, 0, -angle]}>
      <planeGeometry args={[2.2, length]} />
      <meshStandardMaterial color="#d8c3a0" roughness={1} />
    </mesh>
  );
}

function Tree({ x, z, y = 0 }: { x: number; z: number; y?: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.18, 0.24, 1.4, 6]} />
        <meshStandardMaterial color="#7a5134" />
      </mesh>
      <mesh position={[0, 1.9, 0]}>
        <icosahedronGeometry args={[1.05, 0]} />
        <meshStandardMaterial color="#4f8f5b" flatShading />
      </mesh>
    </group>
  );
}

export function StarterTown({
  zone,
  hideGround = false,
  hideTrees = false,
  heightAt,
}: {
  zone: WorldZoneConfig;
  hideGround?: boolean;
  hideTrees?: boolean;
  heightAt?: (x: number, z: number) => number;
}) {
  const yAt = (x: number, z: number) => heightAt?.(x, z) ?? 0;
  const trees = [
    [-20, -12],
    [-18, 14],
    [18, -14],
    [20, 12],
    [-22, 2],
    [22, -2],
    [-6, 18],
    [8, 16],
  ] as const;

  return (
    <group>
      {hideGround ? null : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <circleGeometry args={[34, 48]} />
            <meshStandardMaterial color={zone.groundColor} roughness={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[10, 14, 48]} />
            <meshStandardMaterial color="#6fa06a" roughness={1} />
          </mesh>
        </>
      )}

      {zone.paths.map((path, i) => (
        <PathRibbon
          key={i}
          a={path[0]}
          b={path[1]}
          y={(yAt(path[0].x, path[0].z) + yAt(path[1].x, path[1].z)) / 2 + 0.03}
        />
      ))}

      {zone.landmarks.map((item) => (
        <Landmark
          key={item.id}
          item={item}
          y={yAt(item.position.x, item.position.z)}
        />
      ))}

      {zone.stations.map((station) => (
        <Float
          key={station.id}
          speed={1.4}
          rotationIntensity={0.2}
          floatIntensity={0.5}
        >
          <mesh
            position={[
              station.position.x,
              0.35 + yAt(station.position.x, station.position.z),
              station.position.z,
            ]}
          >
            <cylinderGeometry args={[0.55, 0.7, 0.25, 12]} />
            <meshStandardMaterial
              color={
                station.kind === "care"
                  ? "#7fa7ff"
                  : station.kind === "portal"
                    ? "#e0b15a"
                    : "#9ad7c2"
              }
              emissive={station.kind === "care" ? "#355f9a" : "#224433"}
              emissiveIntensity={0.35}
            />
          </mesh>
        </Float>
      ))}

      {hideTrees
        ? null
        : trees.map(([x, z], i) => <Tree key={i} x={x} z={z} y={yAt(x, z)} />)}

      <mesh position={[0, 0.2 + yAt(0, 8), 8]}>
        <boxGeometry args={[2.4, 0.15, 2.4]} />
        <meshStandardMaterial color="#cfdfff" />
      </mesh>
    </group>
  );
}
