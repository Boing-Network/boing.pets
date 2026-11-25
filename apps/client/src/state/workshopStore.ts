/**
 * Whether the Workshop menu is open, shared by its button and shortcut; the
 * bag as the Workshop last fetched it, for other panels that need to know
 * what the player holds; and a territory another panel asked it to open on.
 */
import { create } from "zustand";
import type { InventoryEntry } from "@boing-pets/contract";

type WorkshopState = {
  open: boolean;
  /** Null until the Workshop has fetched the bag once. */
  bag: readonly InventoryEntry[] | null;
  /** Set by `openFor`; the Workshop takes it and clears it. */
  focus: { territoryId: number; creatureId: number | null } | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setBag: (bag: readonly InventoryEntry[]) => void;
  /** Open the Workshop's bag with this territory (and creature) chosen. */
  openFor: (territoryId: number, creatureId?: number | null) => void;
  clearFocus: () => void;
};

export const useWorkshopStore = create<WorkshopState>((set, get) => ({
  open: false,
  bag: null,
  focus: null,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
  setBag: (bag) => set({ bag }),
  openFor: (territoryId, creatureId = null) =>
    set({ open: true, focus: { territoryId, creatureId } }),
  clearFocus: () => set({ focus: null }),
}));
