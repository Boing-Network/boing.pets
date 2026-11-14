/** Fetch helpers for Idle Adventures. Local dev clock is header-only. */

import { ADVENTURE_DEV_CLOCK_HEADER } from "../content/adventureClock";
import { loadSocialSession } from "../social/sessionCache";
import { api, app } from "./appRuntime";
import { ensureSocialSession } from "./socialSession";
import type { AdventureCollectionItem, AdventureRunView } from "./adventureHub";
import type {
  AdventurePreview,
  AdventureStyleSnapshot,
} from "../content/adventures";

const DEV_NOW_KEY = "boing-pets-adventure-dev-now";

export function loadAdventureDevNow(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DEV_NOW_KEY);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setAdventureDevNow(value: number | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (value == null) sessionStorage.removeItem(DEV_NOW_KEY);
    else sessionStorage.setItem(DEV_NOW_KEY, String(value));
  } catch {
    /* ignore */
  }
}

export function adventureClockHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const devNow = loadAdventureDevNow();
  if (devNow) headers[ADVENTURE_DEV_CLOCK_HEADER] = String(devNow);
  return headers;
}

export function adventureAuthHeaders(): Record<string, string> {
  const headers = adventureClockHeaders();
  if (app.owner) {
    const token = loadSocialSession(app.owner)?.token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export type AdventuresDesk = {
  locations: unknown[];
  durations: unknown[];
  rates: Record<string, unknown>;
  runs: AdventureRunView[];
  slots: number;
  completed?: number;
  pity?: number;
  styleLuck?: AdventureStyleSnapshot;
  preview: AdventurePreview[];
  events?: { id: string; name: string; endsAt: number }[];
  collection?: {
    found: number;
    total: number;
    items: AdventureCollectionItem[];
  };
  history?: AdventureRunView[];
  devClock?: boolean;
};

export async function fetchAdventuresDesk(): Promise<AdventuresDesk> {
  const owner = app.owner;
  const query = owner ? `?owner=${encodeURIComponent(owner)}` : "";
  return api<AdventuresDesk>("/api/adventures" + query, undefined, {
    headers: adventureAuthHeaders(),
  });
}

export async function fetchAdventureHistory(): Promise<AdventureRunView[]> {
  if (!app.owner) return [];
  const token = await ensureSocialSession();
  const body = await api<{ history: AdventureRunView[] }>(
    "/api/adventures/history?owner=" + encodeURIComponent(app.owner),
    undefined,
    {
      headers: { Authorization: `Bearer ${token}`, ...adventureClockHeaders() },
    },
  );
  return body.history ?? [];
}

export async function startAdventure(input: {
  locationId: string;
  durationId: string;
}): Promise<{ run: AdventureRunView; preview: AdventurePreview }> {
  const token = await ensureSocialSession();
  return api(
    "/api/adventures/start",
    {
      owner: app.owner,
      location_id: input.locationId,
      duration_id: input.durationId,
    },
    {
      headers: { Authorization: `Bearer ${token}`, ...adventureClockHeaders() },
    },
  );
}

export async function claimAdventure(runId: string): Promise<{
  run: AdventureRunView;
  idempotent?: boolean;
}> {
  const token = await ensureSocialSession();
  return api(
    "/api/adventures/claim",
    {
      owner: app.owner,
      run_id: runId,
      claim_id: crypto.randomUUID(),
    },
    {
      headers: { Authorization: `Bearer ${token}`, ...adventureClockHeaders() },
    },
  );
}

export async function claimAllAdventures(): Promise<{
  claimed: AdventureRunView[];
  count: number;
}> {
  const token = await ensureSocialSession();
  return api(
    "/api/adventures/claim-all",
    { owner: app.owner },
    {
      headers: { Authorization: `Bearer ${token}`, ...adventureClockHeaders() },
    },
  );
}
