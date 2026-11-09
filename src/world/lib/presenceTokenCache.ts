const STORAGE_KEY = "boing-pets-presence-token-v1";

export interface CachedPresenceToken {
  token: string;
  owner: string;
  zone: string;
  expires_at: number;
}

function readAll(): CachedPresenceToken[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedPresenceToken[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (row) =>
        typeof row?.token === "string" &&
        typeof row?.owner === "string" &&
        typeof row?.zone === "string" &&
        typeof row?.expires_at === "number" &&
        row.expires_at > now + 5_000,
    );
  } catch {
    return [];
  }
}

function writeAll(rows: CachedPresenceToken[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* private mode / quota */
  }
}

export function loadPresenceToken(
  owner: string,
  zone: string,
): CachedPresenceToken | null {
  const rows = readAll();
  const hit = rows.find((row) => row.owner === owner && row.zone === zone);
  if (!hit) return null;
  writeAll(rows);
  return hit;
}

export function savePresenceToken(row: CachedPresenceToken) {
  const others = readAll().filter(
    (item) => !(item.owner === row.owner && item.zone === row.zone),
  );
  others.push(row);
  writeAll(others);
}

export function clearPresenceToken(owner?: string, zone?: string) {
  if (!owner) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  writeAll(
    readAll().filter((row) =>
      zone ? !(row.owner === owner && row.zone === zone) : row.owner !== owner,
    ),
  );
}
