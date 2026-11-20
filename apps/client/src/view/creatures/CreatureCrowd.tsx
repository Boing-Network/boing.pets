/**
 * Far creatures, instanced: one draw call per species however many are far
 * away. Each far creature's root (already placed, yawed and scaled by its
 * token) is copied into the species' instance buffer every frame.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { InstancedMesh, type Group } from "three";
import { crowd } from "./anatomy/crowd";
import { creatureMembrane, creatureTime } from "./anatomy/material";
import { farBodyForSpecies } from "./anatomy/rig";

const CAPACITY = 256;

export function CreatureCrowd() {
  const meshes = useMemo(() => new Map<number, InstancedMesh>(), []);

  useEffect(() => {
    crowd.mounted += 1;
    return () => {
      crowd.mounted -= 1;
      for (const mesh of meshes.values()) mesh.dispose();
      meshes.clear();
    };
  }, [meshes]);

  const group = useRef<Group>(null);

  useFrame((state) => {
    creatureTime.value = state.clock.elapsedTime;
    const parent = group.current;
    if (!parent) return;
    for (const [speciesId, members] of crowd.bySpecies) {
      let mesh = meshes.get(speciesId);
      if (mesh == null) {
        if (members.size === 0) continue;
        mesh = new InstancedMesh(
          farBodyForSpecies(speciesId),
          creatureMembrane,
          CAPACITY,
        );
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        meshes.set(speciesId, mesh);
        parent.add(mesh);
      }
      let i = 0;
      for (const root of members) {
        if (i >= CAPACITY) break;
        mesh.setMatrixAt(i, root.matrixWorld);
        i += 1;
      }
      mesh.count = i;
      mesh.visible = i > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return <group ref={group} />;
}
