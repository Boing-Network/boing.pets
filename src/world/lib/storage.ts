import type { WorldPoint } from "../config/zones";

const KEY = "boing-pets-world-position-v1";

export interface SavedWorldPosition {
  zone: string;
  position: WorldPoint;
  updatedAt: number;
}

export function loadWorldPosition(): SavedWorldPosition | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedWorldPosition;
    if (
      !data ||
      typeof data.zone !== "string" ||
      typeof data.position?.x !== "number" ||
      typeof data.position?.y !== "number" ||
      typeof data.position?.z !== "number"
    )
      return null;
    return data;
  } catch {
    return null;
  }
}

export function saveWorldPosition(zone: string, position: WorldPoint): void {
  const payload: SavedWorldPosition = {
    zone,
    position,
    updatedAt: Date.now(),
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
}
