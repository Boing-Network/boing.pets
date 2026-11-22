/**
 * Site routes shared by the marketing page (`/`), the game (`/world/`) and
 * the marketplace (`/market/`). `vercel.json` mirrors the redirects so they
 * also happen before any page loads.
 */
export type SiteSection = "home" | "play" | "bestiary" | "market";

export const WORLD_PATH = "/world/";
export const MARKET_PATH = "/market/";
export const HOME_PATH = "/";
export const BESTIARY_PATH = "/world/?bestiary";

export const SITE_LINKS: readonly {
  key: SiteSection;
  label: string;
  href: string;
}[] = [
  { key: "home", label: "Home", href: HOME_PATH },
  { key: "play", label: "Play", href: WORLD_PATH },
  { key: "bestiary", label: "Bestiary", href: BESTIARY_PATH },
  { key: "market", label: "Marketplace", href: MARKET_PATH },
];

/**
 * Query params that belong to the game. Old links put them on `/` (when the
 * game lived there); those are sent on to `/world/` with the same query.
 */
export const GAME_QUERY_KEYS = [
  "mp",
  "owner",
  "name",
  "debug",
  "bestiary",
  "pose",
] as const;

export function hasGameQuery(search: string): boolean {
  const params = new URLSearchParams(search);
  return GAME_QUERY_KEYS.some((key) => params.has(key));
}

/** Where an old game link on `/` should go, or null to stay. */
export function legacyGameRedirect(
  pathname: string,
  search: string,
): string | null {
  const path = pathname === "" ? "/" : pathname;
  if (path !== "/" && path !== "/index.html") return null;
  if (!hasGameQuery(search)) return null;
  return `${WORLD_PATH}${search.startsWith("?") ? search : `?${search}`}`;
}

/** Play link that keeps game params a visitor arrived with. */
export function playHref(search: string): string {
  return hasGameQuery(search) ? `${WORLD_PATH}${search}` : WORLD_PATH;
}
