/** Pasture full-screen toggle: Fullscreen API, plus a CSS immersive fallback for iOS. */

export const PASTURE_FULLSCREEN_TARGET_ID = "pasture-canvas";
export const PASTURE_IMMERSIVE_CLASS = "is-pasture-immersive";

type FullscreenDocument = {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
  documentElement: HTMLElement;
  body?: HTMLElement | null;
  getElementById?(id: string): HTMLElement | null;
  addEventListener?: (type: string, fn: EventListener) => void;
  removeEventListener?: (type: string, fn: EventListener) => void;
  defaultView?: Window | null;
};

type FullscreenElement = HTMLElement & {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => void;
  webkitRequestFullScreen?: () => void;
};

export function getPastureFullscreenTarget(
  doc: FullscreenDocument | Document = document,
): HTMLElement | null {
  return (doc.getElementById?.(PASTURE_FULLSCREEN_TARGET_ID) ??
    null) as HTMLElement | null;
}

export function elementFullscreenEnabled(
  doc: FullscreenDocument | Document = document,
): boolean {
  const d = doc as FullscreenDocument;
  return Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isElementFullscreen(
  target: Element | null,
  doc: FullscreenDocument | Document = document,
): boolean {
  if (!target) return false;
  const d = doc as FullscreenDocument;
  return (d.fullscreenElement || d.webkitFullscreenElement) === target;
}

export function isImmersiveFallback(
  doc: FullscreenDocument | Document = document,
): boolean {
  return (doc as FullscreenDocument).documentElement.classList.contains(
    PASTURE_IMMERSIVE_CLASS,
  );
}

export function isPastureFullscreen(
  doc: FullscreenDocument | Document = document,
): boolean {
  const target = getPastureFullscreenTarget(doc);
  return isElementFullscreen(target, doc) || isImmersiveFallback(doc);
}

export function applyImmersiveFallback(
  on: boolean,
  doc: FullscreenDocument | Document = document,
): void {
  const d = doc as FullscreenDocument;
  d.documentElement.classList.toggle(PASTURE_IMMERSIVE_CLASS, on);
  d.body?.classList.toggle(PASTURE_IMMERSIVE_CLASS, on);
  dispatchViewportResize(doc);
}

export function dispatchViewportResize(
  doc: FullscreenDocument | Document = document,
): void {
  const view = (doc as FullscreenDocument).defaultView;
  view?.dispatchEvent(new Event("resize"));
}

export async function requestPastureFullscreen(
  doc: FullscreenDocument | Document = document,
): Promise<"native" | "immersive"> {
  const target = getPastureFullscreenTarget(doc) as FullscreenElement | null;
  if (!target) return "immersive";
  if (elementFullscreenEnabled(doc)) {
    try {
      if (typeof target.requestFullscreen === "function") {
        await target.requestFullscreen();
        return "native";
      }
      if (typeof target.webkitRequestFullscreen === "function") {
        target.webkitRequestFullscreen();
        return "native";
      }
      if (typeof target.webkitRequestFullScreen === "function") {
        target.webkitRequestFullScreen();
        return "native";
      }
    } catch {
      // iOS and blocked permissions fall through to the CSS shell.
    }
  }
  applyImmersiveFallback(true, doc);
  return "immersive";
}

export async function exitPastureFullscreen(
  doc: FullscreenDocument | Document = document,
): Promise<void> {
  if (isImmersiveFallback(doc)) {
    applyImmersiveFallback(false, doc);
    return;
  }
  const d = doc as FullscreenDocument;
  if (d.fullscreenElement || d.webkitFullscreenElement) {
    if (typeof d.exitFullscreen === "function") {
      await d.exitFullscreen();
      return;
    }
    d.webkitExitFullscreen?.();
  }
}

export async function togglePastureFullscreen(
  doc: FullscreenDocument | Document = document,
): Promise<boolean> {
  if (isPastureFullscreen(doc)) {
    await exitPastureFullscreen(doc);
    return isPastureFullscreen(doc);
  }
  await requestPastureFullscreen(doc);
  return isPastureFullscreen(doc);
}

export function subscribePastureFullscreen(
  onChange: (active: boolean) => void,
  doc: FullscreenDocument | Document = document,
): () => void {
  const d = doc as FullscreenDocument;
  const sync = () => onChange(isPastureFullscreen(doc));
  const types = ["fullscreenchange", "webkitfullscreenchange"];
  for (const type of types) d.addEventListener?.(type, sync);
  return () => {
    for (const type of types) d.removeEventListener?.(type, sync);
  };
}
