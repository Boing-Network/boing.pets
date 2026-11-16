import {
  COSMETIC_SLOT_LABELS,
  COSMETIC_SLOTS,
  type EquippedCosmetics,
} from "../../content/cosmetics";
import { itemDisplayName as catalogItemDisplayName } from "../../content/items";
import {
  characterLevelLabel,
  characterProgress,
  characterXpBar,
  stageLabel,
} from "../../content/character";
import type { CharacterSheetProgress, ViewPet } from "../appRuntime";

export type PublicPetInfo = {
  species: string;
  personality: string;
  stage: string;
};

export function isOwnBuddy(
  pet: { owner: string },
  owner: string | null | undefined,
): boolean {
  return !!owner && pet.owner === owner;
}

export function publicPetInfo(pet: {
  traits: { species: string; personality: string };
  state: { stage: string };
}): PublicPetInfo {
  return {
    species: pet.traits.species,
    personality: pet.traits.personality,
    stage: pet.state.stage,
  };
}

export function itemDisplayName(itemId: string): string {
  return catalogItemDisplayName(itemId);
}

export function equippedSummary(
  equipped: EquippedCosmetics | undefined,
  nameOf: (id: string) => string = itemDisplayName,
): string {
  const parts: string[] = [];
  for (const slot of COSMETIC_SLOTS) {
    const id = equipped?.[slot];
    if (!id) continue;
    parts.push(`${COSMETIC_SLOT_LABELS[slot]}: ${nameOf(id)}`);
  }
  return parts.length ? parts.join(" · ") : "Nothing equipped yet.";
}

export function buddyChipLabel(opts: {
  connected: boolean;
  hasPet: boolean;
  species?: string | null;
  level?: number | null;
  prestige?: number | null;
}): string {
  if (!opts.connected) return "Character";
  if (!opts.hasPet) return "Hatch";
  const species = opts.species || "Character";
  if (opts.level != null && opts.level > 0) {
    const short =
      opts.prestige && opts.prestige > 0
        ? `P${opts.prestige}`
        : `Lv ${opts.level}`;
    return `${species} · ${short}`;
  }
  return species;
}

export function resolveCharacterProgress(pet: {
  state: { xp?: number; adventureXp?: number };
  character?: CharacterSheetProgress | null;
}): CharacterSheetProgress {
  if (pet.character) return pet.character;
  const careXp = pet.state.xp || 0;
  const adventureXp = pet.state.adventureXp || 0;
  return characterProgress(careXp, adventureXp);
}

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
}

/** Character sheet markup for the Yard overlay / gallery cards. */
export function characterSheetHtml(
  pet: ViewPet,
  opts: { equippedLine?: string | null; own?: boolean } = {},
): string {
  const progress = resolveCharacterProgress(pet);
  const bar = characterXpBar(progress);
  const levelText = characterLevelLabel(progress.level, progress.prestige);
  const stage = stageLabel(pet.state.stage);
  const titles = (pet.titles || [])
    .slice(0, 4)
    .map((t) => `<span class="ach">${esc(t.title)}</span>`)
    .join("");
  const skills = (pet.gatherSkills || [])
    .map((s) => {
      const label =
        s.prestige > 0 ? `${s.name} P${s.prestige}` : `${s.name} ${s.level}`;
      return `<span class="character-skill">${esc(label)}</span>`;
    })
    .join("");
  const ownBadge = opts.own
    ? `<span class="sticker sticker-accent">YOUR CHARACTER</span>`
    : `<span class="sticker sticker-accent">${esc(pet.state.status.toUpperCase())}</span>`;
  const mind = pet.mind
    ? `<p class="mind"><b>${esc(pet.mind.mood)}</b> · ${esc(pet.mind.suggestion)}</p>`
    : "";
  const equipped = opts.equippedLine
    ? `<p class="small character-equipped">${esc(opts.equippedLine)}</p>`
    : "";
  return (
    `<div class="character-sheet">` +
    `<div class="card-head"><h3>${esc(pet.traits.species)}</h3>${ownBadge}</div>` +
    `<p class="subtle">${esc(pet.traits.personality)} · ${esc(stage)}</p>` +
    `<p class="character-level"><b>${esc(levelText)}</b>` +
    `<span class="subtle"> · ${progress.totalXp} XP</span></p>` +
    `<div class="character-xp" role="meter" aria-valuemin="0" aria-valuemax="${bar.needed}" aria-valuenow="${bar.current}" aria-label="Character XP">` +
    `<span style="width:${Math.round(bar.ratio * 100)}%"></span></div>` +
    `<p class="small character-xp-split">Care ${progress.careXp} · Adventure ${progress.adventureXp}</p>` +
    (skills
      ? `<div class="character-skills" aria-label="Gather skills">${skills}</div>`
      : "") +
    (titles ? `<div class="ach-row" aria-label="Titles">${titles}</div>` : "") +
    mind +
    equipped +
    `</div>`
  );
}
