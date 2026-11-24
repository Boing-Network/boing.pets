/** Whether the Workshop menu is open. Shared by its button and shortcut. */
import { create } from "zustand";

type WorkshopState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useWorkshopStore = create<WorkshopState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));
