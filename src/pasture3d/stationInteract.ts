/** In-pasture Crafting Station and Market Stall interact helpers. */

import type { WorldStation, WorldZoneConfig } from "../world/config/zones";

export type PastureStationKind = "craft" | "market";

export const PASTURE_STATION_KINDS: readonly PastureStationKind[] = [
  "craft",
  "market",
];

export const CUSTOM_PASTURE_LANDMARK_IDS = [
  "crafting-station",
  "market-stall",
] as const;

export function isPastureStationKind(
  kind: WorldStation["kind"],
): kind is PastureStationKind {
  return kind === "craft" || kind === "market";
}

export function isCustomPastureLandmark(id: string): boolean {
  return (CUSTOM_PASTURE_LANDMARK_IDS as readonly string[]).includes(id);
}

export function interactStations(zone: WorldZoneConfig): WorldStation[] {
  return zone.stations.filter((station) => isPastureStationKind(station.kind));
}

export function stationByKind(
  zone: WorldZoneConfig,
  kind: PastureStationKind,
): WorldStation | undefined {
  return zone.stations.find((station) => station.kind === kind);
}

export function distanceToStation(
  pos: { x: number; z: number },
  station: WorldStation,
): number {
  return Math.hypot(pos.x - station.position.x, pos.z - station.position.z);
}

export function isWithinStationRadius(
  pos: { x: number; z: number },
  station: WorldStation,
): boolean {
  return distanceToStation(pos, station) <= station.radius;
}

/** Closest craft/market station in range, if any. */
export function nearbyInteractStation(
  pos: { x: number; z: number },
  zone: WorldZoneConfig,
): WorldStation | null {
  let best: WorldStation | null = null;
  let bestDist = Infinity;
  for (const station of interactStations(zone)) {
    const dist = distanceToStation(pos, station);
    if (dist <= station.radius && dist < bestDist) {
      best = station;
      bestDist = dist;
    }
  }
  return best;
}

export function stationPrompt(station: WorldStation): string {
  if (station.kind === "craft") return "Press E to craft";
  if (station.kind === "market") return "Press E to open the market";
  return station.hint;
}

export function stationActionLabel(station: WorldStation): string {
  if (station.kind === "craft") return "Craft";
  if (station.kind === "market") return "Open market";
  return "Interact";
}
