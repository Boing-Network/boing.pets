const STORAGE_KEY = "boing-pets-social-session-v1";

export interface CachedSocialSession {
  token: string;
  owner: string;
  expires_at: number;
}

function migrateFromSessionStorage() {
  try {
    const legacy = sessionStorage.getItem(STORAGE_KEY);
    if (!legacy) return;
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, legacy);
    }
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function storage(): Storage | null {
  try {
    migrateFromSessionStorage();
    return localStorage;
  } catch {
    return null;
  }
}

function readAll(): CachedSocialSession[] {
  try {
    const store = storage();
    if (!store) return [];
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedSocialSession[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (row) =>
        typeof row?.token === "string" &&
        typeof row?.owner === "string" &&
        typeof row?.expires_at === "number" &&
        row.expires_at > now + 5_000,
    );
  } catch {
    return [];
  }
}

function writeAll(rows: CachedSocialSession[]) {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* private mode / quota */
  }
}

export function loadSocialSession(owner: string): CachedSocialSession | null {
  const rows = readAll();
  const hit = rows.find((row) => row.owner === owner) || null;
  writeAll(rows);
  return hit;
}

export function saveSocialSession(row: CachedSocialSession) {
  const others = readAll().filter((item) => item.owner !== row.owner);
  others.push(row);
  writeAll(others);
}

export function clearSocialSession(owner?: string) {
  if (!owner) {
    try {
      storage()?.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  writeAll(readAll().filter((row) => row.owner !== owner));
}
