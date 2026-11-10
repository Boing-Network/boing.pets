/** Pure policy for pasture/plaza chat auth. Keep this aligned with the DO. */

export function isChatWalletRequiredMessage(message: string): boolean {
  return /chat requires a signed-in wallet/i.test(message);
}

export type PlazaBindPlan =
  "token" | "session" | "prompt" | "guest-with-wallet" | "guest";

/**
 * How a plaza hello should bind when Express accounts may already be visible.
 * `guest-with-wallet` is the false-negative case: the app shows a signed-in
 * wallet, but a silent join would otherwise become a chat-blocked guest.
 */
export function planPlazaBind(opts: {
  hasAccounts: boolean;
  hasPresenceToken: boolean;
  hasSocialSession: boolean;
  allowPrompt: boolean;
  allowSocialSession: boolean;
}): PlazaBindPlan {
  if (!opts.hasAccounts) return "guest";
  if (opts.hasPresenceToken) return "token";
  if (opts.allowSocialSession && opts.hasSocialSession) return "session";
  if (opts.allowPrompt) return "prompt";
  return "guest-with-wallet";
}

/** Rejoin once after wallet hydrate so a race does not permanently stay guest. */
export function shouldSilentRejoin(opts: {
  walletBound: boolean;
  status: string;
  owner: string | null | undefined;
  alreadyAttempted: boolean;
}): boolean {
  return (
    !!opts.owner &&
    opts.status === "live" &&
    !opts.walletBound &&
    !opts.alreadyAttempted
  );
}

/** Chat can promote a connected wallet (sign a presence token) instead of failing. */
export function shouldPromoteForChat(opts: {
  walletBound: boolean;
  owner: string | null | undefined;
}): boolean {
  return !opts.walletBound && !!opts.owner;
}
