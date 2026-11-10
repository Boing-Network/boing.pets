import { createRoot, type Root } from "react-dom/client";
import {
  PastureApp,
  type PastureAppProps,
  type PastureDebug,
} from "./PastureApp";
import type { PasturePet } from "./types";
import type { EquippedCosmetics } from "../content/cosmetics";
import type { PresenceChat } from "../world/hooks/usePlazaPresence";

export type PastureMount = {
  update: (patch: Partial<PastureAppProps>) => void;
  setPets: (pets: PasturePet[]) => void;
  setOwner: (owner: string | null) => void;
  setEquipped: (owner: string, cosmetics?: EquippedCosmetics) => void;
  sendWalk: (x: number, z: number) => void;
  inspectOwner: (owner: string) => void;
  getDebug: () => PastureDebug | null;
  unmount: () => void;
};

let root: Root | null = null;
let props: PastureAppProps | null = null;
const handleRef: { current: PastureDebug | null } = { current: null };

export function mountPasture3d(
  el: HTMLElement,
  initial: PastureAppProps,
): PastureMount {
  if (root) {
    root.unmount();
    root = null;
  }
  props = { ...initial, handleRef };
  root = createRoot(el);
  root.render(<PastureApp {...props} />);

  const render = () => {
    if (root && props)
      root.render(<PastureApp {...props} handleRef={handleRef} />);
  };

  return {
    update(patch) {
      if (!props) return;
      props = { ...props, ...patch };
      render();
    },
    setPets(pets) {
      if (!props) return;
      props = { ...props, pets };
      render();
    },
    setOwner(owner) {
      if (!props) return;
      props = { ...props, owner };
      render();
    },
    setEquipped(owner, cosmetics) {
      if (!props) return;
      const pets = props.pets.map((pet) =>
        pet.owner === owner ? { ...pet, cosmetics } : pet,
      );
      props = { ...props, pets };
      render();
    },
    sendWalk(x, z) {
      handleRef.current?.walkTo(x, z);
    },
    inspectOwner(owner) {
      handleRef.current?.inspectOwner(owner);
    },
    getDebug() {
      return handleRef.current;
    },
    unmount() {
      root?.unmount();
      root = null;
      props = null;
    },
  };
}

export type { PresenceChat, PasturePet };
