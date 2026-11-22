import { useEffect, useState } from "react";
import { loadSpeciesLiveCounts, type SpeciesLiveCounts } from "./bestiary-live";

export function useSpeciesLiveCounts(): ReadonlyMap<
  string,
  SpeciesLiveCounts
> | null {
  const [counts, setCounts] = useState<ReadonlyMap<
    string,
    SpeciesLiveCounts
  > | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSpeciesLiveCounts(
      window.location.search,
      import.meta.env.VITE_LIVING_PETS_MP_URL as string | undefined,
    ).then((result) => {
      if (!cancelled) setCounts(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return counts;
}
