import type { MutableRefObject } from "react";
import { Joystick } from "../world/hud/Joystick";
import type { ControlState } from "../world/hooks/usePlayerControls";

export function PastureTouchControls({
  visible,
  controls,
  canInteract,
  onInteract,
}: {
  visible: boolean;
  controls: MutableRefObject<ControlState>;
  canInteract: boolean;
  onInteract: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="pasture-touch-controls">
      <Joystick controls={controls} />
      <button
        type="button"
        className="interact-btn"
        disabled={!canInteract}
        aria-label="Interact"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (canInteract) onInteract();
        }}
      >
        Interact
      </button>
    </div>
  );
}
