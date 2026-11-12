export type PageId =
  | "pasture"
  | "friends"
  | "fishing"
  | "treasure"
  | "garden"
  | "kitchen"
  | "craft"
  | "mining"
  | "racing"
  | "home"
  | "quests"
  | "collections"
  | "market"
  | "how";

export const PAGE_META: Record<
  PageId,
  { path: string; title: string; docTitle: string }
> = {
  pasture: {
    path: "/",
    title: "Pasture",
    docTitle: "Boing Pets · Pasture",
  },
  friends: {
    path: "/friends.html",
    title: "Friends",
    docTitle: "Boing Pets · Friends",
  },
  fishing: {
    path: "/fishing.html",
    title: "Fishing",
    docTitle: "Boing Pets · Fishing",
  },
  treasure: {
    path: "/treasure.html",
    title: "Treasure",
    docTitle: "Boing Pets · Treasure Dig",
  },
  garden: {
    path: "/garden.html",
    title: "Garden",
    docTitle: "Boing Pets · Garden",
  },
  kitchen: {
    path: "/kitchen.html",
    title: "Kitchen",
    docTitle: "Boing Pets · Kitchen",
  },
  craft: {
    path: "/craft.html",
    title: "Craft",
    docTitle: "Boing Pets · Craft",
  },
  mining: {
    path: "/mining.html",
    title: "Mine",
    docTitle: "Boing Pets · Mining",
  },
  racing: {
    path: "/racing.html",
    title: "Racing",
    docTitle: "Boing Pets · Pet Racing",
  },
  home: {
    path: "/home.html",
    title: "Home",
    docTitle: "Boing Pets · Home Plot",
  },
  quests: {
    path: "/quests.html",
    title: "Quests",
    docTitle: "Boing Pets · Quests",
  },
  collections: {
    path: "/collections.html",
    title: "Collections",
    docTitle: "Boing Pets · Collections",
  },
  market: {
    path: "/market.html",
    title: "Market",
    docTitle: "Boing Pets · Market",
  },
  how: {
    path: "/how.html",
    title: "How to play",
    docTitle: "Boing Pets · How to play",
  },
};

/** Legacy hash deep-links → multipage paths. */
export const HASH_REDIRECTS: Record<string, string> = {
  buddy: "/#buddy",
  pasture: "/",
  social: "/friends.html",
  fishing: "/fishing.html",
  treasure: "/treasure.html",
  garden: "/garden.html",
  kitchen: "/kitchen.html",
  craft: "/craft.html",
  mining: "/mining.html",
  racing: "/racing.html",
  home: "/home.html",
  quests: "/quests.html",
  collections: "/collections.html",
  market: "/market.html",
  how: "/how.html",
};

function link(page: PageId, active: PageId): string {
  const meta = PAGE_META[page];
  const current =
    page === active ? ' aria-current="page" class="nav-active"' : "";
  return `<a href="${meta.path}"${current}>${meta.title}</a>`;
}

function dropdown(
  label: string,
  items: PageId[],
  active: PageId,
  extra = "",
): string {
  return `<div class="nav-dropdown"><button type="button" class="nav-drop-btn" aria-expanded="false">${label}</button><div class="nav-drop-menu">${items.map((p) => link(p, active)).join("")}${extra}</div></div>`;
}

export function renderHeader(active: PageId): string {
  return `<header><a class="brand" href="/">boing<span>pets</span><i>✦</i></a><nav aria-label="Main">${dropdown("Play", ["pasture", "home"], active, '<a href="/world.html">Starter Town</a>')}${dropdown("Activities", ["fishing", "treasure", "garden", "kitchen", "craft", "mining", "racing"], active)}${dropdown("Social", ["friends"], active)}${dropdown("Progress", ["quests", "collections"], active)}${link("market", active)}${dropdown("Help", ["how"], active, '<a href="https://boing.network/testnet" target="_blank" rel="noreferrer">Boing Network ↗</a>')}</nav><div class="wallet-ctl"><button id="connect" type="button" aria-haspopup="menu" aria-expanded="false">Connect Express</button><div id="wallet-menu" class="wallet-menu" hidden role="menu"><button type="button" id="disconnect" role="menuitem">Disconnect</button></div></div></header>`;
}

export function isPageId(value: string): value is PageId {
  return value in PAGE_META;
}
