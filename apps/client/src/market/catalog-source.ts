/**
 * Where the marketplace reads its catalog: the shared-world server's
 * read-only `GET /market/v1/catalog`. `?server=` overrides it (http/https
 * only); otherwise it follows the game's `VITE_LIVING_PETS_MP_URL`.
 */
import { MARKET_CATALOG_PATH } from "@boing-pets/contract";

export const DEFAULT_SERVER = "https://boing-living-pets.fly.dev";

export function catalogUrl(
  search: string,
  envMpUrl: string | undefined,
): string {
  const override = new URLSearchParams(search).get("server");
  const base = toHttpBase(override) ?? toHttpBase(envMpUrl) ?? DEFAULT_SERVER;
  return `${base}${MARKET_CATALOG_PATH}`;
}

export function toHttpBase(raw: string | null | undefined): string | null {
  if (raw == null || raw.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol === "ws:") url.protocol = "http:";
  else if (url.protocol === "wss:") url.protocol = "https:";
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.origin;
}
