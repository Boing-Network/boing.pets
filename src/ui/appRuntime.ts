import {
  state,
  traits,
  type AchievementCode,
  type Action,
  type Pet,
} from "../core";
import type { EquippedCosmetics } from "../content/cosmetics";
import { apiFetch } from "./apiClient";
import { isCapMessage } from "../audio/settings";
import { playSfx } from "../audio";
import {
  clearSocialSession,
  loadSocialSession,
  saveSocialSession,
} from "../social/sessionCache";
import type { BoingProvider, WalletProviderKind } from "../wallet/session";

export type Provider = BoingProvider;
export type ViewPet = Pet & {
  traits: ReturnType<typeof traits>;
  state: ReturnType<typeof state>;
  achievements?: Array<{
    code: AchievementCode;
    unlocked_at: number;
    title: string;
    description: string;
  }>;
  mind?: {
    mood: string;
    favoriteActivity: string;
    suggestion: string;
    cues: string[];
  };
  cosmetics?: EquippedCosmetics;
};

export interface Challenge {
  id: string;
  owner: string;
  action: Action;
  message: string;
  transaction: Record<string, unknown> | null;
}

export interface Pending {
  id: string;
  owner: string;
  tx_hash: string;
}

export const app = {
  provider: null as Provider | null,
  owner: "",
  /** live = silent provider accounts; cached = localStorage-only pending re-auth */
  walletKind: null as "live" | "cached" | null,
  /** Which wallet backend the cached session should use. */
  providerKind: null as WalletProviderKind | null,
  busy: false,
  mine: null as ViewPet | null,
  offset: 0,
  next: null as number | null,
  dmTarget: "",
};

export const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
export const $maybe = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);

export function on(
  selector: string,
  event: "click",
  handler: (ev: MouseEvent) => void,
) {
  $maybe(selector)?.addEventListener(event, handler);
}

export function notice(text: string, error = false) {
  const el = $maybe("#notice");
  if (el) {
    el.textContent = text;
    el.classList.toggle("error", error);
  }
  if (error) playSfx(isCapMessage(text) ? "cap" : "error");
}

export async function api<T>(
  path: string,
  body?: unknown,
  init?: { headers?: Record<string, string> },
): Promise<T> {
  return apiFetch<T>(path, body, init);
}

export function pending(): Pending | null {
  try {
    return JSON.parse(
      localStorage.getItem("boing-pets-pending") || "null",
    ) as Pending | null;
  } catch {
    return null;
  }
}

export { clearSocialSession, loadSocialSession, saveSocialSession };
