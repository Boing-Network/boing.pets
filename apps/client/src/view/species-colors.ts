/** Presentation colors copied from the v1 species catalog. Not authoritative. */

const SPECIES_COLORS: Record<number, string> = {
  1: "#E07A3D", // fernfox
  2: "#6B8F71", // mossback
  3: "#C2B280", // pebblehare
};

export function colorForSpecies(speciesId: number): string {
  return SPECIES_COLORS[speciesId] ?? "#c4c4c4";
}
