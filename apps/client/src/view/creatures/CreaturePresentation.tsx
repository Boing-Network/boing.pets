import { skinForSpecies, type CreatureSkinId } from "../species-skins";
import { FireFoxMesh } from "./FireFoxMesh";
import { LanternMothMesh } from "./LanternMothMesh";
import { MossStagMesh } from "./MossStagMesh";

type Props = {
  speciesId: number;
  selected: boolean;
};

function meshForSkin(
  skinId: CreatureSkinId,
  speciesId: number,
  selected: boolean,
) {
  const palette = skinForSpecies(speciesId);
  switch (skinId) {
    case "fire-fox":
      return <FireFoxMesh palette={palette} selected={selected} />;
    case "moss-stag":
      return <MossStagMesh palette={palette} selected={selected} />;
    case "lantern-moth":
      return <LanternMothMesh palette={palette} selected={selected} />;
  }
}

/** Picks the readable creature mesh for a kernel species id. */
export function CreaturePresentation({ speciesId, selected }: Props) {
  const palette = skinForSpecies(speciesId);
  return meshForSkin(palette.id, speciesId, selected);
}
