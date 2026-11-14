/** Derive a subtle pasture mood from care vitals and mind.mood. */

export type PetMoodKind =
  "happy" | "hungry" | "sleepy" | "lonely" | "curious" | "content";

export type CareVitals = {
  hunger?: number;
  happiness?: number;
  energy?: number;
  status?: string;
  mood?: string;
};

export const HUNGER_LOW = 50;
export const ENERGY_LOW = 45;
export const HAPPINESS_HIGH = 80;

export const MOOD_BUBBLE: Record<PetMoodKind, string> = {
  happy: "✦",
  hungry: "🍽",
  sleepy: "z",
  lonely: "♡",
  curious: "?",
  content: "♡",
};

export const MOOD_BUBBLE_LABEL: Record<PetMoodKind, string> = {
  happy: "Happy",
  hungry: "Hungry",
  sleepy: "Sleepy",
  lonely: "Lonely",
  curious: "Curious",
  content: "Content",
};

export type MoodMotion = {
  kind: PetMoodKind;
  icon: string;
  label: string;
  bounceAmp: number;
  bounceSpeed: number;
  droop: number;
  sparkle: boolean;
};

export const MOOD_SFX_PER_PET_MS = 8000;
export const MOOD_SFX_GLOBAL_MS = 2500;

export function petMoodKind(
  vitals: CareVitals | null | undefined,
): PetMoodKind {
  const hunger = vitals?.hunger;
  const energy = vitals?.energy;
  const happiness = vitals?.happiness;
  const status = vitals?.status ?? "";
  const mood = (vitals?.mood ?? "").toLowerCase();

  if (
    (typeof hunger === "number" && hunger < HUNGER_LOW) ||
    status === "peckish" ||
    status === "scruffy" ||
    status === "stray"
  ) {
    return "hungry";
  }
  if ((typeof energy === "number" && energy < ENERGY_LOW) || mood === "tired") {
    return "sleepy";
  }
  if (mood === "lonely") return "lonely";
  if (
    (typeof happiness === "number" && happiness >= HAPPINESS_HIGH) ||
    mood === "playful"
  ) {
    return "happy";
  }
  if (mood === "curious") return "curious";
  return "content";
}

export function moodMotion(
  kind: PetMoodKind,
  reducedMotion = false,
): MoodMotion {
  const icon = MOOD_BUBBLE[kind];
  const label = MOOD_BUBBLE_LABEL[kind];
  if (reducedMotion) {
    return {
      kind,
      icon,
      label,
      bounceAmp: 0,
      bounceSpeed: 0,
      droop: 0,
      sparkle: false,
    };
  }
  switch (kind) {
    case "happy":
      return {
        kind,
        icon,
        label,
        bounceAmp: 0.07,
        bounceSpeed: 3.2,
        droop: 0,
        sparkle: true,
      };
    case "hungry":
      return {
        kind,
        icon,
        label,
        bounceAmp: 0,
        bounceSpeed: 0,
        droop: 0.14,
        sparkle: false,
      };
    case "sleepy":
      return {
        kind,
        icon,
        label,
        bounceAmp: 0.012,
        bounceSpeed: 1.15,
        droop: 0.18,
        sparkle: false,
      };
    case "lonely":
      return {
        kind,
        icon,
        label,
        bounceAmp: 0.016,
        bounceSpeed: 1.6,
        droop: 0.07,
        sparkle: false,
      };
    case "curious":
      return {
        kind,
        icon,
        label,
        bounceAmp: 0.03,
        bounceSpeed: 2.6,
        droop: 0,
        sparkle: false,
      };
    default:
      return {
        kind,
        icon,
        label,
        bounceAmp: 0,
        bounceSpeed: 2.4,
        droop: 0,
        sparkle: false,
      };
  }
}

export function shouldPlayMoodSfx(
  kind: PetMoodKind,
  reducedMotion: boolean,
  now: number,
  lastPetAt: number,
  lastGlobalAt: number,
): boolean {
  if (reducedMotion) return false;
  if (kind === "content" || kind === "lonely" || kind === "curious")
    return false;
  if (now - lastGlobalAt < MOOD_SFX_GLOBAL_MS) return false;
  if (now - lastPetAt < MOOD_SFX_PER_PET_MS) return false;
  return true;
}

export function moodSfxName(
  kind: PetMoodKind,
): "mood-happy" | "mood-hungry" | "mood-sleepy" | null {
  if (kind === "happy") return "mood-happy";
  if (kind === "hungry") return "mood-hungry";
  if (kind === "sleepy") return "mood-sleepy";
  return null;
}

export function careVitalsFromPet(
  pet:
    | {
        state?: {
          hunger?: number;
          happiness?: number;
          energy?: number;
          status?: string;
        };
        mind?: { mood?: string };
      }
    | null
    | undefined,
): CareVitals {
  return {
    hunger: pet?.state?.hunger,
    happiness: pet?.state?.happiness,
    energy: pet?.state?.energy,
    status: pet?.state?.status,
    mood: pet?.mind?.mood,
  };
}
