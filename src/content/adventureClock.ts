/** Local-only adventure clock. Production requests can never honor a client time. */

export const ADVENTURE_DEV_CLOCK_HEADER = "x-adventure-now";
export const ADVENTURE_DEV_CLOCK_FLAG = "1";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export type AdventureClockEnv = {
  ADVENTURE_DEV_CLOCK?: string;
  APP_ORIGIN?: string;
};

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return LOCAL_HOSTS.has(host);
}

export function adventureDevClockEnabled(
  env: AdventureClockEnv,
  requestUrl: string,
): boolean {
  if (env.ADVENTURE_DEV_CLOCK !== ADVENTURE_DEV_CLOCK_FLAG) return false;
  try {
    return isLocalHostname(new URL(requestUrl).hostname);
  } catch {
    return false;
  }
}

export function parseAdventureNowValue(
  raw: string | null | undefined,
): number | null {
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

export function resolveAdventureNow(
  request: { url: string; headers: { get(name: string): string | null } },
  env: AdventureClockEnv,
  wallNow: number,
): { now: number; devClock: boolean } {
  const devClock = adventureDevClockEnabled(env, request.url);
  if (!devClock) return { now: wallNow, devClock: false };
  const header = parseAdventureNowValue(
    request.headers.get(ADVENTURE_DEV_CLOCK_HEADER),
  );
  let query: number | null = null;
  try {
    query = parseAdventureNowValue(
      new URL(request.url).searchParams.get("now"),
    );
  } catch {
    query = null;
  }
  const chosen = header ?? query;
  if (chosen == null) return { now: wallNow, devClock: true };
  return { now: chosen, devClock: true };
}
