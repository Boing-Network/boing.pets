import {
  useEffect,
  useRef,
  type MouseEvent,
  type MutableRefObject,
} from "react";
import type { LivePose } from "../world/scene/Player";
import {
  mapToWorld,
  miniMapStations,
  pastureMiniMapBounds,
  worldToMap,
} from "./minimap";

export const PASTURE_MINIMAP_BOARD_SIZE = 140;

const stations = miniMapStations();
const bounds = pastureMiniMapBounds();

export function PastureMinimap({
  poseRef,
  onWalk,
}: {
  poseRef: MutableRefObject<LivePose>;
  onWalk: (x: number, z: number) => void;
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
    const world = mapToWorld({ x, y }, bounds, PASTURE_MINIMAP_BOARD_SIZE);
    onWalk(world.x, world.z);
  };

  return (
    <div
      className="pasture-minimap"
      data-hud="minimap"
      aria-label="Pasture mini-map"
    >
      <p className="pasture-minimap-title">Map</p>
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
        {stations.map((station) => {
          const mapped = worldToMap(
            station,
            bounds,
            PASTURE_MINIMAP_BOARD_SIZE,
          );
          return (
            <span
              key={station.id}
              className="pasture-minimap-station"
              title={station.title}
              style={{
                left: mapped.x,
                top: mapped.y,
                background: station.color,
              }}
            >
              {station.icon}
            </span>
          );
        })}
        <span ref={playerRef} className="pasture-minimap-player" title="You" />
      </button>
    </div>
  );
}
