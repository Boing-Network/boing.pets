/** First-time guided walkthrough: Starter Town → pasture area, station, care. */

export const WALKTHROUGH_STORAGE_KEY = "boing-pets-walkthrough-v1";
export const WALKTHROUGH_VERSION = 1 as const;

export type WalkthroughScene = "starter-town" | "pasture";

export type WalkthroughStepId =
  | "welcome-town"
  | "enter-pasture"
  | "visit-area"
  | "visit-station"
  | "pet-care"
  | "done";

export type WalkthroughState = {
  version: typeof WALKTHROUGH_VERSION;
  skipped: boolean;
  completed: boolean;
  step: WalkthroughStepId;
  completedSteps: WalkthroughStepId[];
};

export type WalkthroughStep = {
  id: WalkthroughStepId;
  title: string;
  body: string;
  scene: WalkthroughScene;
  /** Optional in-world target the "Take me there" button can use. */
  guide?: { kind: "mine" | "craft" | "buddy" };
  primaryLabel: string;
};

export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    id: "welcome-town",
    title: "Welcome to Starter Town",
    body: "This short tour takes you into the public pasture, then to one activity area, one station, and pet care. You can skip it any time.",
    scene: "starter-town",
    primaryLabel: "Let's go",
  },
  {
    id: "enter-pasture",
    title: "Enter the public pasture",
    body: "Every hatched buddy lives in the public pasture. Walk to the Tutorial Meadow Gate, press Esc, or use Back to the pasture to head over.",
    scene: "starter-town",
    primaryLabel: "Go to the pasture",
  },
  {
    id: "visit-area",
    title: "Visit an activity area",
    body: "Daily play happens in themed areas. Walk west to the Crystal Quarry to peek at mining — one of the pasture's activity spots.",
    scene: "pasture",
    guide: { kind: "mine" },
    primaryLabel: "Take me there",
  },
  {
    id: "visit-station",
    title: "Visit a station",
    body: "Stations are where you craft, trade, and customize. Head northwest to the Crafting Station and open it when you arrive.",
    scene: "pasture",
    guide: { kind: "craft" },
    primaryLabel: "Take me there",
  },
  {
    id: "pet-care",
    title: "Care for your buddy",
    body: "Open the Buddy chip and say hello, play, or groom. A little daily care keeps streaks, XP, and Boinglets growing.",
    scene: "pasture",
    guide: { kind: "buddy" },
    primaryLabel: "Open Buddy card",
  },
  {
    id: "done",
    title: "You're ready",
    body: "That's the tour — wander, play an area, stop by a station, and check in on your buddy whenever you like.",
    scene: "pasture",
    primaryLabel: "Start exploring",
  },
] as const;

export const WALKTHROUGH_STEP_IDS: readonly WalkthroughStepId[] =
  WALKTHROUGH_STEPS.map((s) => s.id);

const DEFAULT_STATE: WalkthroughState = {
  version: WALKTHROUGH_VERSION,
  skipped: false,
  completed: false,
  step: "welcome-town",
  completedSteps: [],
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function memorylessStorage(): StorageLike {
  return { getItem: () => null, setItem: () => undefined };
}

export function defaultWalkthroughState(): WalkthroughState {
  return {
    ...DEFAULT_STATE,
    completedSteps: [],
  };
}

export function parseWalkthroughState(raw: unknown): WalkthroughState {
  if (!raw || typeof raw !== "object") return defaultWalkthroughState();
  const rec = raw as Record<string, unknown>;
  const step = WALKTHROUGH_STEP_IDS.includes(rec.step as WalkthroughStepId)
    ? (rec.step as WalkthroughStepId)
    : "welcome-town";
  const completedSteps = Array.isArray(rec.completedSteps)
    ? rec.completedSteps.filter((id): id is WalkthroughStepId =>
        WALKTHROUGH_STEP_IDS.includes(id as WalkthroughStepId),
      )
    : [];
  const skipped = rec.skipped === true;
  const completed = rec.completed === true || skipped;
  return {
    version: WALKTHROUGH_VERSION,
    skipped,
    completed,
    step: skipped || completed ? "done" : step,
    completedSteps,
  };
}

export function isReturningVisitor(storage: StorageLike): boolean {
  try {
    return (
      storage.getItem("boing-pets-pasture-hint-v1") === "1" ||
      storage.getItem("boing-pets-onboarded") === "1"
    );
  } catch {
    return false;
  }
}

export function loadWalkthrough(
  storage: StorageLike | null = typeof localStorage === "undefined"
    ? null
    : localStorage,
): WalkthroughState {
  const store = storage ?? memorylessStorage();
  try {
    const raw = store.getItem(WALKTHROUGH_STORAGE_KEY);
    if (raw) return parseWalkthroughState(JSON.parse(raw));
  } catch {
    /* ignore quota / private mode / bad JSON */
  }
  // Existing players already dismissed the old hint — don't restart a tour.
  if (isReturningVisitor(store)) {
    return {
      version: WALKTHROUGH_VERSION,
      skipped: false,
      completed: true,
      step: "done",
      completedSteps: [...WALKTHROUGH_STEP_IDS],
    };
  }
  return defaultWalkthroughState();
}

export function saveWalkthrough(
  state: WalkthroughState,
  storage: StorageLike | null = typeof localStorage === "undefined"
    ? null
    : localStorage,
): WalkthroughState {
  const next = parseWalkthroughState(state);
  const store = storage ?? memorylessStorage();
  try {
    store.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify(next));
    if (next.completed || next.skipped) {
      store.setItem("boing-pets-pasture-hint-v1", "1");
      store.setItem("boing-pets-onboarded", "1");
    }
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}

export function walkthroughStep(
  id: WalkthroughStepId,
): WalkthroughStep | undefined {
  return WALKTHROUGH_STEPS.find((s) => s.id === id);
}

export function isWalkthroughVisible(
  state: WalkthroughState,
  scene: WalkthroughScene,
): boolean {
  if (state.skipped || state.completed) return false;
  const step = walkthroughStep(state.step);
  if (!step) return false;
  return step.scene === scene;
}

export function shouldAutoAdvanceOnPasture(
  state: WalkthroughState,
): WalkthroughState | null {
  if (state.skipped || state.completed) return null;
  if (state.step === "welcome-town" || state.step === "enter-pasture") {
    return completeWalkthroughStep(state, "enter-pasture");
  }
  return null;
}

export function completeWalkthroughStep(
  state: WalkthroughState,
  id: WalkthroughStepId,
): WalkthroughState {
  if (state.skipped) return state;
  const index = WALKTHROUGH_STEP_IDS.indexOf(id);
  const current = WALKTHROUGH_STEP_IDS.indexOf(state.step);
  if (index < 0) return state;
  // Only complete the current step, or a prior one (idempotent).
  if (index > current) return state;
  const completedSteps = state.completedSteps.includes(id)
    ? state.completedSteps
    : [...state.completedSteps, id];
  const nextId = WALKTHROUGH_STEP_IDS[index + 1] ?? "done";
  // Completing the finale dismisses the card; earlier steps only advance.
  const step = id === "done" ? "done" : nextId;
  const completed = id === "done";
  return parseWalkthroughState({
    ...state,
    step,
    completedSteps,
    completed,
  });
}

/** Advance from the current step (primary button / arrival). */
export function advanceWalkthrough(state: WalkthroughState): WalkthroughState {
  if (state.skipped) return state;
  if (state.step === "done") {
    return parseWalkthroughState({
      ...state,
      completed: true,
      completedSteps: state.completedSteps.includes("done")
        ? state.completedSteps
        : [...state.completedSteps, "done"],
    });
  }
  return completeWalkthroughStep(state, state.step);
}

export function skipWalkthrough(state: WalkthroughState): WalkthroughState {
  return parseWalkthroughState({
    ...state,
    skipped: true,
    completed: true,
    step: "done",
  });
}

export function dismissWalkthroughFinale(
  state: WalkthroughState,
): WalkthroughState {
  if (state.step !== "done") return state;
  return parseWalkthroughState({
    ...state,
    completed: true,
    completedSteps: state.completedSteps.includes("done")
      ? state.completedSteps
      : [...state.completedSteps, "done"],
  });
}

/** True when the open station/area menu finishes the current pasture step. */
export function menuCompletesStep(
  step: WalkthroughStepId,
  menuKind: string | null | undefined,
): boolean {
  if (!menuKind) return false;
  if (step === "visit-area") return menuKind === "mine";
  if (step === "visit-station") return menuKind === "craft";
  return false;
}

export function careActionCompletesStep(
  step: WalkthroughStepId,
  action: string | null | undefined,
): boolean {
  if (step !== "pet-care") return false;
  return (
    action === "buddy-open" ||
    action === "checkin" ||
    action === "play" ||
    action === "groom" ||
    action === "feed" ||
    action === "hatch"
  );
}
