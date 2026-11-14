/** Shared loading skeletons and empty-state copy for bag, market, collections, and boards. */

export type SkeletonKind =
  "bag-row" | "market-card" | "collection-tile" | "leaderboard-card";

export const SKELETON_COUNTS: Record<SkeletonKind, number> = {
  "bag-row": 4,
  "market-card": 3,
  "collection-tile": 8,
  "leaderboard-card": 2,
};

export type InventoryEmptyTab = "items" | "crops" | "fish" | "recipes";

export const BAG_EMPTY_COPY: Record<
  InventoryEmptyTab,
  { title: string; hint: string }
> = {
  items: {
    title: "This pocket is empty.",
    hint: "Snacks and furniture drop from pasture activities, or buy them at the Market Stall.",
  },
  crops: {
    title: "No crops in the bag yet.",
    hint: "Tend the Garden Beds on the pasture, then harvest to fill this pocket.",
  },
  fish: {
    title: "No fish in the bag yet.",
    hint: "Walk to the Pond Pier and fish to catch something for this pocket.",
  },
  recipes: {
    title: "No recipes ready to cook.",
    hint: "Gather ingredients from activities, then walk to the Pasture Kitchen to cook.",
  },
};

export const BAG_CONNECT_COPY = {
  title: "Connect to load your bag.",
  hint: "Sign in with Boing Express to see items you have earned or bought.",
};

export const MARKET_EMPTY_COPY = {
  none: "No player listings yet. Earn a drop on the pasture or buy from the catalog, then list it from your bag at the Market Stall.",
  filters:
    "No listings match these filters. Clear a filter or search a different name to see every open listing.",
};

export const COLLECTION_EMPTY_COPY =
  "The discovery log is waiting. Explore the pasture and finish activities like fishing, mining, or treasure digs to unlock entries.";

export const LEADERBOARD_EMPTY_COPY =
  "No claimed runs yet this week. Finish a Race Track or Pond Pier activity on the pasture, then claim the reward to post a score.";

export function bagEmptyCopy(
  tab: InventoryEmptyTab,
  connected: boolean,
): { title: string; hint: string } {
  return connected ? BAG_EMPTY_COPY[tab] : BAG_CONNECT_COPY;
}

export function skeletonClass(kind: SkeletonKind): string {
  if (kind === "bag-row") return "ui-skeleton ui-skeleton-row";
  if (kind === "market-card") return "ui-skeleton ui-skeleton-card";
  if (kind === "collection-tile") return "ui-skeleton ui-skeleton-tile";
  return "ui-skeleton ui-skeleton-card ui-skeleton-board";
}

export function skeletonHtml(
  kind: SkeletonKind,
  count = SKELETON_COUNTS[kind],
  label = "Loading",
): string {
  const itemClass = skeletonClass(kind);
  const tag = kind === "bag-row" ? "li" : "article";
  const items = Array.from(
    { length: Math.max(1, count) },
    () => `<${tag} class="${itemClass}"></${tag}>`,
  ).join("");
  const wrapClass =
    kind === "collection-tile"
      ? "collection-grid ui-skeleton-grid"
      : "ui-skeleton-stack";
  return `<div class="${wrapClass}" role="status" aria-label="${label}">${items}</div>`;
}

export function mountSkeletons(
  host: Element | null,
  kind: SkeletonKind,
  label = "Loading",
  count = SKELETON_COUNTS[kind],
): void {
  if (!host) return;
  host.innerHTML = skeletonHtml(kind, count, label);
}
