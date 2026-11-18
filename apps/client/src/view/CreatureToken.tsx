import { useMemo } from "react";
import {
  Action,
  ActionTargetKind,
  type CreatureView,
  type TerritoryView,
} from "@boing-pets/contract";
import { CreaturePresentation } from "./creatures/CreaturePresentation";
import { layoutForSlug } from "./layout";
import { lerp, relocateProgress, tokenOffset } from "./presentation";
import { skinForSpecies } from "./species-skins";

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
    () => tokenOffset(worldSeed, creature.id, homeCenter.visualRadius * 0.62),
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
      destCenter.visualRadius * 0.62,
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

  const skin = skinForSpecies(creature.speciesId);
  // Moths hover; foxes and stags stand on the shore.
  const y = skin.id === "lantern-moth" ? 0.55 : 0.02;

  return (
    <group
      position={[x, y, z]}
      scale={2.35}
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
        <sphereGeometry args={[0.7, 12, 12]} />
        <meshBasicMaterial />
      </mesh>
      {selected ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32, 0.4, 32]} />
          <meshBasicMaterial color={skin.emissive} transparent opacity={0.9} />
        </mesh>
      ) : null}
      <CreaturePresentation
        speciesId={creature.speciesId}
        selected={selected}
      />
    </group>
  );
}
