import { CATALOG } from "../../economy";
import { ONCHAIN_ITEMS } from "../../content/onchainItems";
import {
  formatMarketPriceBoing,
  isSellableItem,
  parseMarketPriceBoing,
} from "../../market";
import { itemDisplayName, itemRarity } from "../../content/items";
import { ITEM_RARITY_LABELS } from "../../content/rarities";
import { filterMarketListings } from "../../marketFilters";
import {
  MARKET_FILTER_FORM_HTML,
  bindMarketFilterForm,
  readMarketFilterForm,
} from "../marketFiltersDom";

import { hex32 } from "../../core";
import {
  COLLECTION_CATEGORY_LABELS,
  COLLECTION_CATEGORY_ORDER,
  type CollectionCategory,
} from "../../content/collections";
import { collectionIconSvg } from "../itemIcons";
import { api, app, $, $maybe, notice } from "../appRuntime";
import { assertWallet, run } from "../careActions";

function itemName(id: string): string {
  return (
    CATALOG.find((c) => c.id === id)?.name ||
    ONCHAIN_ITEMS.find((c) => c.gameItemId === id)?.name ||
    id
  );
}

export async function economyAct(
  kind: string,
  extra: Record<string, unknown> = {},
) {
  await assertWallet();
  const challenge = await api<{
    id: string;
    message: string;
    transaction?: {
      type: string;
      from: string;
      to: string;
      amount: string;
      priority_tip?: string;
      display?: string;
    } | null;
    payload?: {
      payment?: {
        type: string;
        to: string;
        amount: string;
        display?: string;
      };
    };
  }>("/api/economy/challenge", { owner: app.owner, kind, ...extra });

  let txHash: string | undefined;
  const payment =
    challenge.transaction ||
    (challenge.payload?.payment
      ? {
          type: "transfer",
          from: app.owner!,
          to: challenge.payload.payment.to,
          amount: challenge.payload.payment.amount,
          priority_tip: "0",
          display: challenge.payload.payment.display,
        }
      : null);

  if (kind === "buy_listing" && payment) {
    notice(
      payment.display ||
        "Approve the testnet BOING payment in Express, then the purchase signature.",
    );
    const result = (await app.provider!.request({
      method: "boing_sendTransaction",
      params: [payment],
    })) as { tx_id?: string; tx_hash?: string } | string;
    txHash = hex32(
      typeof result === "string" ? result : result.tx_id || result.tx_hash,
    );
  } else {
    notice("Approve the economy signature in Express…");
  }

  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  const confirmBody: Record<string, unknown> = {
    id: challenge.id,
    signature,
  };
  if (txHash) confirmBody.tx_hash = txHash;

  let lastError =
    "Transaction is not included yet. Wait and retry confirmation.";
  for (let i = 0; i < 8; i++) {
    try {
      await api("/api/economy/confirm", confirmBody);
      await refreshEconomy();
      notice("Economy action confirmed.");
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (!txHash || !/not included yet|Wait and retry/i.test(lastError)) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(lastError);
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

export async function claimDailyStreak() {
  await assertWallet();
  notice("Approve today's streak bonus in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/content/dailies/challenge",
    { owner: app.owner },
  );
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  await api("/api/content/dailies/confirm", { id: challenge.id, signature });
  await refreshEconomy();
  await refreshQuests();
  notice("Streak bonus claimed!");
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
    dailies?: {
      dayKey: string;
      completeCount: number;
      allComplete: boolean;
      streak: number;
      goals: Array<{
        id: string;
        activity: string;
        title: string;
        description: string;
        href: string;
        complete: boolean;
      }>;
      bonus: {
        title: string;
        rewardBoinglets: number;
        cosmeticId: string | null;
        eligible: boolean;
        claimed: boolean;
      };
    };
  }>("/api/content/quests" + (app.owner ? `?owner=${app.owner}` : ""));
  $("#season-summary").textContent = data.activeEvents.length
    ? `Live now: ${data.activeEvents.map((e) => e.name).join(", ")}`
    : "No seasonal event active — check back for festivals.";
  const dailyHost = $maybe("#daily-quest-list");
  const dailySummary = $maybe("#daily-streak-summary");
  if (dailyHost && data.dailies) {
    const dailies = data.dailies;
    if (dailySummary) {
      const streakText = dailies.streak
        ? "Care streak: " +
          dailies.streak +
          " day" +
          (dailies.streak === 1 ? "" : "s") +
          "."
        : "Complete all three activity goals in a UTC day to start a streak.";
      dailySummary.textContent =
        "Today's activity goals: " +
        dailies.completeCount +
        "/3. " +
        streakText;
    }
    const cards = dailies.goals.map((g) => {
      const el = document.createElement("article");
      el.className =
        "market-card daily-quest-card" + (g.complete ? " is-complete" : "");
      el.innerHTML =
        "<h3>" +
        g.title +
        '</h3><p class="subtle">Daily activity · ' +
        (g.complete ? "Done" : "Open") +
        '</p><p class="small">' +
        g.description +
        "</p>";
      const link = document.createElement("a");
      link.className = "button secondary";
      link.href = g.href;
      link.textContent = g.complete ? "Completed" : "Play";
      el.append(link);
      return el;
    });
    const bonus = document.createElement("article");
    bonus.className = "market-card daily-quest-card daily-streak-card";
    const cosmetic = dailies.bonus.cosmeticId ? " plus a ribbon hat" : "";
    bonus.innerHTML =
      "<h3>" +
      dailies.bonus.title +
      '</h3><p class="subtle">' +
      dailies.bonus.rewardBoinglets +
      " Boinglets" +
      cosmetic +
      '</p><p class="small">Claim once per UTC day after finishing all three goals. Seven-day streaks also unlock the ribbon hat.</p>';
    const btn = document.createElement("button");
    btn.className = "secondary";
    if (dailies.bonus.claimed) {
      btn.textContent = "Claimed ✓";
      btn.disabled = true;
    } else if (dailies.bonus.eligible && app.owner) {
      btn.textContent = "Claim · sign";
      btn.disabled = app.busy;
      btn.onclick = () => void run(() => claimDailyStreak());
    } else {
      btn.textContent = dailies.allComplete
        ? "Connect to claim"
        : "Keep the streak going";
      btn.disabled = true;
    }
    bonus.append(btn);
    dailyHost.replaceChildren(...cards, bonus);
  }
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
      price_boing: string | null;
      price_boinglets: number | null;
      expires_at: number | null;
    }>;
    payouts?: Array<{
      id: string;
      listing_id: string;
      kind: string;
      amount_boing: string;
      status: string;
      payout_tx: string | null;
      tx_url: string | null;
      last_error: string | null;
      updated_at: number;
    }>;
    rules?: {
      feeBps: number;
      minPriceBoing: string;
      maxPriceBoing: string;
      maxOpenListings: number;
      expiryDays: number;
      provisional?: boolean;
      settlement?: string;
      gasSubsidy?: string;
    };
    writesEnabled?: boolean;
    gasReserve?: {
      ok: boolean;
      surplusBoing: string;
      requiredBoing: string;
      pendingLegs: number;
      floorBoing: string;
    };
  }>("/api/marketplace" + (app.owner ? `?owner=${app.owner}` : ""));
  let summary =
    "Connect to claim care rewards and daily testnet Sparkles, then browse cosmetics or list items in testnet BOING.";
  if (!$maybe("#economy-summary") || !$maybe("#catalog")) return;
  const claimBtn = $("#claim") as HTMLButtonElement;
  const sparklesBtn = $("#claim-sparkles") as HTMLButtonElement;
  let inventory: Array<{ item_id: string; qty: number }> = [];
  if (app.owner) {
    const bal = await api<{
      balances: { boinglets: number; sparkles: number };
      care: { earned: number; claimed: number; claimable: number };
      sparklesFaucet: { daily: number; claimable: number };
      inventory: Array<{ item_id: string; qty: number }>;
    }>("/api/economy/balance?owner=" + app.owner);
    inventory = bal.inventory;
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
      const rarity = itemRarity(item.id);
      const rarityHtml = rarity
        ? `<span class="rarity-badge rarity-${rarity}">${ITEM_RARITY_LABELS[rarity]}</span>`
        : "";
      el.innerHTML = `<div class="market-card-top"><h3>${item.name}</h3>${rarityHtml}</div><p class="subtle">${item.kind} · ${priceLabel}</p><p class="small">${item.description}</p>`;
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

  const listItem = $maybe<HTMLSelectElement>("#list-item");
  const listForm = $maybe<HTMLFormElement>("#list-form");
  const listSubmit = $maybe<HTMLButtonElement>("#list-submit");
  if (listItem) {
    const sellable = inventory.filter((row) => isSellableItem(row.item_id));
    listItem.replaceChildren(
      ...sellable.map((row) => {
        const opt = document.createElement("option");
        opt.value = row.item_id;
        opt.textContent = `${itemName(row.item_id)} × ${row.qty}`;
        return opt;
      }),
    );
    if (!sellable.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = app.owner
        ? "No sellable items in inventory"
        : "Connect to list an item";
      listItem.append(opt);
    }
    if (listSubmit) {
      listSubmit.disabled = app.busy || !app.owner || !sellable.length;
    }
  }
  if (listForm && !listForm.dataset.bound) {
    listForm.dataset.bound = "1";
    listForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const itemId = $maybe<HTMLSelectElement>("#list-item")?.value;
      const qty = Number($maybe<HTMLInputElement>("#list-qty")?.value || "1");
      const price = $maybe<HTMLInputElement>("#list-price")?.value || "";
      if (!itemId) return;
      try {
        parseMarketPriceBoing(price);
      } catch (error) {
        const notice = $maybe("#notice");
        if (notice)
          notice.textContent =
            error instanceof Error ? error.message : "Invalid price";
        return;
      }
      void run(() =>
        economyAct("list", { item_id: itemId, qty, price_boing: price }),
      );
    });
  }

  const filterHost = $maybe("#market-filter-host");
  if (filterHost && !filterHost.dataset.ready) {
    filterHost.innerHTML = MARKET_FILTER_FORM_HTML;
    filterHost.dataset.ready = "1";
    bindMarketFilterForm(() => {
      void refreshEconomy();
    });
  }
  const filterQuery = {
    ...readMarketFilterForm(),
    owner: app.owner,
  };
  const visibleListings = filterMarketListings(
    market.listings || [],
    filterQuery,
  );
  const statusEl = $maybe("#market-filter-status");
  if (statusEl) {
    statusEl.textContent = !(market.listings || []).length
      ? "No player listings yet."
      : visibleListings.length
        ? `${visibleListings.length} listing${visibleListings.length === 1 ? "" : "s"} shown`
        : "No listings match these filters.";
  }

  if (!(market.listings || []).length) {
    $("#listings").textContent =
      "No player listings yet. Buy from the catalog or earn a drop, then list it here in testnet BOING.";
  } else if (!visibleListings.length) {
    $("#listings").textContent =
      "No listings match these filters. Clear filters to see every open listing.";
  } else {
    $("#listings").replaceChildren(
      ...visibleListings.map((listing) => {
        const priceLabel = listing.price_boing
          ? `${formatMarketPriceBoing(listing.price_boing)} testnet BOING`
          : "Relist in testnet BOING";
        const expiry = listing.expires_at
          ? `Expires ${new Date(listing.expires_at).toLocaleDateString()}`
          : "No expiry";
        const rarity = listing.rarity || itemRarity(listing.item_id);
        const rarityHtml = rarity
          ? `<span class="rarity-badge rarity-${rarity}">${ITEM_RARITY_LABELS[rarity]}</span>`
          : "";
        const el = document.createElement("article");
        el.className = "market-card";
        el.innerHTML = `<div class="market-card-top"><h3>${itemDisplayName(listing.item_id)}</h3>${rarityHtml}</div><p class="subtle">${listing.qty}x · ${priceLabel}</p><p class="small">${listing.seller.slice(0, 10)}… · ${expiry}</p>`;
        if (app.owner && listing.seller === app.owner) {
          const btn = document.createElement("button");
          btn.className = "secondary";
          btn.textContent = "Cancel / sign";
          btn.disabled = app.busy;
          btn.onclick = () =>
            void run(() =>
              economyAct("cancel_listing", { listing_id: listing.id }),
            );
          el.append(btn);
        } else {
          const btn = document.createElement("button");
          btn.textContent = listing.price_boing
            ? "Buy listing / pay BOING"
            : "Relist required";
          const paused =
            market.writesEnabled === false || market.gasReserve?.ok === false;
          btn.disabled =
            app.busy || !app.owner || !listing.price_boing || paused;
          btn.onclick = () =>
            void run(() =>
              economyAct("buy_listing", { listing_id: listing.id }),
            );
          el.append(btn);
        }
        return el;
      }),
    );
  }

  const payoutsEl = $maybe("#market-payouts");
  if (payoutsEl) {
    const payouts = (market.payouts || []).filter(
      (row) => row.kind === "seller",
    );
    if (!app.owner) {
      payoutsEl.textContent = "Connect to see payouts from your sales.";
    } else if (!payouts.length) {
      payoutsEl.textContent =
        "No seller payouts yet. When a listing sells, 95% of the testnet BOING is sent to you automatically.";
    } else {
      payoutsEl.replaceChildren(
        ...payouts.map((row) => {
          const el = document.createElement("article");
          el.className = "market-card";
          const amount = formatMarketPriceBoing(row.amount_boing);
          const status = row.status;
          const err = row.last_error ? ` · ${row.last_error}` : "";
          const link =
            row.tx_url && row.payout_tx
              ? `<p class="small"><a href="${row.tx_url}" target="_blank" rel="noreferrer">Payout tx ${row.payout_tx.slice(0, 10)}…</a></p>`
              : `<p class="small">No transaction yet${err}</p>`;
          el.innerHTML = `<h3>${amount} testnet BOING</h3><p class="subtle">${status}${err}</p>${link}`;
          return el;
        }),
      );
    }
  }

  const gasNotice = $maybe("#market-gas-notice");
  if (gasNotice) {
    const paused =
      market.writesEnabled === false || market.gasReserve?.ok === false;
    if (paused) {
      gasNotice.hidden = false;
      gasNotice.textContent =
        market.writesEnabled === false
          ? "Market listings and purchases are temporarily disabled. Outstanding payouts are unchanged."
          : "Purchases are paused because the operator gas reserve is too low. The 5% treasury fee does not replenish operator gas.";
    } else {
      gasNotice.hidden = true;
      gasNotice.textContent = "";
    }
  }

  const rulesEl = $maybe("#market-rules");
  if (rulesEl && market.rules) {
    const provisional = market.rules.provisional
      ? " Caps, expiry, and anti-wash holds are provisional."
      : "";
    const subsidy = market.rules.gasSubsidy
      ? " " + market.rules.gasSubsidy
      : "";
    rulesEl.textContent =
      `${market.rules.feeBps / 100}% of each player-market sale sinks to the pasture treasury. ` +
      `Up to ${market.rules.maxOpenListings} open listings, ${market.rules.expiryDays}-day expiry, ` +
      `prices ${market.rules.minPriceBoing}?${market.rules.maxPriceBoing} testnet BOING.` +
      provisional +
      subsidy;
  }

  const dropTableEl = $maybe("#drop-table");
  if (dropTableEl) {
    const table = await api<{
      version: string;
      hitChanceBps: number;
      entries: Array<{
        itemId: number;
        gameItemId: string;
        name: string;
        tier: string;
        oddsPerMille: number;
      }>;
      pity: {
        rareAfter: number;
        premiumAfter: number;
      };
      caps: { maxDropsPerUtcDay: number; maxPremiumPerUtcWeek: number };
      sources: string[];
    }>("/api/drops/table");
    dropTableEl.replaceChildren(
      ...table.entries.map((entry) => {
        const el = document.createElement("article");
        el.className = "market-card";
        el.innerHTML = `<h3>${entry.name}</h3><p class="subtle">${entry.tier} · ${entry.oddsPerMille / 10}% per hit</p><p class="small">Id ${entry.itemId} · ${entry.gameItemId}</p>`;
        return el;
      }),
    );
    const note = document.createElement("p");
    note.className = "small";
    note.textContent =
      `${table.hitChanceBps / 100}% hit chance per daily ${table.sources.join(", ")}. ` +
      `Pity: rare after ${table.pity.rareAfter}, premium after ${table.pity.premiumAfter}. ` +
      `Caps: ${table.caps.maxDropsPerUtcDay} drops/UTC day, ${table.caps.maxPremiumPerUtcWeek} premium/UTC week. Table ${table.version}.`;
    dropTableEl.append(note);
  }

  const historyEl = $maybe("#drop-history");
  if (historyEl && app.owner) {
    const history = await api<{
      rolls: Array<{
        source: string;
        utc_day: string;
        hit: number;
        reason: string;
        item_id: string | null;
        digest_hex: string;
      }>;
    }>("/api/drops/history?owner=" + app.owner);
    if (!history.rolls.length) {
      historyEl.textContent = "No care-drop rolls for this wallet yet.";
    } else {
      historyEl.replaceChildren(
        ...history.rolls.slice(0, 12).map((roll) => {
          const el = document.createElement("article");
          el.className = "market-card";
          const grant = roll.hit ? itemName(roll.item_id || "") : "miss";
          el.innerHTML = `<h3>${roll.utc_day} · ${roll.source}</h3><p class="subtle">${grant} · ${roll.reason}</p><p class="small">${roll.digest_hex.slice(0, 16)}…</p>`;
          return el;
        }),
      );
    }
  } else if (historyEl) {
    historyEl.textContent = "Connect to see your auditable drop history.";
  }
}
