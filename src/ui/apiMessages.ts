/** Shared copy for missing pasture API hosts (no DOM deps). */

export function apiUnavailableMessage(status?: number): string {
  if (status === 404) {
    return "Pasture API is missing on this host (static preview only). Locally run `npm run dev:api` and `npm run db:local`, then `npm run dev` at http://localhost:5177.";
  }
  return "Pasture API unavailable. Start the local Worker with `npm run dev:api` (and apply D1 migrations) — see README.";
}
