import { useEffect, useState } from "react";
import { canHavePetFollower, fetchPetLook, type PetLook } from "../lib/petLook";

export function usePetLook(owner: string | null | undefined) {
  const [look, setLook] = useState<PetLook | null>(null);

  useEffect(() => {
    if (!canHavePetFollower(owner)) {
      setLook(null);
      return;
    }
    let cancelled = false;
    void fetchPetLook(owner!).then((next) => {
      if (!cancelled) setLook(next);
    });
    return () => {
      cancelled = true;
    };
  }, [owner]);

  return look;
}
