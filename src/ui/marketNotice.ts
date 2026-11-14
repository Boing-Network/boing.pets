/** Copy shown in the market #notice after listings and catalog have loaded. */
export function marketLoadedNotice(owner: string | null | undefined): string {
  return owner
    ? "Market ready."
    : "Market ready. Connect to claim rewards or list items.";
}
