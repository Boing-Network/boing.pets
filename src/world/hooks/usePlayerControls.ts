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
      const key = event.key.toLowerCase();
      if (["w", "arrowup"].includes(key)) state.current.forward = down;
      if (["s", "arrowdown"].includes(key)) state.current.back = down;
      if (["a", "arrowleft"].includes(key)) state.current.left = down;
      if (["d", "arrowright"].includes(key)) state.current.right = down;
      if (key === "e" || key === " ") {
        if (down) event.preventDefault();
        state.current.interact = down;
      }
    };
    const down = (e: KeyboardEvent) => onKey(e, true);
    const up = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return state;
}

export function setStick(
  state: MutableRefObject<ControlState>,
  x: number,
  y: number,
) {
  state.current.stickX = Math.max(-1, Math.min(1, x));
  state.current.stickY = Math.max(-1, Math.min(1, y));
}
