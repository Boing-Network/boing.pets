/**
 * Character progression (Horizon A).
 *
 * Care XP + adventure XP feed one character level curve.
 * Gather skills stay on their own pools — never mix quarry/line/plot/sweep XP here.
 *
 * Uses the same OSRS XP table as gathering so players learn one curve.
 */

import type { Stage } from "../core";
import {
  GATHER_LEVEL_CAP,
  GATHER_VIRTUAL_LEVEL_CAP,
  levelsCrossed,
  skillProgress,
  type SkillProgress,
  xpToReach,
} from "./gathering";

/** Unlock / display cap for character level. Prestige past this is cosmetic only. */
export const CHARACTER_LEVEL_CAP = GATHER_LEVEL_CAP;
export const CHARACTER_VIRTUAL_LEVEL_CAP = GATHER_VIRTUAL_LEVEL_CAP;

export type CharacterProgress = SkillProgress & {
  /** Event-sourced care XP (hello / play / groom / feed / hatch). */
  careXp: number;
  /** Idle adventure XP bank. */
  adventureXp: number;
  /** careXp + adventureXp (never gather). */
  totalXp: number;
};

export function characterTotalXp(careXp: number, adventureXp: number): number {
  const care = Number.isFinite(careXp) && careXp > 0 ? Math.floor(careXp) : 0;
  const adventure =
    Number.isFinite(adventureXp) && adventureXp > 0
      ? Math.floor(adventureXp)
      : 0;
  return care + adventure;
}

/** Derive character level from care + adventure XP. */
export function characterProgress(
  careXp: number,
  adventureXp: number,
): CharacterProgress {
  const care = Number.isFinite(careXp) && careXp > 0 ? Math.floor(careXp) : 0;
  const adventure =
    Number.isFinite(adventureXp) && adventureXp > 0
      ? Math.floor(adventureXp)
      : 0;
  const totalXp = care + adventure;
  const base = skillProgress(totalXp);
  return {
    ...base,
    careXp: care,
    adventureXp: adventure,
    totalXp,
  };
}

export function characterLevelLabel(level: number, prestige = 0): string {
  if (prestige > 0) return `LEVEL P${prestige}`;
  return `LEVEL ${Math.max(1, Math.floor(level))}`;
}

export function characterLevelsCrossed(
  beforeTotalXp: number,
  afterTotalXp: number,
): Array<{ level: number; prestige: number; label: string }> {
  return levelsCrossed(beforeTotalXp, afterTotalXp).map((row) => ({
    level: row.level,
    prestige: row.prestige,
    label: characterLevelLabel(row.level, row.prestige),
  }));
}

export function characterXpBar(progress: CharacterProgress): {
  current: number;
  needed: number;
  ratio: number;
} {
  const span = Math.max(1, progress.xpAtNext - progress.xpAtLevel);
  const current = Math.max(0, progress.totalXp - progress.xpAtLevel);
  const needed =
    progress.virtual >= CHARACTER_VIRTUAL_LEVEL_CAP
      ? span
      : Math.max(1, progress.xpAtNext - progress.xpAtLevel);
  const ratio =
    progress.virtual >= CHARACTER_VIRTUAL_LEVEL_CAP
      ? 1
      : Math.max(0, Math.min(1, current / needed));
  return { current, needed, ratio };
}

const STAGE_LABELS: Record<Stage, string> = {
  egg: "Egg",
  baby: "Baby",
  child: "Child",
  teen: "Teen",
  adult: "Adult",
  elder: "Elder",
};

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "Baby";
  const key = stage.toLowerCase() as Stage;
  return STAGE_LABELS[key] || stage;
}

export function stageUpLabel(stage: string): string {
  return `STAGE UP · ${stageLabel(stage).toUpperCase()}`;
}

/** Re-export table helper for tests / docs. */
export { xpToReach };
