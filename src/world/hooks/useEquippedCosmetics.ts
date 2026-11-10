import { useEffect, useState } from "react";
import type { EquippedCosmetics } from "../../content/cosmetics";
import { apiFetch } from "../../ui/apiClient";
import { WALLET_ID_RE } from "../lib/presenceProtocol";

const cache = new Map<string, EquippedCosmetics>();

export function useEquippedCosmetics(owner: string | null | undefined) {
  const [equipped, setEquipped] = useState<EquippedCosmetics | undefined>(
    () => (owner && cache.get(owner)) || undefined,
  );

  useEffect(() => {
    if (!owner || !WALLET_ID_RE.test(owner)) {
      setEquipped(undefined);
      return;
    }
    const cached = cache.get(owner);
    if (cached) setEquipped(cached);
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ equipped?: EquippedCosmetics }>(
          "/api/pet/cosmetics?owner=" + encodeURIComponent(owner),
        );
        const next =
          data.equipped && Object.keys(data.equipped).length
            ? data.equipped
            : undefined;
        if (next) cache.set(owner, next);
        if (!cancelled) setEquipped(next);
      } catch {
        if (!cancelled) setEquipped(cached);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner]);

  return equipped;
}
