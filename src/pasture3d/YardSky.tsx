/** Peach dusk dome and a visible sun glow for The Yard. */

import { useMemo } from "react";
import * as THREE from "three";
import { publicPastureDay } from "./pastureDay";
import { makeSkyTexture } from "./yardChrome";

export function YardSky({ preferPerf = false }: { preferPerf?: boolean }) {
  const day = publicPastureDay();
  const map = useMemo(() => makeSkyTexture(), []);
  const sunPos = useMemo(() => {
    const v = new THREE.Vector3(day.sunX, day.sunY, day.sunZ).normalize();
    return v.multiplyScalar(130);
  }, [day.sunX, day.sunY, day.sunZ]);
  return (
    <group>
      <mesh rotation={[0, 0, 0]} frustumCulled={false}>
        <sphereGeometry args={[160, 24, 16]} />
        <meshBasicMaterial
          map={map ?? undefined}
          color={map ? "#ffffff" : day.background}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <mesh position={[sunPos.x, sunPos.y, sunPos.z]} frustumCulled={false}>
        <sphereGeometry args={[6.5, 16, 12]} />
        <meshBasicMaterial color="#fff3c8" fog={false} depthWrite={false} />
      </mesh>
      {preferPerf ? null : (
        <>
          <mesh position={[sunPos.x, sunPos.y, sunPos.z]} frustumCulled={false}>
            <sphereGeometry args={[14, 16, 12]} />
            <meshBasicMaterial
              color="#ffb060"
              transparent
              opacity={0.45}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              fog={false}
              side={THREE.BackSide}
            />
          </mesh>
          <mesh position={[sunPos.x, sunPos.y, sunPos.z]} frustumCulled={false}>
            <sphereGeometry args={[28, 16, 12]} />
            <meshBasicMaterial
              color="#ff8a3a"
              transparent
              opacity={0.22}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              fog={false}
              side={THREE.BackSide}
            />
          </mesh>
        </>
      )}
    </group>
  );
}
