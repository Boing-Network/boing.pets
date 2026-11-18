import { useFrame } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { CreatureStatus, type CreatureView } from "@boing-pets/contract";
import { useUiStore } from "../../state/uiStore";
import { useWorldViewStore } from "../../state/worldViewStore";
import { CreatureToken } from "../CreatureToken";
import { Backdrop } from "./Backdrop";
import { CameraRig } from "./CameraRig";
import { Flora } from "./Flora";
import { layoutFlora } from "./flora-placement";
import { GlowPoints } from "./GlowPoints";
import { Sky } from "./Sky";
import { Terrain } from "./Terrain";
import { TerritoryMarkers } from "./TerritoryMarkers";
import { Water } from "./Water";
import { worldTime } from "./gfx";
import { buildWorldModel, worldModelKey } from "./world-model";

/**
 * One continuous night landscape: terrain, water, flora and the living
 * creatures. Built only from the host's territory graph and seed.
 */
export function WorldScene() {
  const view = useWorldViewStore((s) => s.view);
  const selectedCreatureId = useUiStore((s) => s.selectedCreatureId);
  const selectCreature = useUiStore((s) => s.selectCreature);
  const [shadowFocus, setShadowFocus] = useState({ x: 0, y: 1, z: 0 });
  const [creatureFocus, setCreatureFocus] = useState<{
    x: number;
    y: number;
    z: number;
  } | null>(null);

  const worldSeed = view?.world.seed ?? null;
  const territories = view?.territories;
  const links = view?.links;
  const modelKey =
    worldSeed != null && territories && links
      ? worldModelKey({ seed: worldSeed, territories, links })
      : null;

  // Rebuild only when the graph itself changes, not every tick.
  const model = useMemo(() => {
    if (worldSeed == null || !territories || !links || !modelKey) return null;
    return buildWorldModel({ seed: worldSeed, territories, links });
  }, [worldSeed, territories, links, modelKey]);

  const flora = useMemo(() => (model ? layoutFlora(model) : null), [model]);

  useFrame((_, delta) => {
    worldTime.value += Math.min(delta, 0.05);
    // Demo / media helper for framing the selected creature.
    (
      window as unknown as {
        __livingPetsFocus?: { x: number; y: number; z: number } | null;
      }
    ).__livingPetsFocus = creatureFocus;
  });

  if (!view || !model || !flora) return null;

  const territoriesById = new Map(
    view.territories.map((t) => [t.id, t] as const),
  );
  const living: CreatureView[] = view.creatures.filter(
    (c) => c.status === CreatureStatus.ALIVE,
  );

  return (
    <>
      <Sky focus={shadowFocus} />
      <Terrain model={model} />
      <Water model={model} />
      <Flora layout={flora} />
      <GlowPoints layout={flora} />
      <TerritoryMarkers model={model} />
      <Backdrop model={model} />

      {living.map((creature) => (
        <CreatureToken
          key={creature.id}
          creature={creature}
          worldSeed={view.world.seed}
          viewTick={view.world.lastTick}
          territoriesById={territoriesById}
          model={model}
          selected={selectedCreatureId === creature.id}
          onSelect={selectCreature}
          onFocus={
            selectedCreatureId === creature.id ? setCreatureFocus : undefined
          }
        />
      ))}

      <CameraRig
        model={model}
        focus={selectedCreatureId == null ? null : creatureFocus}
        onTarget={setShadowFocus}
      />
    </>
  );
}
