/**
 * Multiplayer account identity (M22 auth stub).
 * Real auth lands later; a non-empty accountId is enough for the host seam.
 */

/** Single-player / Electron / browser-worker default account. */
export const LOCAL_ACCOUNT_ID = "local";

const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9_.:@-]{1,80}$/;

/** True when `accountId` is a usable auth-stub identity. */
export function isValidAccountId(accountId: string): boolean {
  return ACCOUNT_ID_PATTERN.test(accountId);
}

/** Normalize blank/missing ids to the local single-player account. */
export function resolveAccountId(accountId: string | undefined | null): string {
  if (accountId == null || accountId === "") return LOCAL_ACCOUNT_ID;
  return accountId;
}
