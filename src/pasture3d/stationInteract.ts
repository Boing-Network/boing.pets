/** In-pasture station and daily-activity area interact helpers. */

import type { WorldStation, WorldZoneConfig } from "../world/config/zones";

export type DeskStationKind = "craft" | "market" | "customize";
export type ActivityStationKind =
  "mine" | "fish" | "treasure" | "garden" | "cook" | "race";
export type PastureStationKind = DeskStationKind | ActivityStationKind;

export const DESK_STATION_KINDS: readonly DeskStationKind[] = [
  "craft",
  "market",
  "customize",
];

export const ACTIVITY_STATION_KINDS: readonly ActivityStationKind[] = [
  "mine",
  "fish",
  "treasure",
  "garden",
  "cook",
  "race",
];

export const PASTURE_STATION_KINDS: readonly PastureStationKind[] = [
  ...DESK_STATION_KINDS,
  ...ACTIVITY_STATION_KINDS,
];

export const CUSTOM_PASTURE_LANDMARK_IDS = [
  "crafting-station",
  "market-stall",
  "customization-station",
  "crystal-quarry",
  "pond-pier",
  "treasure-dig",
  "garden-beds",
  "kitchen-hut",
  "race-gate",
] as const;

export function isDeskStationKind(
  kind: WorldStation["kind"],
): kind is DeskStationKind {
  return kind === "craft" || kind === "market" || kind === "customize";
}

export function isActivityStationKind(
  kind: WorldStation["kind"],
): kind is ActivityStationKind {
  return (ACTIVITY_STATION_KINDS as readonly string[]).includes(kind);
}

export function isPastureStationKind(
  kind: WorldStation["kind"],
): kind is PastureStationKind {
  return isDeskStationKind(kind) || isActivityStationKind(kind);
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

/** Closest interactable pasture station in range, if any. */
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
  if (station.kind === "customize") return "Press E to customize";
  if (station.kind === "mine") return "Press E to mine";
  if (station.kind === "fish") return "Press E to fish";
  if (station.kind === "treasure") return "Press E to dig";
  if (station.kind === "garden") return "Press E to tend the garden";
  if (station.kind === "cook") return "Press E to cook";
  if (station.kind === "race") return "Press E to race";
  return station.hint;
}

export function stationActionLabel(station: WorldStation): string {
  if (station.kind === "craft") return "Craft";
  if (station.kind === "market") return "Open market";
  if (station.kind === "customize") return "Customize";
  if (station.kind === "mine") return "Mine";
  if (station.kind === "fish") return "Fish";
  if (station.kind === "treasure") return "Dig";
  if (station.kind === "garden") return "Tend garden";
  if (station.kind === "cook") return "Cook";
  if (station.kind === "race") return "Race";
  return "Interact";
}
