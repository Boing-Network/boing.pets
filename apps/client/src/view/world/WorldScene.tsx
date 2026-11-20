import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CreatureStatus, type CreatureView } from "@boing-pets/contract";
import { useUiStore } from "../../state/uiStore";
import { useWorldViewStore } from "../../state/worldViewStore";
import { CreatureToken } from "../CreatureToken";
import { CreatureCrowd } from "../creatures/CreatureCrowd";
import { Backdrop } from "./Backdrop";
import { CameraRig } from "./CameraRig";
import { Flora } from "./Flora";
import { layoutFlora } from "./flora-placement";
import { GlowPoints } from "./GlowPoints";
import { PlayerMarkers } from "./PlayerMarkers";
import { Sky } from "./Sky";
import { Terrain } from "./Terrain";
import { TerritoryMarkers } from "./TerritoryMarkers";
import { Water } from "./Water";
import { worldTime } from "./gfx";
import { resolveWorldModel, type WorldModelCache } from "./world-model";

/**
 * One continuous night landscape: terrain, water, flora and the living
 * creatures. Built only from the host's territory graph and seed.
 */
export function WorldScene() {
  const view = useWorldViewStore((s) => s.view);
  const selectedCreatureId = useUiStore((s) => s.selectedCreatureId);
  const selectCreature = useUiStore((s) => s.selectCreature);
  const modelCache = useRef<WorldModelCache | null>(null);
  const orbitTarget = useRef({ x: 0, y: 1, z: 0 });
  const creatureFocus = useRef<{ x: number; y: number; z: number } | null>(
    null,
  );

  const worldInput =
    view == null
      ? null
      : {
          seed: view.world.seed,
          territories: view.territories,
          links: view.links,
        };
  const resolved = resolveWorldModel(modelCache.current, worldInput);
  modelCache.current = resolved;
  const model = resolved?.model ?? null;

  const flora = useMemo(() => (model ? layoutFlora(model) : null), [model]);

  useEffect(() => {
    if (selectedCreatureId == null) {
      creatureFocus.current = null;
    }
  }, [selectedCreatureId]);

  useFrame((_, delta) => {
    worldTime.value += Math.min(delta, 0.05);
    // Demo / media helper for framing the selected creature.
    (
      window as unknown as {
        __livingPetsFocus?: { x: number; y: number; z: number } | null;
      }
    ).__livingPetsFocus = creatureFocus.current;
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
      <Sky focusRef={orbitTarget} />
      <CreatureCrowd />
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
            selectedCreatureId === creature.id
              ? (point) => {
                  creatureFocus.current = point;
                }
              : undefined
          }
        />
      ))}

      <PlayerMarkers model={model} focus={orbitTarget} />

      <CameraRig
        model={model}
        focusId={selectedCreatureId}
        focusPoint={creatureFocus}
        orbitTarget={orbitTarget}
      />
    </>
  );
}
