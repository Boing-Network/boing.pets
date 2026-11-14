/** Mini-map projection and station markers for the public pasture. */

import { PASTURE_ZONE } from "../world/config/zones";
import { yardLabelForKind } from "./yardLabels";
import { interactStations, type PastureStationKind } from "./stationInteract";
import { cityStreetSegments } from "./cityLayout";

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
  craft: "#F5F5F0",
  market: "#FF4D00",
  customize: "#F5F5F0",
  mine: "#9fd4e8",
  fish: "#4a8fb5",
  treasure: "#c4a56a",
  garden: "#3f7d4a",
  cook: "#FF4D00",
  race: "#F5F5F0",
  home: "#A3A3A3",
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
  radius: number;
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
      title: yardLabelForKind(kind, station.label).title,
      x: station.position.x,
      z: station.position.z,
      radius: station.radius,
    };
  });
}

/** Minimum pixel gap between station icons after the layout pass. */
export const MINIMAP_ICON_MIN_DIST_PX = 22;
/** Keep spread icons inside the board instead of hanging off the edge. */
export const MINIMAP_ICON_MARGIN_PX = 8;

/**
 * Nudge overlapping mini-map markers apart with a few repulsion iterations.
 * Click-to-walk snaps to a nearby visible letter (or a point already
 * inside that station's prompt radius) so arrival shows the interact prompt.
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

export const MINIMAP_STATION_SNAP_PX = 16;

export type LaidOutMiniMapStation = MiniMapMarker & {
  mapX: number;
  mapY: number;
};

export function layoutMiniMapStations(
  size: number,
  bounds: MiniMapBounds = pastureMiniMapBounds(),
): LaidOutMiniMapStation[] {
  const stations = miniMapStations();
  const mapped = stations.map((station) => worldToMap(station, bounds, size));
  const spread = spreadMiniMapMarkers(mapped, size);
  return stations.map((station, index) => ({
    ...station,
    mapX: spread[index]!.x,
    mapY: spread[index]!.y,
  }));
}

export function snapMiniMapClick(
  click: { x: number; y: number },
  stations: readonly LaidOutMiniMapStation[],
  snapPx = MINIMAP_STATION_SNAP_PX,
): LaidOutMiniMapStation | null {
  let best: LaidOutMiniMapStation | null = null;
  let bestDist = snapPx;
  for (const station of stations) {
    const dist = Math.hypot(click.x - station.mapX, click.y - station.mapY);
    if (dist <= bestDist) {
      best = station;
      bestDist = dist;
    }
  }
  return best;
}

export function walkTargetFromMiniMapClick(
  click: { x: number; y: number },
  size: number,
  stations: readonly LaidOutMiniMapStation[] = layoutMiniMapStations(size),
  bounds: MiniMapBounds = pastureMiniMapBounds(),
): { x: number; z: number; station: LaidOutMiniMapStation | null } {
  const snapped = snapMiniMapClick(click, stations);
  if (snapped) return { x: snapped.x, z: snapped.z, station: snapped };
  const world = mapToWorld(click, bounds, size);
  for (const station of stations) {
    if (
      Math.hypot(world.x - station.x, world.z - station.z) <= station.radius
    ) {
      return { x: station.x, z: station.z, station };
    }
  }
  return { x: world.x, z: world.z, station: null };
}

export type MiniMapStreet = { x1: number; y1: number; x2: number; y2: number };

/** Street grid in map pixels, for the city-style mini-map. */
export function miniMapStreets(
  size: number,
  bounds: MiniMapBounds = pastureMiniMapBounds(),
): MiniMapStreet[] {
  return cityStreetSegments().map((seg) => {
    const a = worldToMap({ x: seg.x1, z: seg.z1 }, bounds, size);
    const b = worldToMap({ x: seg.x2, z: seg.z2 }, bounds, size);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}
