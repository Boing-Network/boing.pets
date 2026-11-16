import type { EquippedCosmetics } from "../content/cosmetics";

export type PasturePet = {
  owner: string;
  hatch_tx?: string;
  traits: {
    species: string;
    hue: number;
    accent: number;
    antenna: number;
    spots: number;
    personality?: string;
    shape?: number;
  };
  state?: {
    status: string;
    stage?: string;
    streak?: number;
    xp?: number;
    adventureXp?: number;
    characterLevel?: number;
    characterPrestige?: number;
    characterXp?: number;
    hunger?: number;
    happiness?: number;
    energy?: number;
  };
  character?: {
    level: number;
    prestige: number;
    totalXp: number;
    careXp: number;
    adventureXp: number;
  };
  titles?: Array<{ code: string; title: string }>;
  gatherSkills?: Array<{
    id: string;
    name: string;
    level: number;
    prestige: number;
  }>;
  cosmetics?: EquippedCosmetics;
  mind?: { mood: string; suggestion: string; cues?: string[] };
  achievements?: unknown[];
};
