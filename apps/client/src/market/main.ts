/**
 * Marketplace page (`/market/`): browse every creature, lineage and item NFT
 * with its live in-world status, and see how adopting, listing and buying go
 * through escrow. Static page, no 3D.
 */
import type {
  MarketAsset,
  MarketCatalog,
  MarketOwnership,
} from "@boing-pets/contract";
import {
  prepareBoingWallet,
  resolveBoingProvider,
  walletErrorText,
} from "../wallet/boing-wallet";
import { catalogUrl } from "./catalog-source";
import "./market.css";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const KINDS = [
  { key: "CREATURE", label: "Creatures" },
  { key: "LINEAGE", label: "Lineages" },
  { key: "ITEM", label: "Items" },
] as const;

const OWNERSHIP_LABEL: Record<MarketOwnership, string> = {
  UNMINTED: "Not minted yet",
  OPERATOR: "Held by operator",
  IN_ESCROW: "In escrow",
  PLAYER: "Player-owned",
};

const ACTIVITY_LABEL: Record<string, string> = {
  FORAGE: "foraging",
  EAT: "eating",
  DRINK: "drinking",
  REST: "resting",
  SLEEP: "sleeping",
  APPROACH: "approaching a friend",
  SOCIALIZE: "socializing",
  COURT: "courting",
  MATE: "mating",
  EXPLORE: "exploring",
  RELOCATE: "travelling",
  FLEE: "fleeing",
  WANDER: "wandering",
  FIND_FOOD: "looking for food",
  DRINK_WATER: "looking for water",
  SEEK_SHELTER: "seeking shelter",
};

const state = {
  catalog: null as MarketCatalog | null,
  kind: "CREATURE" as MarketAsset["kind"],
  wallet: null as string | null,
};

const short = (hex: string | null) =>
  hex == null ? "unset" : `${hex.slice(0, 8)}…${hex.slice(-4)}`;

function activityText(a: MarketAsset): string {
  const live = a.live;
  if (live == null) return "Not in the world";
  if (a.kind === "LINEAGE") {
    return live.alive
      ? `${live.livingMembers} living member${live.livingMembers === 1 ? "" : "s"}`
      : "No living members";
  }
  if (!live.alive) return "Died";
  const doing =
    ACTIVITY_LABEL[live.activity ?? ""] ??
    (live.activity ?? "idle").toLowerCase().replaceAll("_", " ");
  return `${doing[0]!.toUpperCase()}${doing.slice(1)} in ${live.territory ?? "the wild"}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function card(a: MarketAsset): HTMLLIElement {
  const img = a.speciesSlug
    ? el("img", {
        src: `/media/species/${a.speciesSlug}.webp`,
        alt: a.speciesName ?? "",
        loading: "lazy",
        width: 480,
        height: 327,
      })
    : el("div", { className: "noimg" }, [a.kind === "ITEM" ? "Item" : "?"]);
  const badges = el("div", { className: "badges" }, [
    el("span", { className: `own ${a.ownership.toLowerCase()}` }, [
      OWNERSHIP_LABEL[a.ownership],
    ]),
    ...(a.genesis ? [el("span", { className: "genesis" }, ["Genesis"])] : []),
  ]);
  const live = a.live;
  const health =
    live?.health != null && live.alive
      ? el(
          "div",
          { className: "health", title: `Health ${live.health}/1000` },
          [
            el("span", {
              style: `width:${Math.round(live.health / 10)}%`,
            } as never),
          ],
        )
      : el("div", { className: "health empty" });
  const sub = [a.speciesName, a.kind === "CREATURE" ? a.lineageName : null]
    .filter(Boolean)
    .join(" · ");
  const meta = el("dl", {}, [
    el("dt", {}, ["Mint"]),
    el("dd", {}, [
      a.mintTxHex
        ? el("span", { title: a.mintTxHex }, [
            `${a.mint.toLowerCase()} · tx ${short(a.mintTxHex)}`,
          ])
        : a.mint === "UNMINTED"
          ? "not minted yet"
          : a.mint.toLowerCase(),
    ]),
    el("dt", {}, ["Owner"]),
    el("dd", {}, [a.ownerHex ? short(a.ownerHex) : "operator (unset)"]),
    ...(a.amount != null
      ? [el("dt", {}, ["Amount"]), el("dd", {}, [String(a.amount)])]
      : []),
  ]);
  const action = actionFor(a);
  const button = el("button", { type: "button", className: "act" }, [
    action.label,
  ]);
  button.addEventListener("click", () => openTrade(a, action));
  const li = el(
    "li",
    { className: `card ${live && !live.alive ? "dead" : ""}` },
    [
      img,
      el("div", { className: "body" }, [
        badges,
        el("h3", {}, [a.name]),
        el("p", { className: "sub" }, [sub || a.kind.toLowerCase()]),
        el("p", { className: `live ${live?.alive ? "on" : ""}` }, [
          activityText(a),
        ]),
        health,
        meta,
        button,
      ]),
    ],
  );
  return li;
}

type Action = { label: string; steps: string[] };

function actionFor(a: MarketAsset): Action {
  const escrow = state.catalog?.escrow;
  const esc = short(escrow?.escrowHex ?? null);
  switch (a.ownership) {
    case "UNMINTED":
      return {
        label: "View",
        steps: [
          `Not minted yet. When minted it goes to the operator (${short(escrow?.operatorHex ?? null)}).`,
          "Once minted it can be adopted through escrow.",
        ],
      };
    case "OPERATOR":
      return {
        label: "Adopt",
        steps: [
          `You pay the adoption price in BOING into escrow (${esc}).`,
          `The operator deposits the NFT with escrow.`,
          "Escrow releases the NFT to your wallet and the BOING to the operator.",
        ],
      };
    case "IN_ESCROW":
      return {
        label: a.listing ? "Buy" : "In escrow",
        steps: [
          a.listing
            ? `Listed for ${Number(BigInt(a.listing.priceWei) / 10n ** 14n) / 1e4} BOING by ${short(a.listing.sellerHex)}.`
            : "Held by escrow for a pending hand-over.",
          `You pay the price into escrow (${esc}).`,
          "Escrow releases the NFT to you and the BOING to the seller.",
        ],
      };
    case "PLAYER":
      return state.wallet != null && a.ownerHex === state.wallet
        ? {
            label: "List",
            steps: [
              "Set a price in BOING.",
              `You deposit the NFT with escrow (${esc}).`,
              "When a buyer pays into escrow, escrow sends you the BOING and them the NFT. Cancel to get the NFT back.",
            ],
          }
        : {
            label: "View",
            steps: [
              `Owned by ${short(a.ownerHex)}. It can be bought once its owner lists it.`,
            ],
          };
  }
}

function openTrade(a: MarketAsset, action: Action): void {
  const dialog = $<HTMLDialogElement>("trade");
  $("trade-title").textContent = `${action.label}: ${a.name}`;
  $("trade-steps").replaceChildren(
    ...action.steps.map((s) => el("li", {}, [s])),
  );
  const escrow = state.catalog?.escrow;
  const sign = $<HTMLButtonElement>("trade-sign");
  const tradable =
    action.label === "Adopt" ||
    action.label === "Buy" ||
    action.label === "List";
  sign.hidden = !tradable;
  sign.disabled = true;
  $("trade-note").textContent = !tradable
    ? ""
    : escrow?.mode !== "CUSTODIAL"
      ? (escrow?.note ?? "Trading is not available on this server yet.")
      : "Escrow settlement isn't live on this server yet, so nothing is signed from this page.";
  dialog.showModal();
}

function populateFilters(c: MarketCatalog): void {
  const select = $<HTMLSelectElement>("species");
  const names = new Map<string, string>();
  for (const a of c.assets)
    if (a.speciesSlug) names.set(a.speciesSlug, a.speciesName ?? a.speciesSlug);
  select.replaceChildren(
    el("option", { value: "" }, ["All species"]),
    ...[...names]
      .sort((x, y) => x[1].localeCompare(y[1]))
      .map(([v, n]) => el("option", { value: v }, [n])),
  );
  const tabs = $("kind-tabs");
  tabs.replaceChildren(
    ...KINDS.map(({ key, label }) => {
      const count = c.assets.filter((a) => a.kind === key).length;
      const b = el("button", { type: "button", role: "tab" }, [
        `${label} `,
        el("span", {}, [String(count)]),
      ]);
      b.setAttribute("aria-selected", String(state.kind === key));
      b.addEventListener("click", () => {
        state.kind = key;
        for (const t of tabs.querySelectorAll("button"))
          t.setAttribute("aria-selected", String(t === b));
        render();
      });
      return b;
    }),
  );
}

function render(): void {
  const c = state.catalog;
  if (c == null) return;
  const q = $<HTMLInputElement>("q").value.trim().toLowerCase();
  const sp = $<HTMLSelectElement>("species").value;
  const own = $<HTMLSelectElement>("ownership").value;
  const alive = $<HTMLInputElement>("alive").checked;
  const genesis = $<HTMLInputElement>("genesis").checked;
  const mine = $<HTMLInputElement>("mine").checked;
  const shown = c.assets.filter(
    (a) =>
      a.kind === state.kind &&
      (!sp || a.speciesSlug === sp) &&
      (!own || a.ownership === own) &&
      (!alive || a.live?.alive === true) &&
      (!genesis || a.genesis) &&
      (!mine || (state.wallet != null && a.ownerHex === state.wallet)) &&
      (!q ||
        `${a.name} ${a.speciesName ?? ""} ${a.lineageName ?? ""}`
          .toLowerCase()
          .includes(q)),
  );
  $("grid").replaceChildren(...shown.map(card));
  $("empty").hidden = shown.length > 0;
  if (state.kind === "ITEM" && shown.length === 0) {
    $("empty").textContent = "No item NFTs have been minted in this world yet.";
  } else {
    $("empty").textContent = "No matches.";
  }
}

function renderStats(c: MarketCatalog): void {
  const creatures = c.assets.filter((a) => a.kind === "CREATURE");
  const living = creatures.filter((a) => a.live?.alive).length;
  const minted = c.assets.filter(
    (a) => a.mint === "CONFIRMED" || a.mint === "SUBMITTED",
  ).length;
  const species = new Set(creatures.map((a) => a.speciesSlug)).size;
  $("stats").replaceChildren(
    ...[
      [String(living), "living creatures"],
      [String(species), "species"],
      [String(c.assets.filter((a) => a.kind === "LINEAGE").length), "lineages"],
      [String(minted), "minted NFTs"],
      [`#${c.tick}`, "world tick"],
    ].map(([v, l]) =>
      el("div", {}, [el("strong", {}, [v!]), el("span", {}, [l!])]),
    ),
  );
  const notice = $("notice");
  notice.hidden = false;
  notice.textContent =
    c.escrow.mode === "CUSTODIAL"
      ? `${c.escrow.note} Escrow ${short(c.escrow.escrowHex)}, operator ${short(c.escrow.operatorHex)}, chain ${c.escrow.chainId}.`
      : c.escrow.note;
}

async function load(): Promise<void> {
  const url = catalogUrl(
    window.location.search,
    import.meta.env.VITE_LIVING_PETS_MP_URL as string | undefined,
  );
  $("source").textContent = `Live from ${new URL(url).host}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const catalog = (await res.json()) as MarketCatalog;
    const first = state.catalog == null;
    state.catalog = catalog;
    if (first) populateFilters(catalog);
    renderStats(catalog);
    render();
  } catch (error) {
    if (state.catalog != null) return; // keep the last good view
    const notice = $("notice");
    notice.hidden = false;
    notice.classList.add("error");
    notice.textContent = `Couldn't load the live catalog from ${new URL(url).host} (${error instanceof Error ? error.message : "network error"}). The world server may not publish the marketplace yet.`;
  }
}

async function connectWallet(): Promise<void> {
  const button = $<HTMLButtonElement>("wallet");
  try {
    await prepareBoingWallet();
    const provider = resolveBoingProvider();
    if (provider == null) throw new Error("Boing Express is not available");
    const accounts = await provider.request({
      method: "boing_requestAccounts",
      params: [],
    });
    const first = Array.isArray(accounts) ? accounts[0] : null;
    if (typeof first !== "string") throw new Error("No account");
    state.wallet = first.toLowerCase();
    button.textContent = `${state.wallet.slice(0, 8)}…${state.wallet.slice(-4)}`;
    $<HTMLInputElement>("mine").disabled = false;
    render();
  } catch (error) {
    button.textContent = "Connect wallet";
    button.title = walletErrorText(error);
  }
}

for (const id of ["q", "species", "ownership", "alive", "genesis", "mine"]) {
  $(id).addEventListener("input", render);
}
$("wallet").addEventListener("click", () => void connectWallet());
void load();
window.setInterval(() => void load(), 10_000);
