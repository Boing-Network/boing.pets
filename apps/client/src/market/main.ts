/**
 * Marketplace page (`/market/`): browse every creature, lineage and item NFT
 * with its live in-world status. With the escrow contract configured, Adopt,
 * List, Buy and Cancel build the transaction and Boing Express signs it.
 * Static page, no 3D.
 */
import {
  boingToWei,
  buildEscrowBuyTx,
  buildEscrowCancelTx,
  buildEscrowClaimTx,
  buildEscrowListTx,
  escrowSplit,
  weiToBoing,
  type EscrowTarget,
  type EscrowWalletTx,
  type MarketAsset,
  type MarketCatalog,
  type MarketOwnership,
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
    : el("div", { className: "noimg" }, [
        a.itemCategory === "RELIC" ? "Relic" : a.kind === "ITEM" ? "Item" : "?",
      ]);
  const badges = el("div", { className: "badges" }, [
    el("span", { className: `own ${a.ownership.toLowerCase()}` }, [
      OWNERSHIP_LABEL[a.ownership],
    ]),
    ...(a.genesis ? [el("span", { className: "genesis" }, ["Genesis"])] : []),
    ...(a.itemCategory === "RELIC"
      ? [el("span", { className: "relic" }, ["Relic · LPAR"])]
      : []),
    ...(a.itemCategory === "CONSUMABLE"
      ? [el("span", { className: "lpit" }, ["LPIT · not tradable"])]
      : []),
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
        ...(a.escrowListable === false && a.escrowNote
          ? [el("p", { className: "note" }, [a.escrowNote])]
          : []),
        button,
      ]),
    ],
  );
  return li;
}

type Action = {
  label: string;
  steps: string[];
  /** Shows the sign button (trading actions). */
  trade: boolean;
  /** Ask for a price (listing). */
  needsPrice?: boolean;
  /** Why the sign button is off even with a wallet connected. */
  blocked?: string;
  /** Builds the wallet transaction (escrow contract configured only). */
  build?: (wallet: string, priceText: string) => EscrowWalletTx;
};

const boing = (wei: bigint | string) => `${weiToBoing(wei)} BOING`;
const OBSERVER = "https://boing.observer/tx/";

function escrowTarget(a: MarketAsset): EscrowTarget | null {
  const escrow = state.catalog?.escrow;
  if (escrow?.mode !== "CONTRACT" || escrow.escrowHex == null) return null;
  if (a.collectionHex == null || a.tokenIdHex == null) return null;
  return {
    escrowHex: escrow.escrowHex,
    collectionHex: a.collectionHex,
    tokenId: a.tokenIdHex,
  };
}

function actionFor(a: MarketAsset): Action {
  if (a.escrowListable === false) {
    return {
      label: "Not tradable",
      trade: false,
      steps: [
        a.escrowNote ??
          "This item cannot be listed: the escrow only holds single NFTs.",
        "It stays in the holder's wallet and is used in the world from the item bag.",
      ],
    };
  }
  const escrow = state.catalog?.escrow;
  const esc = short(escrow?.escrowHex ?? null);
  const feeBps = escrow?.feeBps ?? 250;
  const fee = `${feeBps / 100}%`;
  const target = escrowTarget(a);
  const wallet = state.wallet;
  const l = a.listing;
  if (l != null) {
    const price = BigInt(l.priceWei);
    if (wallet != null && l.sellerHex === wallet) {
      return {
        label: "Cancel",
        trade: true,
        steps: [
          `Your listing: ${boing(price)}${l.buyerHex ? `, reserved for ${short(l.buyerHex)}` : ""}.`,
          "Cancel returns the NFT from escrow to your wallet in one transaction.",
        ],
        build:
          target == null
            ? undefined
            : (w) =>
                buildEscrowCancelTx({
                  ...target,
                  senderHex: w,
                  sellerHex: l.sellerHex,
                }),
      };
    }
    if (l.buyerHex != null && l.buyerHex !== wallet) {
      return {
        label: "Reserved",
        trade: false,
        steps: [
          `Reserved in escrow for ${short(l.buyerHex)}${wallet == null ? " (connect your wallet if that is you)" : ""}.`,
        ],
      };
    }
    if (price === 0n && l.buyerHex != null) {
      return {
        label: "Adopt",
        trade: true,
        steps: [
          "Reserved for your wallet, at no cost.",
          `Adopt claims it: escrow (${esc}) sends the NFT to your wallet in one transaction.`,
        ],
        build:
          target == null
            ? undefined
            : (w) => buildEscrowClaimTx({ ...target, playerHex: w }),
      };
    }
    const split = escrowSplit(price, feeBps);
    const feeTo = escrow?.feeToHex ?? escrow?.operatorHex ?? null;
    return {
      label: "Buy",
      trade: true,
      steps: [
        `Listed for ${boing(price)} by ${short(l.sellerHex)}.`,
        `You pay exactly that to the escrow contract (${esc}); it sends you the NFT in the same transaction.`,
        `The seller receives ${boing(split.sellerWei)}; the ${fee} market fee (${boing(split.feeWei)}) goes to the operator.`,
      ],
      ...(feeTo == null
        ? { blocked: "The escrow fee account is not known yet." }
        : {}),
      build:
        target == null || feeTo == null
          ? undefined
          : (w) =>
              buildEscrowBuyTx({
                ...target,
                buyerHex: w,
                sellerHex: l.sellerHex,
                feeToHex: feeTo,
                priceWei: price,
              }),
    };
  }
  switch (a.ownership) {
    case "UNMINTED":
      return {
        label: "View",
        trade: false,
        steps: [
          `Not minted yet. When minted it goes to the operator (${short(escrow?.operatorHex ?? null)}).`,
          "Once minted it can be adopted through escrow.",
        ],
      };
    case "OPERATOR":
      return {
        label: "Adopt",
        trade: true,
        blocked:
          "Not reserved yet: the operator reserves it for your wallet in escrow first.",
        steps: [
          `Held by the operator. To adopt it, the operator reserves it for your wallet in the escrow contract (${esc}).`,
          "Then Adopt here claims it: one transaction, no price, the NFT moves from escrow to you.",
        ],
      };
    case "IN_ESCROW":
      return {
        label: "In escrow",
        trade: false,
        steps: ["Held by escrow without an open listing."],
      };
    case "PLAYER":
      return wallet != null && a.ownerHex === wallet
        ? {
            label: "List",
            trade: true,
            needsPrice: true,
            steps: [
              "Set a price in BOING.",
              `One atomic transaction moves the NFT into the escrow contract (${esc}) and opens the listing.`,
              `When it sells you receive the price minus the ${fee} market fee. Cancel any time to take it back.`,
            ],
            build:
              target == null
                ? undefined
                : (w, priceText) => {
                    const priceWei = boingToWei(priceText);
                    if (priceWei == null || priceWei === 0n) {
                      throw new Error("Enter a price in BOING, like 1.5");
                    }
                    return buildEscrowListTx({
                      ...target,
                      sellerHex: w,
                      priceWei,
                    });
                  },
          }
        : {
            label: "View",
            trade: false,
            steps: [
              `Owned by ${short(a.ownerHex)}. It can be bought once its owner lists it.`,
            ],
          };
  }
}

function txIdOf(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (result != null && typeof result === "object") {
    const r = result as { tx_id?: unknown; tx_hash?: unknown };
    const id = r.tx_id ?? r.tx_hash;
    if (typeof id === "string" && id !== "ok") return id;
  }
  return null;
}

function tradeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/reject|denied|declin|cancel|closed/i.test(text)) {
    return "Cancelled in Boing Express. Nothing was sent.";
  }
  return walletErrorText(error);
}

function openTrade(a: MarketAsset, action: Action): void {
  const dialog = $<HTMLDialogElement>("trade");
  $("trade-title").textContent = `${action.label}: ${a.name}`;
  $("trade-steps").replaceChildren(
    ...action.steps.map((s) => el("li", {}, [s])),
  );
  const escrow = state.catalog?.escrow;
  const sign = $<HTMLButtonElement>("trade-sign");
  const priceRow = $("trade-price-row");
  const priceInput = $<HTMLInputElement>("trade-price");
  const status = $("trade-status");
  status.replaceChildren();
  priceRow.hidden = !action.needsPrice;
  priceInput.value = "";
  sign.hidden = !action.trade;
  sign.disabled =
    action.build == null || state.wallet == null || action.blocked != null;
  $("trade-note").textContent = !action.trade
    ? ""
    : escrow?.mode !== "CONTRACT"
      ? (escrow?.note ?? "Trading is not available on this server yet.")
      : action.blocked != null
        ? action.blocked
        : state.wallet == null
          ? "Connect your wallet to sign."
          : "Boing Express shows the full transaction before you approve it.";
  sign.onclick = async () => {
    const wallet = state.wallet;
    if (action.build == null || wallet == null) return;
    sign.disabled = true;
    try {
      const { summary, ...request } = action.build(wallet, priceInput.value);
      status.textContent = `${summary}: waiting for Boing Express…`;
      await prepareBoingWallet();
      const provider = resolveBoingProvider();
      if (provider == null) throw new Error("Boing Express is not available");
      const result = await provider.request({
        method: "boing_sendTransaction",
        params: [request],
      });
      const id = txIdOf(result);
      status.replaceChildren(
        "Submitted. ",
        ...(id != null
          ? [
              el(
                "a",
                { href: `${OBSERVER}${id}`, target: "_blank", rel: "noopener" },
                [`View tx ${short(id)} on boing.observer`],
              ),
            ]
          : []),
        " The listing updates within about 30 seconds.",
      );
      window.setTimeout(() => void load(), 5_000);
    } catch (error) {
      status.textContent = tradeError(error);
      sign.disabled = false;
    }
  };
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
    $("empty").textContent =
      "No relics or item rewards in this world yet. Relics appear when a lineage has its first child or first loss.";
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
    c.escrow.mode === "CONTRACT"
      ? `${c.escrow.note} Escrow ${short(c.escrow.escrowHex)}, ${(c.escrow.feeBps ?? 250) / 100}% market fee to the operator ${short(c.escrow.feeToHex ?? c.escrow.operatorHex)}, chain ${c.escrow.chainId}.`
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
