import { useEffect, useMemo } from "react";
import {
  Action,
  ActionTargetKind,
  type CreatureView,
  type TerritoryView,
} from "@boing-pets/contract";
import { CreaturePresentation } from "./creatures/CreaturePresentation";
import { layoutForTerritory } from "./layout";
import { lerp, relocateProgress, tokenOffset } from "./presentation";
import { skinForSpecies } from "./species-skins";
import type { WorldModel } from "./world/world-model";

type Props = {
  creature: CreatureView;
  worldSeed: number;
  viewTick: number;
  territoriesById: Map<number, TerritoryView>;
  model: WorldModel;
  selected: boolean;
  onSelect: (creatureId: number) => void;
  /** Reports the token's world point so the camera can ease toward it. */
  onFocus?: (point: { x: number; y: number; z: number }) => void;
};

function territoryHome(
  territory: TerritoryView | undefined,
  model: WorldModel,
): { x: number; z: number; visualRadius: number } {
  if (!territory) {
    return { x: 0, z: 0, visualRadius: 24 };
  }
  const layout = layoutForTerritory(territory.id, territory.slug, model);
  return {
    x: layout.x,
    z: layout.z,
    visualRadius: layout.visualRadius,
  };
}

/**
 * Presentation placement. PR 1 keeps tokens at a stable shore offset inside
 * their territory; PR 2 will drive motion from the creature's goal/action.
 */
export function CreatureToken({
  creature,
  worldSeed,
  viewTick,
  territoriesById,
  model,
  selected,
  onSelect,
  onFocus,
}: Props) {
  const home = territoriesById.get(creature.territoryId);
  const homeCenter = territoryHome(home, model);
  const offset = useMemo(
    () => tokenOffset(worldSeed, creature.id, homeCenter.visualRadius * 0.42),
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
    const destCenter = territoryHome(destination, model);
    const destOffset = tokenOffset(
      worldSeed,
      creature.id,
      destCenter.visualRadius * 0.42,
    );
    const t = relocateProgress(
      viewTick,
      creature.actionStartedTick,
      creature.actionEndsTick,
    );
    x = lerp(homeCenter.x + offset.x, destCenter.x + destOffset.x, t);
    z = lerp(homeCenter.z + offset.z, destCenter.z + destOffset.z, t);
  }

  // Keep standing creatures on dry ground near water rather than mid-channel.
  const water = model.waterDistAt(x, z);
  if (water < 0.6) {
    const region = model.regionByTerritoryId.get(creature.territoryId);
    const away = region
      ? {
          x: x - region.center.x - region.waterSide.x * region.radius,
          z: z - region.center.z - region.waterSide.z * region.radius,
        }
      : { x: x - homeCenter.x, z: z - homeCenter.z };
    const len = Math.hypot(away.x, away.z) || 1;
    const push = 0.8 - water;
    x += (away.x / len) * push;
    z += (away.z / len) * push;
  }

  const ground = model.heightAt(x, z);
  const skin = skinForSpecies(creature.speciesId);
  // Moths hover; foxes and stags stand on the shore.
  const y = skin.id === "lantern-moth" ? ground + 1.4 : ground + 0.02;

  useEffect(() => {
    onFocus?.({ x, y, z });
  }, [onFocus, x, y, z]);

  return (
    <group
      position={[x, y, z]}
      scale={5.2}
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
