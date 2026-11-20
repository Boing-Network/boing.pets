import type { RefObject } from "react";
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
  }
}

/** Picks the readable creature mesh for a kernel species id. */
export function CreaturePresentation({ speciesId, selected, pose }: Props) {
  const palette = skinForSpecies(speciesId);
  return meshForSkin(palette.id, speciesId, selected, pose);
}
