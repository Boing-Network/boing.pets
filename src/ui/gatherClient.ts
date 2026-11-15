/** Quarry gather client. The server decides ticks. */

import { GATHER_COPY } from "../content/gathering";
import { loadSocialSession } from "../social/sessionCache";
import { apiFetch } from "./apiClient";
import { sessionApi } from "./socialSession";

export type GatherItem = { itemId: string; name: string; qty: number };
export type GatherLevelUp = { label: string; level: number; prestige: number };

export type GatherStatus = {
  enabled: boolean;
  mintEnabled: boolean;
  packCap?: number;
  skill?: {
    xp: number;
    level: number;
    prestige: number;
    xpAtLevel: number;
    xpAtNext: number;
  };
  pack?: { units: number; cap: number; items: GatherItem[] };
  session?: {
    id: string;
    status: string;
    tickMs: number;
    ticksSettled: number;
    startedAt: number;
  } | null;
  cred?: { paidUnits: number; paid: number; cap: number };
  nodes?: Array<{
    id: string;
    name: string;
    minLevel: number;
    minTier: number;
  }>;
  pickaxeTier?: number;
  mintPresets?: Array<{ qty: number; enabled: boolean }>;
  copy?: typeof GATHER_COPY;
  levelUps?: GatherLevelUp[];
  credGained?: number;
  banked?: GatherItem[];
  now?: number;
};

export async function gatherQuiet(owner: string): Promise<GatherStatus | null> {
  const token = loadSocialSession(owner)?.token;
  if (!token) return null;
  try {
    return await apiFetch<GatherStatus>(
      `/api/gather/status?owner=${encodeURIComponent(owner)}`,
      undefined,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch {
    return null;
  }
}

export async function gatherEnabled(): Promise<boolean> {
  try {
    const status = await apiFetch<GatherStatus>("/api/gather/status");
    return status.enabled === true;
  } catch {
    return false;
  }
}

export function gatherStatus(owner: string): Promise<GatherStatus> {
  return sessionApi<GatherStatus>(
    `/api/gather/status?owner=${encodeURIComponent(owner)}`,
  );
}

export function gatherAct(
  path:
    | "/api/gather/start"
    | "/api/gather/settle"
    | "/api/gather/stop"
    | "/api/gather/bank",
  owner: string,
): Promise<GatherStatus> {
  return sessionApi<GatherStatus>(path, { owner, skill: "quarry" });
}

export { GATHER_COPY };
