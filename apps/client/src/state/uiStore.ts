import { create } from "zustand";
import type { TimeScale } from "@boing-pets/contract";

export type UiRoute = "map" | "lineage";

type UiState = {
  route: UiRoute;
  selectedCreatureId: number | null;
  paused: boolean;
  scale: TimeScale;
  setRoute: (route: UiRoute) => void;
  selectCreature: (creatureId: number | null) => void;
  setPaused: (paused: boolean) => void;
  setScale: (scale: TimeScale) => void;
};

export const useUiStore = create<UiState>((set) => ({
  route: "map",
  selectedCreatureId: null,
  paused: false,
  scale: 1,
  setRoute: (route) => set({ route }),
  selectCreature: (creatureId) => set({ selectedCreatureId: creatureId }),
  setPaused: (paused) => set({ paused }),
  setScale: (scale) => set({ scale }),
}));
