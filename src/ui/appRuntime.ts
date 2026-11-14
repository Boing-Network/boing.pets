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
import { classifyWalletError } from "../wallet/txFeedback";
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

export function notice(
  text: string,
  error = false,
  opts?: { retry?: () => void },
) {
  const retry = opts?.retry;
  const el = $maybe("#notice");
  if (el) fillNotice(el, text, error, retry);
  showPastureTxToast(text, error, retry);
  if (error) playSfx(isCapMessage(text) ? "cap" : "error");
}

function fillNotice(
  el: HTMLElement,
  text: string,
  error: boolean,
  retry?: () => void,
) {
  el.classList.toggle("error", error);
  el.hidden = false;
  el.replaceChildren();
  const message = document.createElement("span");
  message.className = "notice-text";
  message.textContent = text;
  el.append(message);
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "notice-retry";
    button.textContent = "Retry";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      retry();
    });
    el.append(button);
  }
}

function showPastureTxToast(text: string, error: boolean, retry?: () => void) {
  const canvas = $maybe("#pasture-canvas");
  let toast = document.querySelector(".pasture-tx-toast") as HTMLElement | null;
  if (!error && !retry) {
    if (toast && !document.querySelector("#notice")) {
      fillNotice(toast, text, false);
    } else if (toast) {
      toast.hidden = true;
    }
    return;
  }
  if (!canvas) return;
  const host = document.querySelector(".pasture-3d-stage") || canvas;
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "pasture-tx-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("data-hud", "tx-toast");
    host.append(toast);
  } else if (toast.parentElement !== host) {
    host.append(toast);
  }
  fillNotice(toast, text, error, retry);
}

export function noticeWalletError(error: unknown, retry?: () => void) {
  const feedback = classifyWalletError(error);
  notice(feedback.message, true, {
    retry: feedback.retryable ? retry : undefined,
  });
  return feedback;
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
