import type { RefObject } from "react";
import { skinForSpecies, type CreatureSkinId } from "../species-skins";
import type { CreaturePose } from "../motion/pose";
import { FireFoxMesh } from "./FireFoxMesh";
import { LanternMothMesh } from "./LanternMothMesh";
import { MossStagMesh } from "./MossStagMesh";

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
  }
}

/** Picks the readable creature mesh for a kernel species id. */
export function CreaturePresentation({ speciesId, selected, pose }: Props) {
  const palette = skinForSpecies(speciesId);
  return meshForSkin(palette.id, speciesId, selected, pose);
}
