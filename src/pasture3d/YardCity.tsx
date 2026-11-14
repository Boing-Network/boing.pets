/** Street-level city district: roads, lights, filler buildings, and parks. */

import "@react-three/fiber";
import { useMemo } from "react";
import { YARD } from "./yardChrome";
import {
  CITY_PARK_TREES,
  cityFillerBuildings,
  cityRoadTiles,
  cityStreetLights,
  cityTrafficLights,
  type CityKitInstance,
} from "./cityLayout";
import { InstancedYardKit, type YardKitInstance } from "./yardKitLoader";

function asInstances(items: readonly CityKitInstance[]): YardKitInstance[] {
  return items.map((item) => ({
    position: item.position,
    rotationY: item.rotationY,
    scale: item.scale,
  }));
}

function groupByName(
  items: readonly CityKitInstance[],
): Record<string, YardKitInstance[]> {
  const groups: Record<string, YardKitInstance[]> = {};
  for (const item of items) {
    const list = groups[item.name] ?? [];
    list.push({
      position: item.position,
      rotationY: item.rotationY,
      scale: item.scale,
    });
    groups[item.name] = list;
  }
  return groups;
}

export function YardCity({ preferPerf }: { preferPerf: boolean }) {
  const roads = useMemo(() => groupByName(cityRoadTiles()), []);
  const lights = useMemo(
    () =>
      asInstances(
        preferPerf
          ? cityStreetLights().filter((_, i) => i % 2 === 0)
          : cityStreetLights(),
      ),
    [preferPerf],
  );
  const signals = useMemo(
    () => asInstances(preferPerf ? [] : cityTrafficLights()),
    [preferPerf],
  );
  const buildings = useMemo(() => groupByName(cityFillerBuildings()), []);
  const trees = useMemo(
    () =>
      CITY_PARK_TREES.map(([x, z], i) => ({
        position: [x, 0, z] as [number, number, number],
        rotationY: i * 0.7,
        scale: 3.4,
      })),
    [],
  );

  return (
    <group>
      <mesh
        position={[-16, 0.03, -26]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[7.4, 20]} />
        <meshStandardMaterial color={YARD.foliage} roughness={0.9} />
      </mesh>
      <mesh
        position={[10, 0.03, -18]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[5.2, 18]} />
        <meshStandardMaterial color={YARD.foliage} roughness={0.9} />
      </mesh>
      {Object.entries(roads).map(([name, items]) => (
        <InstancedYardKit key={`road-${name}`} name={name} items={items} />
      ))}
      <InstancedYardKit name="street-light" items={lights} />
      {signals.length ? (
        <InstancedYardKit name="traffic-light" items={signals} />
      ) : null}
      {Object.entries(buildings).map(([name, items]) => (
        <InstancedYardKit key={`bldg-${name}`} name={name} items={items} />
      ))}
      <InstancedYardKit name="tree-detailed" items={trees} restyle={false} />
    </group>
  );
}
