import type { RefObject } from "react";
import { SPECIES_CATALOG, type SpeciesBodyPlan } from "@boing-pets/contract";
import { skinForSpecies, type CreatureSkinId } from "../species-skins";
import type { CreaturePose } from "../motion/pose";
import { CragRamMesh } from "./CragRamMesh";
import { FireFoxMesh } from "./FireFoxMesh";
import { GlowTortoiseMesh } from "./GlowTortoiseMesh";
import { LanternMothMesh } from "./LanternMothMesh";
import { MoonHareMesh } from "./MoonHareMesh";
import { MossStagMesh } from "./MossStagMesh";
import { ThistleHogMesh } from "./ThistleHogMesh";

type Props = {
  speciesId: number;
  selected: boolean;
  pose: RefObject<CreaturePose>;
};

/** Hand-built mesh for each body plan until every species has its own. */
const MESH_FOR_BODY_PLAN: Record<SpeciesBodyPlan, CreatureSkinId> = {
  canid: "fire-fox",
  felid: "fire-fox",
  cervid: "moss-stag",
  heron: "moss-stag",
  bovid: "crag-ram",
  lagomorph: "moon-hare",
  rodent: "moon-hare",
  mustelid: "thistle-hog",
  suid: "thistle-hog",
  chelonian: "glow-tortoise",
  urodele: "glow-tortoise",
  moth: "lantern-moth",
  bat: "lantern-moth",
  owl: "lantern-moth",
  nightjar: "lantern-moth",
};

const BODY_PLAN_BY_ID: ReadonlyMap<number, SpeciesBodyPlan> = new Map(
  SPECIES_CATALOG.map((row) => [row.id, row.bodyPlan]),
);

/** Which hand-built mesh draws a species (its own, or its body plan's). */
export function meshSkinForSpecies(speciesId: number): CreatureSkinId {
  const own = skinForSpecies(speciesId).id;
  const plan = BODY_PLAN_BY_ID.get(speciesId);
  if (plan == null) return own;
  return MESH_FOR_BODY_PLAN[plan];
}

function meshForSkin(
  skinId: CreatureSkinId,
  speciesId: number,
  selected: boolean,
  pose: RefObject<CreaturePose>,
) {
  const palette = skinForSpecies(speciesId);
  switch (skinId) {
    case "fire-fox":
      return <FireFoxMesh palette={palette} selected={selected} pose={pose} />;
    case "moss-stag":
      return <MossStagMesh palette={palette} selected={selected} pose={pose} />;
    case "lantern-moth":
      return (
        <LanternMothMesh palette={palette} selected={selected} pose={pose} />
      );
    case "glow-tortoise":
      return (
        <GlowTortoiseMesh palette={palette} selected={selected} pose={pose} />
      );
    case "moon-hare":
      return <MoonHareMesh palette={palette} selected={selected} pose={pose} />;
    case "crag-ram":
      return <CragRamMesh palette={palette} selected={selected} pose={pose} />;
    case "thistle-hog":
      return (
        <ThistleHogMesh palette={palette} selected={selected} pose={pose} />
      );
    default:
      return null;
  }
}

/** Picks the readable creature mesh for a kernel species id. */
export function CreaturePresentation({ speciesId, selected, pose }: Props) {
  return meshForSkin(meshSkinForSpecies(speciesId), speciesId, selected, pose);
}
