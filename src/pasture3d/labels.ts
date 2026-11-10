/** Pasture nameplates use species. Pets have no separate nickname field. */

export function pasturePetLabel(opts: {
  species?: string | null;
  fallback?: string | null;
}): string {
  const species = (opts.species || "").trim();
  if (species) return species;
  const fallback = (opts.fallback || "").trim();
  return fallback || "Buddy";
}

/**
 * A pet should render exactly one forward-facing nameplate.
 * A second, mirrored (back-face) copy is what produced the "elgnioB" overlap.
 */
export function pastureNameplateLayers(text: string): Array<{
  text: string;
  mirrored: boolean;
}> {
  const label = text.trim() || "Buddy";
  return [{ text: label, mirrored: false }];
}

/** Hide far nameplates so a busy pasture stays readable and cheap. */
export const PASTURE_NAMEPLATE_CULL_DISTANCE = 38;
export const PASTURE_BUBBLE_CULL_DISTANCE = 52;

export function pastureNameplateVisible(distanceToCamera: number): boolean {
  return distanceToCamera <= PASTURE_NAMEPLATE_CULL_DISTANCE;
}

export function pastureBubbleVisible(distanceToCamera: number): boolean {
  return distanceToCamera <= PASTURE_BUBBLE_CULL_DISTANCE;
}
