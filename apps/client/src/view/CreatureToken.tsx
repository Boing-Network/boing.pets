import { useMemo } from "react";
import {
  Action,
  ActionTargetKind,
  type CreatureView,
  type TerritoryView,
} from "@boing-pets/contract";
import { layoutForSlug } from "./layout";
import { lerp, relocateProgress, tokenOffset } from "./presentation";
import { colorForSpecies } from "./species-colors";

type Props = {
  creature: CreatureView;
  worldSeed: number;
  viewTick: number;
  territoriesById: Map<number, TerritoryView>;
  selected: boolean;
  onSelect: (creatureId: number) => void;
};

function territoryCenter(territory: TerritoryView | undefined): {
  x: number;
  z: number;
  visualRadius: number;
} {
  if (!territory) {
    return { x: 0, z: 0, visualRadius: 2 };
  }
  const layout = layoutForSlug(territory.slug);
  return {
    x: layout.x,
    z: layout.z,
    visualRadius: layout.visualRadius,
  };
}

export function CreatureToken({
  creature,
  worldSeed,
  viewTick,
  territoriesById,
  selected,
  onSelect,
}: Props) {
  const home = territoriesById.get(creature.territoryId);
  const homeCenter = territoryCenter(home);
  const offset = useMemo(
    () => tokenOffset(worldSeed, creature.id, homeCenter.visualRadius * 0.72),
    [worldSeed, creature.id, homeCenter.visualRadius],
  );

  let x = homeCenter.x + offset.x;
  let z = homeCenter.z + offset.z;

  if (
    creature.currentAction === Action.RELOCATE &&
    creature.actionTargetKind === ActionTargetKind.TERRITORY &&
    creature.actionTargetId != null
  ) {
    const destination = territoriesById.get(creature.actionTargetId);
    const destCenter = territoryCenter(destination);
    const destOffset = tokenOffset(
      worldSeed,
      creature.id,
      destCenter.visualRadius * 0.72,
    );
    const t = relocateProgress(
      viewTick,
      creature.actionStartedTick,
      creature.actionEndsTick,
    );
    const fromX = homeCenter.x + offset.x;
    const fromZ = homeCenter.z + offset.z;
    const toX = destCenter.x + destOffset.x;
    const toZ = destCenter.z + destOffset.z;
    x = lerp(fromX, toX, t);
    z = lerp(fromZ, toZ, t);
  }

  const color = colorForSpecies(creature.speciesId);

  return (
    <group
      position={[x, 0.22, z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(creature.id);
      }}
      onPointerDown={(event) => {
        // Prefer pointer-down so OrbitControls does not steal the selection.
        event.stopPropagation();
        onSelect(creature.id);
      }}
    >
      {/* Larger invisible hit target for reliable picking. */}
      <mesh visible={false}>
        <sphereGeometry args={[0.45, 12, 12]} />
        <meshBasicMaterial />
      </mesh>
      <mesh castShadow>
        <sphereGeometry args={[selected ? 0.2 : 0.16, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={selected ? color : "#000000"}
          emissiveIntensity={selected ? 0.25 : 0}
          roughness={0.45}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}
