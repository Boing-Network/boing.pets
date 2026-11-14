/** Display names and orange tags for The Yard stencil labels. */
import type { PastureStationKind } from "./stationInteract";

export const YARD_LABEL_FILL = "#F5F5F0";
export const YARD_LABEL_STROKE = "#0A0A0A";
export const YARD_LABEL_TAG_FILL = "#FF4D00";

export type YardLabelSpec = { title: string; tag: string };

const BY_LANDMARK_ID: Record<string, YardLabelSpec> = {
  "kitchen-hut": { title: "STREET KITCHEN", tag: "COOK" },
  "market-stall": { title: "THE DROP", tag: "MARKET STALL / LIVE" },
  "crafting-station": { title: "PRINT SHOP", tag: "CRAFT" },
  "customization-station": { title: "FITTING ROOM", tag: "CUSTOM" },
  "pond-pier": { title: "ROOFTOP CANAL", tag: "FISH" },
  "lily-pond": { title: "ROOFTOP CANAL", tag: "FISH" },
  "treasure-dig": { title: "TREASURE DIG", tag: "DIG" },
  "race-gate": { title: "RACE STRIP", tag: "RACE" },
  "crystal-quarry": { title: "CRYSTAL QUARRY", tag: "MINE" },
  "garden-beds": { title: "GARDEN BEDS", tag: "CROPS" },
  "old-oak": { title: "OLD OAK", tag: "LANDMARK" },
  "home-plot": { title: "HOME PLOT", tag: "DESK" },
  wildflowers: { title: "WILDFLOWERS", tag: "DECOR" },
  "snack-barn": { title: "ROOF SHACK", tag: "STORAGE" },
};

const BY_KIND: Record<PastureStationKind, YardLabelSpec> = {
  cook: BY_LANDMARK_ID["kitchen-hut"]!,
  market: BY_LANDMARK_ID["market-stall"]!,
  craft: BY_LANDMARK_ID["crafting-station"]!,
  customize: BY_LANDMARK_ID["customization-station"]!,
  fish: BY_LANDMARK_ID["pond-pier"]!,
  treasure: BY_LANDMARK_ID["treasure-dig"]!,
  race: BY_LANDMARK_ID["race-gate"]!,
  mine: BY_LANDMARK_ID["crystal-quarry"]!,
  garden: BY_LANDMARK_ID["garden-beds"]!,
  home: BY_LANDMARK_ID["home-plot"]!,
};

export function yardLabelForLandmark(id: string, fallback = ""): YardLabelSpec {
  return (
    BY_LANDMARK_ID[id] || {
      title: (fallback || id).toUpperCase(),
      tag: "",
    }
  );
}

export function yardLabelForKind(
  kind: PastureStationKind,
  fallback = "",
): YardLabelSpec {
  return (
    BY_KIND[kind] || {
      title: (fallback || kind).toUpperCase(),
      tag: "",
    }
  );
}
