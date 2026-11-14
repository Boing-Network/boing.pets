/** Pasture accessibility and camera preferences, stored in localStorage. */

export const A11Y_STORAGE_KEY = "boing-pets-a11y-v1";

export type TextSize = "small" | "medium" | "large";
export type CookHintPalette = "default" | "colorblind";

export type A11ySettings = {
  cameraSensitivity: number;
  textSize: TextSize;
  reducedMotion: boolean;
  cookHintPalette: CookHintPalette;
};

export const DEFAULT_A11Y_SETTINGS: A11ySettings = {
  cameraSensitivity: 1,
  textSize: "medium",
  reducedMotion: false,
  cookHintPalette: "default",
};

export const COOK_HINT_SHAPES = {
  correct: "●",
  present: "▲",
  absent: "■",
} as const;

export const TEXT_SIZE_SCALE: Record<TextSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.15,
};

const listeners = new Set<(settings: A11ySettings) => void>();

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function defaultStore(): StorageLike | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function clampCameraSensitivity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.4, value));
}

export function parseA11ySettings(raw: unknown): A11ySettings {
  const src =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const textSize =
    src.textSize === "small" || src.textSize === "large"
      ? src.textSize
      : "medium";
  const cookHintPalette =
    src.cookHintPalette === "colorblind" ? "colorblind" : "default";
  return {
    cameraSensitivity: clampCameraSensitivity(Number(src.cameraSensitivity)),
    textSize,
    reducedMotion: src.reducedMotion === true,
    cookHintPalette,
  };
}

export function loadA11ySettings(
  storage: StorageLike | null = defaultStore(),
): A11ySettings {
  if (!storage) return { ...DEFAULT_A11Y_SETTINGS };
  try {
    return parseA11ySettings(
      JSON.parse(storage.getItem(A11Y_STORAGE_KEY) || "null"),
    );
  } catch {
    return { ...DEFAULT_A11Y_SETTINGS };
  }
}

export function saveA11ySettings(
  next: A11ySettings,
  storage: StorageLike | null = defaultStore(),
): A11ySettings {
  const settings = parseA11ySettings(next);
  if (storage) {
    try {
      storage.setItem(A11Y_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private mode or quota.
    }
  }
  return settings;
}

let current = loadA11ySettings();

export function getA11ySettings(): A11ySettings {
  return current;
}

export function updateA11ySettings(patch: Partial<A11ySettings>): A11ySettings {
  current = saveA11ySettings({ ...current, ...patch });
  applyA11ySettings(current);
  for (const listener of listeners) listener(current);
  return current;
}

export function subscribeA11ySettings(
  listener: (settings: A11ySettings) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function prefersReducedMotion(
  win: Window | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  const os = Boolean(
    win?.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return os || getA11ySettings().reducedMotion;
}

export function applyA11ySettings(
  settings: A11ySettings = getA11ySettings(),
  root: HTMLElement | null = typeof document === "undefined"
    ? null
    : document.documentElement,
): void {
  if (!root) return;
  root.dataset.textSize = settings.textSize;
  root.dataset.cookHint = settings.cookHintPalette;
  root.dataset.reducedMotion = settings.reducedMotion ? "true" : "false";
  root.style.setProperty(
    "--pasture-text-scale",
    String(TEXT_SIZE_SCALE[settings.textSize]),
  );
}

applyA11ySettings();
