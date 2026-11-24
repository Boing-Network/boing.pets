/**
 * Which HUD panels are collapsed to their title bar. Remembered per browser.
 *
 * Wide and narrow layouts keep separate choices: on a wide screen both
 * panels start open, while on a phone they start collapsed so the world stays
 * visible.
 */
import { create } from "zustand";

export type PanelId = "inspect" | "news";
/** The panel docked at the bottom of a narrow screen. */
export type DockPanelId = "inspect";

export type PanelPrefs = {
  /** Wide layout: true = collapsed. */
  wide: Record<PanelId, boolean>;
  narrow: {
    /** The dock panel, when it is open. */
    open: DockPanelId | null;
    newsCollapsed: boolean;
  };
};

export const DEFAULT_PANEL_PREFS: PanelPrefs = {
  wide: { inspect: false, news: false },
  narrow: { open: null, newsCollapsed: true },
};

/** Matches the HUD's narrow-layout media query (see `panels.css`). */
export const NARROW_QUERY = "(max-width: 720px)";

const KEY = "living-pets.panels.v1";

export function isCollapsed(
  prefs: PanelPrefs,
  panel: PanelId,
  narrow: boolean,
): boolean {
  if (!narrow) return prefs.wide[panel];
  if (panel === "news") return prefs.narrow.newsCollapsed;
  return prefs.narrow.open !== panel;
}

/** Flip one panel in the given layout. */
export function togglePanel(
  prefs: PanelPrefs,
  panel: PanelId,
  narrow: boolean,
): PanelPrefs {
  if (!narrow) {
    return { ...prefs, wide: { ...prefs.wide, [panel]: !prefs.wide[panel] } };
  }
  if (panel === "news") {
    return {
      ...prefs,
      narrow: { ...prefs.narrow, newsCollapsed: !prefs.narrow.newsCollapsed },
    };
  }
  return {
    ...prefs,
    narrow: {
      ...prefs.narrow,
      open: prefs.narrow.open === panel ? null : panel,
    },
  };
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Stored JSON back to prefs; anything missing or malformed takes the default. */
export function parsePanelPrefs(raw: string | null | undefined): PanelPrefs {
  if (raw == null) return DEFAULT_PANEL_PREFS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_PANEL_PREFS;
  }
  if (typeof data !== "object" || data === null) return DEFAULT_PANEL_PREFS;
  const { wide, narrow } = data as {
    wide?: Record<string, unknown> | null;
    narrow?: Record<string, unknown> | null;
  };
  const d = DEFAULT_PANEL_PREFS;
  const open = narrow?.open;
  return {
    wide: {
      inspect: flag(wide?.inspect, d.wide.inspect),
      news: flag(wide?.news, d.wide.news),
    },
    narrow: {
      open: open === "inspect" ? open : d.narrow.open,
      newsCollapsed: flag(narrow?.newsCollapsed, d.narrow.newsCollapsed),
    },
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function loadPrefs(): PanelPrefs {
  try {
    return parsePanelPrefs(storage()?.getItem(KEY));
  } catch {
    return DEFAULT_PANEL_PREFS;
  }
}

type PanelState = {
  prefs: PanelPrefs;
  toggle: (panel: PanelId, narrow: boolean) => void;
};

export const usePanelStore = create<PanelState>((set, get) => ({
  prefs: loadPrefs(),
  toggle(panel, narrow) {
    const prefs = togglePanel(get().prefs, panel, narrow);
    set({ prefs });
    try {
      storage()?.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Storage can be blocked; the choice then lasts for this page load.
    }
  },
}));
