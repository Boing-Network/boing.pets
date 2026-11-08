import { WALLET_ID_RE } from "./presenceProtocol";

export interface PetLook {
  species: string;
  hue: number;
  accent: number;
  antenna: number;
  spots: number;
}

const cache = new Map<string, PetLook | null>();
const inflight = new Map<string, Promise<PetLook | null>>();

export function canHavePetFollower(owner: string | null | undefined): boolean {
  return !!owner && WALLET_ID_RE.test(owner);
}

export async function fetchPetLook(owner: string): Promise<PetLook | null> {
  if (!canHavePetFollower(owner)) return null;
  if (cache.has(owner)) return cache.get(owner) ?? null;
  const pending = inflight.get(owner);
  if (pending) return pending;
  const task = (async () => {
    try {
      const response = await fetch(
        "/api/pet?owner=" + encodeURIComponent(owner),
      );
      const data = (await response.json()) as {
        pet?: { traits?: PetLook } | null;
      };
      const look = data.pet?.traits
        ? {
            species: data.pet.traits.species,
            hue: data.pet.traits.hue,
            accent: data.pet.traits.accent,
            antenna: data.pet.traits.antenna,
            spots: data.pet.traits.spots,
          }
        : null;
      cache.set(owner, look);
      return look;
    } catch {
      cache.set(owner, null);
      return null;
    } finally {
      inflight.delete(owner);
    }
  })();
  inflight.set(owner, task);
  return task;
}

/** Test helper — clear memoized looks between cases. */
export function clearPetLookCache() {
  cache.clear();
  inflight.clear();
}
