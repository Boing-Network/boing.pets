import { state, traits, type AchievementCode, type Pet } from "../core";
import type { EquippedCosmetics } from "../content/cosmetics";

export type CharacterSheetProgress = {
  xp: number;
  level: number;
  prestige: number;
  virtual: number;
  xpAtLevel: number;
  xpAtNext: number;
  careXp: number;
  adventureXp: number;
  totalXp: number;
};

type CareState = ReturnType<typeof state>;

export type ViewPet = Pet & {
  traits: ReturnType<typeof traits>;
  state: CareState & {
    adventureXp?: number;
    characterLevel?: number;
    characterPrestige?: number;
    characterXp?: number;
    characterXpAtLevel?: number;
    characterXpAtNext?: number;
  };
  character?: CharacterSheetProgress;
  titles?: Array<{ code: string; title: string; unlocked_at: number }>;
  gatherSkills?: Array<{
    id: string;
    name: string;
    xp: number;
    level: number;
    prestige: number;
  }>;
  achievements?: Array<{
    code: AchievementCode;
    unlocked_at: number;
    title: string;
    description: string;
  }>;
  mind?: {
    mood: string;
    favoriteActivity: string;
    suggestion: string;
    cues: string[];
  };
  cosmetics?: EquippedCosmetics;
};
