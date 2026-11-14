/** Short first-time Idle Adventures tour shown at Dispatch. */

export const ADVENTURE_TUTORIAL_STORAGE_KEY =
  "boing-pets-adventure-tutorial-v1";
export const ADVENTURE_TUTORIAL_VERSION = 1 as const;

export type AdventureTutorialStepId =
  "what" | "choose" | "equip" | "luck" | "claim" | "rarity";

export type AdventureTutorialState = {
  version: typeof ADVENTURE_TUTORIAL_VERSION;
  skipped: boolean;
  completed: boolean;
  step: AdventureTutorialStepId;
  completedSteps: AdventureTutorialStepId[];
};

export type AdventureTutorialStep = {
  id: AdventureTutorialStepId;
  title: string;
  body: string;
  primaryLabel: string;
};

export const ADVENTURE_TUTORIAL_STEPS: readonly AdventureTutorialStep[] = [
  {
    id: "what",
    title: "Idle Adventures",
    body: "From Dispatch you send your character off the map. Real time passes while they are out. Come back later and claim whatever they pulled.",
    primaryLabel: "Next",
  },
  {
    id: "choose",
    title: "Pick a trip",
    body: "Six destinations, five durations. Read the estimate on the card, then launch. The Lost Drop and the Worldwide Pop-Up unlock gradually.",
    primaryLabel: "Next",
  },
  {
    id: "equip",
    title: "Wear the fit first",
    body: "Style Luck snapshots the cosmetics you have equipped at launch. Hit the Fitting Room before you send them if you want the fit to count.",
    primaryLabel: "Next",
  },
  {
    id: "luck",
    title: "Style Luck",
    body: "Equipped rarity, set bonuses, and the destination itself multiply the drop table. It never guarantees a Grail or Vaulted. The exact math lives on the rates panel.",
    primaryLabel: "Next",
  },
  {
    id: "claim",
    title: "Claim the bag",
    body: "When the timer hits, claim one trip or claim-all. Inventory updates immediately. The on-chain mint follows and shows pending or confirmed on the reveal.",
    primaryLabel: "Next",
  },
  {
    id: "rarity",
    title: "The rare ones stay rare",
    body: "Grail sits at 0.19% and Vaulted at 0.01%. Pity and Style Luck cannot hand them to you. That is the point.",
    primaryLabel: "I'm ready",
  },
] as const;

export const ADVENTURE_TUTORIAL_STEP_IDS: readonly AdventureTutorialStepId[] =
  ADVENTURE_TUTORIAL_STEPS.map((step) => step.id);

const DEFAULT_STATE: AdventureTutorialState = {
  version: ADVENTURE_TUTORIAL_VERSION,
  skipped: false,
  completed: false,
  step: "what",
  completedSteps: [],
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function memorylessStorage(): StorageLike {
  return { getItem: () => null, setItem: () => undefined };
}

export function defaultAdventureTutorialState(): AdventureTutorialState {
  return { ...DEFAULT_STATE, completedSteps: [] };
}

export function parseAdventureTutorialState(
  raw: unknown,
): AdventureTutorialState {
  if (!raw || typeof raw !== "object") return defaultAdventureTutorialState();
  const rec = raw as Record<string, unknown>;
  const step = ADVENTURE_TUTORIAL_STEP_IDS.includes(
    rec.step as AdventureTutorialStepId,
  )
    ? (rec.step as AdventureTutorialStepId)
    : "what";
  const completedSteps = Array.isArray(rec.completedSteps)
    ? rec.completedSteps.filter((id): id is AdventureTutorialStepId =>
        ADVENTURE_TUTORIAL_STEP_IDS.includes(id as AdventureTutorialStepId),
      )
    : [];
  const skipped = rec.skipped === true;
  const completed = rec.completed === true || skipped;
  return {
    version: ADVENTURE_TUTORIAL_VERSION,
    skipped,
    completed,
    step: skipped || completed ? "rarity" : step,
    completedSteps,
  };
}

export function loadAdventureTutorial(
  storage: StorageLike | null = typeof localStorage === "undefined"
    ? null
    : localStorage,
): AdventureTutorialState {
  const store = storage ?? memorylessStorage();
  try {
    const raw = store.getItem(ADVENTURE_TUTORIAL_STORAGE_KEY);
    if (raw) return parseAdventureTutorialState(JSON.parse(raw));
  } catch {
    /* ignore quota / private mode / bad JSON */
  }
  return defaultAdventureTutorialState();
}

export function saveAdventureTutorial(
  state: AdventureTutorialState,
  storage: StorageLike | null = typeof localStorage === "undefined"
    ? null
    : localStorage,
): AdventureTutorialState {
  const next = parseAdventureTutorialState(state);
  const store = storage ?? memorylessStorage();
  try {
    store.setItem(ADVENTURE_TUTORIAL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function adventureTutorialStep(
  id: AdventureTutorialStepId,
): AdventureTutorialStep | undefined {
  return ADVENTURE_TUTORIAL_STEPS.find((step) => step.id === id);
}

export function isAdventureTutorialVisible(
  state: AdventureTutorialState,
): boolean {
  return !state.skipped && !state.completed;
}

export function advanceAdventureTutorial(
  state: AdventureTutorialState,
): AdventureTutorialState {
  if (state.skipped || state.completed) return state;
  const index = ADVENTURE_TUTORIAL_STEP_IDS.indexOf(state.step);
  const completedSteps = state.completedSteps.includes(state.step)
    ? state.completedSteps
    : [...state.completedSteps, state.step];
  if (state.step === "rarity" || index < 0) {
    return parseAdventureTutorialState({
      ...state,
      completed: true,
      completedSteps,
      step: "rarity",
    });
  }
  const next = ADVENTURE_TUTORIAL_STEP_IDS[index + 1] ?? "rarity";
  return parseAdventureTutorialState({
    ...state,
    step: next,
    completedSteps,
  });
}

export function skipAdventureTutorial(
  state: AdventureTutorialState,
): AdventureTutorialState {
  return parseAdventureTutorialState({
    ...state,
    skipped: true,
    completed: true,
    step: "rarity",
  });
}
