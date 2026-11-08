import { useRef, type PointerEvent } from "react";
import type { MutableRefObject } from "react";
import { setStick, type ControlState } from "../hooks/usePlayerControls";

export function Joystick({
  controls,
}: {
  controls: MutableRefObject<ControlState>;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const knob = useRef<HTMLDivElement>(null);

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    origin.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    move(event.clientX, event.clientY);
  };

  const move = (clientX: number, clientY: number) => {
    if (!origin.current) return;
    const dx = clientX - origin.current.x;
    const dy = clientY - origin.current.y;
    const max = 42;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, max);
    const nx = (dx / len) * clamped;
    const ny = (dy / len) * clamped;
    setStick(controls, nx / max, -ny / max);
    if (knob.current) {
      knob.current.style.transform = `translate(${nx}px, ${ny}px)`;
    }
  };

  const onUp = (event: PointerEvent<HTMLDivElement>) => {
    origin.current = null;
    setStick(controls, 0, 0);
    if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <div
      className="joystick"
      onPointerDown={onDown}
      onPointerMove={(e) => move(e.clientX, e.clientY)}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      aria-label="Virtual joystick"
    >
      <div className="joystick-knob" ref={knob} />
    </div>
  );
}
