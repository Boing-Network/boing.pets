import { hex32 } from "../../core";
import { shortWallet } from "../../social";
import { apiFetch } from "../../ui/apiClient";
import { colorFromSeed, guestPresenceIdentity } from "./presenceProtocol";

interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface PlazaIdentity {
  id: string;
  name: string;
  color: string;
  token?: string;
  wallet?: boolean;
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, body);
}

/** Prefer a signed wallet session; fall back to guest identity. */
export async function resolvePlazaIdentity(
  zoneId: string,
): Promise<PlazaIdentity> {
  const provider = (window as Window & { boing?: Provider }).boing;
  if (!provider) return guestPresenceIdentity();

  try {
    const accounts = (await provider.request({
      method: "boing_requestAccounts",
      params: [],
    })) as string[];
    const owner = hex32(accounts?.[0]);
    const challenge = await api<{ id: string; message: string }>(
      "/api/world/presence/challenge",
      { owner, zone: zoneId },
    );
    const signature = await provider.request({
      method: "boing_signMessage",
      params: [challenge.message, owner],
    });
    if (typeof signature !== "string")
      throw new Error("Wallet did not return a signature");
    const confirmed = await api<{ token: string; owner: string }>(
      "/api/world/presence/confirm",
      { id: challenge.id, signature },
    );
    let name = shortWallet(owner);
    try {
      const profile = await api<{
        profile: { display_name: string } | null;
      }>("/api/social/profile?owner=" + encodeURIComponent(owner));
      if (profile.profile?.display_name) name = profile.profile.display_name;
    } catch {
      /* profile optional */
    }
    return {
      id: confirmed.owner,
      name,
      color: colorFromSeed(confirmed.owner),
      token: confirmed.token,
      wallet: true,
    };
  } catch {
    return guestPresenceIdentity();
  }
}
