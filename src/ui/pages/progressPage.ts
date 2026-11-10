import { CATALOG } from "../../economy";
import {
  COLLECTION_CATEGORY_LABELS,
  COLLECTION_CATEGORY_ORDER,
  type CollectionCategory,
} from "../../content/collections";
import { collectionIconSvg } from "../itemIcons";
import { api, app, $, notice } from "../appRuntime";
import { assertWallet, run } from "../careActions";

export async function economyAct(
  kind: string,
  extra: Record<string, unknown> = {},
) {
  await assertWallet();
  notice("Approve the economy signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/economy/challenge",
    { owner: app.owner, kind, ...extra },
  );
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  await api("/api/economy/confirm", { id: challenge.id, signature });
  await refreshEconomy();
  notice("Economy action confirmed.");
}

export async function claimQuest(questId: string) {
  await assertWallet();
  notice("Approve quest reward claim in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/content/quest/challenge",
    { owner: app.owner, quest_id: questId },
  );
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  await api("/api/content/quest/confirm", { id: challenge.id, signature });
  await refreshEconomy();
  await refreshQuests();
  notice("Quest reward claimed!");
}

export async function refreshCollections() {
  const data = await api<{
    defs: Array<{
      id: string;
      title: string;
      description: string;
      category: CollectionCategory | string;
    }>;
    unlocked: Array<{ entry_id: string; unlocked_at: number }>;
  }>("/api/content/collections" + (app.owner ? `?owner=${app.owner}` : ""));
  const unlocked = new Set(data.unlocked.map((u) => u.entry_id));
  const total = data.defs.length;
  const found = data.defs.filter((d) => unlocked.has(d.id)).length;
  $("#collections-summary").textContent = app.owner
    ? `${found}/${total} unlocked across ${COLLECTION_CATEGORY_ORDER.length} categories`
    : `Browse ${total} collection entries — connect to track unlocks.`;
  const groups = new Map<string, typeof data.defs>();
  for (const key of COLLECTION_CATEGORY_ORDER) groups.set(key, []);
  for (const def of data.defs) {
    const key = COLLECTION_CATEGORY_ORDER.includes(
      def.category as CollectionCategory,
    )
      ? def.category
      : "discovery";
    (groups.get(key) ?? groups.get("discovery")!).push(def);
  }
  const sections: HTMLElement[] = [];
  for (const key of COLLECTION_CATEGORY_ORDER) {
    const items = (groups.get(key) || [])
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title));
    if (!items.length) continue;
    const section = document.createElement("section");
    section.className = "collection-group";
    section.dataset.category = key;
    const gotIn = items.filter((d) => unlocked.has(d.id)).length;
    const heading = document.createElement("div");
    heading.className = "collection-group-head";
    heading.innerHTML = `<h3>${esc(COLLECTION_CATEGORY_LABELS[key as CollectionCategory] || key)}</h3><p class="subtle">${gotIn}/${items.length}</p>`;
    const grid = document.createElement("div");
    grid.className = "collection-grid";
    for (const def of items) {
      const got = unlocked.has(def.id);
      const el = document.createElement("article");
      el.className = "collection-item" + (got ? " is-collected" : " is-locked");
      el.innerHTML = `<div class="collection-icon" aria-hidden="true">${collectionIconSvg(def.id)}</div><h4>${esc(def.title)}${got ? " ✓" : ""}</h4><p class="small">${esc(def.description)}</p>`;
      grid.append(el);
    }
    section.append(heading, grid);
    sections.push(section);
  }
  $("#collections-list").replaceChildren(...sections);
}

function esc(value: string) {
  return value.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
}

export async function refreshQuests() {
  const data = await api<{
    activeEvents: Array<{ id: string; name: string; description: string }>;
    quests: Array<{
      id: string;
      kind: string;
      title: string;
      description: string;
      rewardBoinglets: number;
      complete: boolean;
      claimed: boolean;
    }>;
  }>("/api/content/quests" + (app.owner ? `?owner=${app.owner}` : ""));
  $("#season-summary").textContent = data.activeEvents.length
    ? `Live now: ${data.activeEvents.map((e) => e.name).join(", ")}`
    : "No seasonal event active — check back for festivals.";
  $("#quest-list").replaceChildren(
    ...data.quests.map((q) => {
      const el = document.createElement("article");
      el.className = "market-card";
      el.innerHTML = `<h3>${q.title}</h3><p class="subtle">${q.kind} · ${q.rewardBoinglets} Boinglets</p><p class="small">${q.description}</p>`;
      const btn = document.createElement("button");
      btn.className = "secondary";
      if (q.claimed) {
        btn.textContent = "Claimed ✓";
        btn.disabled = true;
      } else if (q.complete && app.owner) {
        btn.textContent = "Claim · sign";
        btn.disabled = app.busy;
        btn.onclick = () => void run(() => claimQuest(q.id));
      } else {
        btn.textContent = q.complete ? "Connect to claim" : "In progress";
        btn.disabled = true;
      }
      el.append(btn);
      return el;
    }),
  );
}

export async function refreshEconomy() {
  const catalog = await api<{
    catalog: Array<{
      id: string;
      name: string;
      kind: string;
      priceBoinglets: number;
      priceSparkles: number;
      description: string;
    }>;
  }>("/api/economy/catalog");
  const market = await api<{
    listings: Array<{
      id: string;
      seller: string;
      item_id: string;
      qty: number;
      price_boinglets: number;
    }>;
  }>("/api/marketplace");
  let summary =
    "Connect to claim care rewards and daily testnet Sparkles, then browse cosmetics.";
  const claimBtn = $("#claim") as HTMLButtonElement;
  const sparklesBtn = $("#claim-sparkles") as HTMLButtonElement;
  if (app.owner) {
    const bal = await api<{
      balances: { boinglets: number; sparkles: number };
      care: { earned: number; claimed: number; claimable: number };
      sparklesFaucet: { daily: number; claimable: number };
      inventory: Array<{ item_id: string; qty: number }>;
    }>("/api/economy/balance?owner=" + app.owner);
    summary = `${bal.balances.boinglets} Boinglets · ${bal.balances.sparkles} Sparkles · ${bal.care.claimable} care claimable · ${bal.inventory.length} inventory stacks`;
    claimBtn.hidden = false;
    claimBtn.disabled = app.busy || bal.care.claimable <= 0;
    claimBtn.textContent =
      bal.care.claimable > 0
        ? `Claim ${bal.care.claimable} Boinglets`
        : "Care rewards claimed ✓";
    sparklesBtn.hidden = false;
    sparklesBtn.disabled = app.busy || bal.sparklesFaucet.claimable <= 0;
    sparklesBtn.textContent =
      bal.sparklesFaucet.claimable > 0
        ? `Claim ${bal.sparklesFaucet.daily} Sparkles · sign`
        : "Sparkles claimed today ✓";
  } else {
    claimBtn.hidden = true;
    sparklesBtn.hidden = true;
  }
  $("#economy-summary").textContent = summary;
  $("#catalog").replaceChildren(
    ...catalog.catalog.map((item) => {
      const priceLabel =
        item.priceSparkles > 0
          ? `${item.priceSparkles} Sparkles`
          : `${item.priceBoinglets} Boinglets`;
      const el = document.createElement("article");
      el.className = "market-card";
      el.innerHTML = `<h3>${item.name}</h3><p class="subtle">${item.kind} · ${priceLabel}</p><p class="small">${item.description}</p>`;
      const btn = document.createElement("button");
      btn.className = "secondary";
      btn.textContent = "Buy · sign";
      btn.disabled = app.busy || !app.owner;
      btn.onclick = () =>
        void run(() => economyAct("buy_catalog", { item_id: item.id }));
      el.append(btn);
      return el;
    }),
  );
  if (!market.listings.length) {
    $("#listings").textContent =
      "No player listings yet. Buy from the catalog, then list from a future inventory panel.";
  } else {
    $("#listings").replaceChildren(
      ...market.listings.map((listing) => {
        const item = CATALOG.find((c) => c.id === listing.item_id);
        const el = document.createElement("article");
        el.className = "market-card";
        el.innerHTML = `<h3>${item?.name || listing.item_id}</h3><p class="subtle">${listing.qty}× · ${listing.price_boinglets} Boinglets</p><p class="small">${listing.seller.slice(0, 10)}…</p>`;
        const btn = document.createElement("button");
        btn.className = "secondary";
        btn.textContent = "Buy listing · sign";
        btn.disabled = app.busy || !app.owner || listing.seller === app.owner;
        btn.onclick = () =>
          void run(() => economyAct("buy_listing", { listing_id: listing.id }));
        el.append(btn);
        return el;
      }),
    );
  }
}
