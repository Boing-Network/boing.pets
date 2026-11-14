/** Old Oak stays the same tree, now planted in a circular roof well. */

import { PASTURE_ZONE } from "../world/config/zones";
import { meadowHeight } from "./meadowHeight";
import { PastureWorldText } from "./PastureWorldText";
import { YARD } from "./yardChrome";
import { yardLabelForLandmark } from "./yardLabels";
import { YardOakKit } from "./YardKits";
import * as THREE from "three";

export function YardOak({ preferPerf = false }: { preferPerf?: boolean }) {
  const oak = PASTURE_ZONE.landmarks.find((item) => item.id === "old-oak");
  if (!oak) return null;
  const x = oak.position.x;
  const z = oak.position.z;
  const y = meadowHeight(x, z);
  const label = yardLabelForLandmark("old-oak");
  const sides = preferPerf ? 7 : 10;
  return (
    <group position={[x, y, z]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.1, 0]}
        receiveShadow
      >
        <circleGeometry args={[2.15, 24]} />
        <meshStandardMaterial color={YARD.soil} roughness={1} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.04, 0]}
        receiveShadow
      >
        <ringGeometry args={[2.15, 2.7, 24]} />
        <meshStandardMaterial color={YARD.concreteDark} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.38, 0]} receiveShadow>
        <cylinderGeometry args={[2.65, 2.7, 0.76, 24, 1, true]} />
        <meshStandardMaterial
          color={YARD.concrete}
          roughness={0.92}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        position={[0, 0.78, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <torusGeometry args={[2.62, 0.1, 6, 24]} />
        <meshStandardMaterial color={YARD.ink} roughness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.82, 0]}>
        <ringGeometry args={[2.5, 2.74, 24]} />
        <meshStandardMaterial color={YARD.accent} roughness={0.5} />
      </mesh>
      <YardOakKit
        fallback={
          <>
            <mesh position={[0, 1.35, 0]} castShadow>
              <cylinderGeometry args={[0.22, 0.4, 2.6, sides]} />
              <meshStandardMaterial color={YARD.trunk} roughness={0.9} />
            </mesh>
            <mesh position={[0, 3.25, 0]} castShadow={!preferPerf}>
              <icosahedronGeometry args={[1.65, 0]} />
              <meshStandardMaterial
                color={YARD.foliage}
                roughness={0.85}
                flatShading
              />
            </mesh>
            {preferPerf ? null : (
              <>
                <mesh position={[0.7, 2.85, 0.25]} castShadow>
                  <icosahedronGeometry args={[1.05, 0]} />
                  <meshStandardMaterial
                    color="#4e8d55"
                    roughness={0.85}
                    flatShading
                  />
                </mesh>
                <mesh position={[-0.55, 3.0, -0.35]} castShadow>
                  <icosahedronGeometry args={[0.9, 0]} />
                  <meshStandardMaterial
                    color="#3a6e44"
                    roughness={0.85}
                    flatShading
                  />
                </mesh>
              </>
            )}
          </>
        }
      />
      <PastureWorldText
        position={[0, 5.15, 0]}
        fontSize={0.36}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}
