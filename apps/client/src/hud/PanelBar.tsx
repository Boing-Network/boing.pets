import { useSyncExternalStore, type ReactNode } from "react";
import {
  isCollapsed,
  NARROW_QUERY,
  usePanelStore,
  type PanelId,
} from "../state/panelStore";
import "./panels.css";

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function narrowNow(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(NARROW_QUERY).matches;
}

/** True on phone-width screens, where the HUD panels dock at the bottom. */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, narrowNow, () => false);
}

/** Collapsed state and toggle for one HUD panel in the current layout. */
export function usePanel(id: PanelId): {
  collapsed: boolean;
  toggle: () => void;
} {
  const narrow = useIsNarrow();
  const collapsed = usePanelStore((s) => isCollapsed(s.prefs, id, narrow));
  const toggle = usePanelStore((s) => s.toggle);
  return { collapsed, toggle: () => toggle(id, narrow) };
}

type Props = {
  title: ReactNode;
  /** Plain name for the toggle's accessible label ("Hide Influences"). */
  name: string;
  /** Id of the element the toggle shows and hides. */
  bodyId: string;
  collapsed: boolean;
  onToggle: () => void;
};

/**
 * Title bar shared by the HUD panels. A collapsed panel is just this bar, so
 * the 3D world stays visible and every panel stays one tap away.
 */
export function PanelBar({ title, name, bodyId, collapsed, onToggle }: Props) {
  return (
    <header className="panel-bar">
      <h2 className="panel-title">{title}</h2>
      <button
        type="button"
        className="panel-toggle"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        aria-label={`${collapsed ? "Show" : "Hide"} ${name}`}
        onClick={onToggle}
      >
        {collapsed ? "Show" : "Hide"}
      </button>
    </header>
  );
}
