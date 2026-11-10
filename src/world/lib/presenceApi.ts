import { hex32 } from "../../core";
import { shortWallet } from "../../social";
import { apiFetch } from "../../ui/apiClient";
import {
  loadCachedProviderKind,
  readBoingAccounts,
  resolveBoingProvider,
  type BoingProvider,
} from "../../wallet/session";
import { colorFromSeed, guestPresenceIdentity } from "./presenceProtocol";
import {
  clearPresenceToken,
  loadPresenceToken,
  savePresenceToken,
} from "./presenceTokenCache";

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

async function profileName(owner: string): Promise<string> {
  let name = shortWallet(owner);
  try {
    const profile = await api<{
      profile: { display_name: string } | null;
    }>("/api/social/profile?owner=" + encodeURIComponent(owner));
    if (profile.profile?.display_name) name = profile.profile.display_name;
  } catch {
    /* profile optional */
  }
  return name;
}

async function mintPresenceToken(
  provider: BoingProvider,
  owner: string,
  zoneId: string,
): Promise<{ token: string; owner: string; expires_at: number }> {
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
  const confirmed = await api<{
    token: string;
    owner: string;
    expires_at: number;
  }>("/api/world/presence/confirm", { id: challenge.id, signature });
  savePresenceToken({
    token: confirmed.token,
    owner: confirmed.owner,
    zone: zoneId,
    expires_at: confirmed.expires_at,
  });
  return confirmed;
}

/**
 * Prefer a cached / silent wallet session; only prompt to sign when allowed.
 * Falls back to guest identity when Express is missing or signing is declined.
 */
export async function resolvePlazaIdentity(
  zoneId: string,
  opts: { allowPrompt?: boolean } = {},
): Promise<PlazaIdentity> {
  const allowPrompt = opts.allowPrompt ?? false;
  const resolved = await resolveBoingProvider({
    allowWeb: loadCachedProviderKind() !== "extension",
  });
  if (!resolved) return guestPresenceIdentity();
  const provider: BoingProvider = resolved.provider;

  try {
    let accounts = await readBoingAccounts(provider);
    if (!accounts[0] && allowPrompt) {
      accounts = (await provider.request({
        method: "boing_requestAccounts",
        params: [],
      })) as string[];
    }
    if (!accounts?.[0]) return guestPresenceIdentity();

    const owner = hex32(accounts[0]);
    const cached = loadPresenceToken(owner, zoneId);
    if (cached) {
      return {
        id: cached.owner,
        name: await profileName(cached.owner),
        color: colorFromSeed(cached.owner),
        token: cached.token,
        wallet: true,
      };
    }

    if (!allowPrompt) {
      // Avoid blocked popups on automatic page load — Join plaza to sign once.
      return guestPresenceIdentity();
    }

    const confirmed = await mintPresenceToken(provider, owner, zoneId);
    return {
      id: confirmed.owner,
      name: await profileName(confirmed.owner),
      color: colorFromSeed(confirmed.owner),
      token: confirmed.token,
      wallet: true,
    };
  } catch {
    clearPresenceToken();
    return guestPresenceIdentity();
  }
}
