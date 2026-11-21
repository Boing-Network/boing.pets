import { Text } from "@react-three/drei";
import { useMemo } from "react";
import { Color, DoubleSide, RingGeometry, type BufferGeometry } from "three";
import { merge, part } from "./flora-geometry";
import type { TerritoryView } from "@boing-pets/contract";
import { territoryOverlayLine } from "./territory-overlay";
import type { WorldModel } from "./world-model";

function softRing(): BufferGeometry {
  return merge([
    part(new RingGeometry(0.82, 1, 48), {
      color: "#ffffff",
      rotate: [-Math.PI / 2, 0, 0],
      shade: [1, 1],
      upNormals: true,
    }),
  ]);
}

/**
 * Territory names and soft ground rings. Identity stays on the territory
 * graph; these are presentation landmarks only.
 */
export function TerritoryMarkers({
  model,
  territories,
  tick = 0,
}: {
  model: WorldModel;
  /** M22: active effects and gather stock, drawn as a line under the name. */
  territories?: ReadonlyMap<number, TerritoryView>;
  tick?: number;
}) {
  const ring = useMemo(() => softRing(), []);
  return (
    <group>
      {model.regions.map((region) => {
        const { x, z } = region.center;
        const y = model.heightAt(x, z) + 0.08;
        const color = new Color(region.biome.glow);
        const overlay = territoryOverlayLine(
          territories?.get(region.territoryId),
          tick,
        );
        return (
          <group key={region.territoryId} position={[x, y, z]}>
            <mesh
              geometry={ring}
              scale={[region.radius * 0.55, 1, region.radius * 0.55]}
            >
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.28}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 0.02, 0]} geometry={ring} scale={[6.2, 1, 6.2]}>
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.55}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <Text
              position={[0, 0.35, 0]}
              fontSize={2.4}
              color={region.biome.label}
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.08}
              outlineColor="#041018"
              fillOpacity={0.95}
            >
              {region.name}
            </Text>
            {overlay ? (
              <Text
                position={[0, 0.2, 0]}
                fontSize={1.1}
                color="#f3e7c4"
                anchorX="center"
                anchorY="top"
                outlineWidth={0.05}
                outlineColor="#041018"
                fillOpacity={0.9}
              >
                {overlay}
              </Text>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}
