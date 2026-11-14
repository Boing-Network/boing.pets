import {
  useEffect,
  useRef,
  type MouseEvent,
  type MutableRefObject,
} from "react";
import type { LivePose } from "../world/scene/Player";
import {
  layoutMiniMapStations,
  miniMapStreets,
  pastureMiniMapBounds,
  walkTargetFromMiniMapClick,
  worldToMap,
} from "./minimap";

export const PASTURE_MINIMAP_BOARD_SIZE = 140;

const bounds = pastureMiniMapBounds();
const spreadStations = layoutMiniMapStations(
  PASTURE_MINIMAP_BOARD_SIZE,
  bounds,
);

export function PastureMinimap({
  poseRef,
  onWalk,
  visible = true,
  onToggle,
}: {
  poseRef: MutableRefObject<LivePose>;
  onWalk: (x: number, z: number) => void;
  visible?: boolean;
  onToggle?: () => void;
}) {
  const playerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = playerRef.current;
      if (el) {
        const mapped = worldToMap(
          poseRef.current,
          bounds,
          PASTURE_MINIMAP_BOARD_SIZE,
        );
        el.style.transform = `translate(${mapped.x}px, ${mapped.y}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [poseRef]);

  const onActivate = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    const x =
      ((event.clientX - rect.left) / rect.width) * PASTURE_MINIMAP_BOARD_SIZE;
    const y =
      ((event.clientY - rect.top) / rect.height) * PASTURE_MINIMAP_BOARD_SIZE;
    const target = walkTargetFromMiniMapClick(
      { x, y },
      PASTURE_MINIMAP_BOARD_SIZE,
      spreadStations,
      bounds,
    );
    onWalk(target.x, target.z);
  };

  return (
    <div
      className={"pasture-minimap" + (visible ? "" : " is-collapsed")}
      data-hud="minimap"
      aria-label="Pasture mini-map"
    >
      <div className="pasture-minimap-head">
        <p className="pasture-minimap-title">The Yard</p>
        {onToggle ? (
          <button
            type="button"
            className="pasture-minimap-toggle"
            aria-label={visible ? "Hide map" : "Show map"}
            aria-pressed={visible}
            onClick={onToggle}
          >
            {visible ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {visible ? (
        <button
          type="button"
          className="pasture-minimap-board"
          aria-label="Walk to a point on the pasture"
          onClick={onActivate}
          style={{
            width: PASTURE_MINIMAP_BOARD_SIZE,
            height: PASTURE_MINIMAP_BOARD_SIZE,
          }}
        >
          <svg
            className="pasture-minimap-streets"
            width={PASTURE_MINIMAP_BOARD_SIZE}
            height={PASTURE_MINIMAP_BOARD_SIZE}
            viewBox={`0 0 ${PASTURE_MINIMAP_BOARD_SIZE} ${PASTURE_MINIMAP_BOARD_SIZE}`}
            aria-hidden="true"
          >
            {miniMapStreets(PASTURE_MINIMAP_BOARD_SIZE, bounds).map(
              (street, i) => (
                <line
                  key={`st-${i}`}
                  x1={street.x1}
                  y1={street.y1}
                  x2={street.x2}
                  y2={street.y2}
                />
              ),
            )}
          </svg>
          {spreadStations.map((station) => (
            <span
              key={station.id}
              className="pasture-minimap-station"
              title={station.title}
              style={{
                left: station.mapX,
                top: station.mapY,
                background: station.color,
              }}
            >
              {station.icon}
            </span>
          ))}
          <span
            ref={playerRef}
            className="pasture-minimap-player"
            title="You"
          />
        </button>
      ) : null}
    </div>
  );
}
