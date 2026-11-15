import { useEffect, useRef, type MutableRefObject } from "react";

export interface ControlState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  interact: boolean;
  /** Virtual joystick vector in [-1,1]. */
  stickX: number;
  stickY: number;
}

const INITIAL: ControlState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  interact: false,
  stickX: 0,
  stickY: 0,
};

export function usePlayerControls() {
  const state = useRef<ControlState>({ ...INITIAL });

  useEffect(() => {
    const onKey = (event: KeyboardEvent, down: boolean) => {
      const target = event.target as {
        tagName?: string;
        isContentEditable?: boolean;
      } | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (["w", "arrowup"].includes(key)) {
        if (down) event.preventDefault();
        state.current.forward = down;
      }
      if (["s", "arrowdown"].includes(key)) {
        if (down) event.preventDefault();
        state.current.back = down;
      }
      if (["a", "arrowleft"].includes(key)) {
        if (down) event.preventDefault();
        state.current.left = down;
      }
      if (["d", "arrowright"].includes(key)) {
        if (down) event.preventDefault();
        state.current.right = down;
      }
      if (key === "e" || key === " ") {
        if (down) event.preventDefault();
        state.current.interact = down;
      }
    };
    const down = (e: KeyboardEvent) => onKey(e, true);
    const up = (e: KeyboardEvent) => onKey(e, false);
    const clear = () => releaseHeldInput(state.current);
    const onVisibility = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVisibility);
      clear();
    };
  }, []);

  return state;
}

/** Drop every held control so a blur or tab switch cannot leave the player running. */
export function releaseHeldInput(state: ControlState): void {
  state.forward = false;
  state.back = false;
  state.left = false;
  state.right = false;
  state.interact = false;
  state.stickX = 0;
  state.stickY = 0;
}

export function setStick(
  state: MutableRefObject<ControlState>,
  x: number,
  y: number,
) {
  state.current.stickX = Math.max(-1, Math.min(1, x));
  state.current.stickY = Math.max(-1, Math.min(1, y));
}
