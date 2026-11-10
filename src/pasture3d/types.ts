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
  };
  cosmetics?: EquippedCosmetics;
  mind?: { mood: string; suggestion: string; cues?: string[] };
  achievements?: unknown[];
};
