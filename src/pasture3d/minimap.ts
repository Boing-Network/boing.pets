/** Mini-map projection and station markers for the public pasture. */

import { PASTURE_ZONE } from "../world/config/zones";
import { ACTIVITY_AREA_META } from "./activityAreas";
import {
  interactStations,
  isActivityStationKind,
  type PastureStationKind,
} from "./stationInteract";

export const MINIMAP_STATION_ICON: Record<PastureStationKind, string> = {
  craft: "C",
  market: "M",
  customize: "U",
  mine: "Q",
  fish: "F",
  treasure: "D",
  garden: "G",
  cook: "K",
  race: "R",
  home: "H",
};

export const MINIMAP_STATION_COLOR: Record<PastureStationKind, string> = {
  craft: "#c4a574",
  market: "#e8b86d",
  customize: "#c9b8d9",
  mine: "#8ab0c8",
  fish: "#4a8fb5",
  treasure: "#c9a66b",
  garden: "#7eab62",
  cook: "#d9896b",
  race: "#e8c27a",
  home: "#e8d5b0",
};

export type MiniMapBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type MiniMapMarker = {
  id: string;
  kind: PastureStationKind;
  icon: string;
  color: string;
  title: string;
  x: number;
  z: number;
};

export function pastureMiniMapBounds(): MiniMapBounds {
  return { ...PASTURE_ZONE.bounds };
}

export function worldToMap(
  pos: { x: number; z: number },
  bounds: MiniMapBounds,
  size: number,
): { x: number; y: number } {
  const width = bounds.maxX - bounds.minX || 1;
  const depth = bounds.maxZ - bounds.minZ || 1;
  return {
    x: ((pos.x - bounds.minX) / width) * size,
    y: ((pos.z - bounds.minZ) / depth) * size,
  };
}

export function mapToWorld(
  point: { x: number; y: number },
  bounds: MiniMapBounds,
  size: number,
): { x: number; z: number } {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  return {
    x: bounds.minX + (point.x / size) * width,
    z: bounds.minZ + (point.y / size) * depth,
  };
}

export function miniMapStations(): MiniMapMarker[] {
  return interactStations(PASTURE_ZONE).map((station) => {
    const kind = station.kind as PastureStationKind;
    return {
      id: `${kind}-${station.position.x}-${station.position.z}`,
      kind,
      icon: MINIMAP_STATION_ICON[kind] ?? "•",
      color: MINIMAP_STATION_COLOR[kind] ?? "#e8f6ee",
      title: isActivityStationKind(kind)
        ? ACTIVITY_AREA_META[kind].title
        : station.label,
      x: station.position.x,
      z: station.position.z,
    };
  });
}

/** Minimum pixel gap between station icons after the layout pass. */
export const MINIMAP_ICON_MIN_DIST_PX = 16;
/** Keep spread icons inside the board instead of hanging off the edge. */
export const MINIMAP_ICON_MARGIN_PX = 8;

/**
 * Nudge overlapping mini-map markers apart with a few repulsion iterations.
 * Click-to-walk still uses the original board coordinates, not these offsets.
 */
export function spreadMiniMapMarkers(
  points: { x: number; y: number }[],
  size: number,
  minDist = MINIMAP_ICON_MIN_DIST_PX,
  margin = MINIMAP_ICON_MARGIN_PX,
  iterations = 12,
): { x: number; y: number }[] {
  const pts = points.map((point) => ({ x: point.x, y: point.y }));
  const lo = margin;
  const hi = size - margin;
  for (let step = 0; step < iterations; step++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        let dx = pts[j].x - pts[i].x;
        let dy = pts[j].y - pts[i].y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = ((i + 1) % 2 === 0 ? -1 : 1) * 0.01;
          dy = ((j + 1) % 2 === 0 ? 1 : -1) * 0.01;
          dist = Math.hypot(dx, dy);
        }
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          pts[i].x -= ux * push;
          pts[i].y -= uy * push;
          pts[j].x += ux * push;
          pts[j].y += uy * push;
        }
      }
    }
    for (const point of pts) {
      point.x = Math.min(hi, Math.max(lo, point.x));
      point.y = Math.min(hi, Math.max(lo, point.y));
    }
  }
  return pts;
}
