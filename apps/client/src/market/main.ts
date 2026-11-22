/**
 * Marketplace page (`/market/`): browse every creature, lineage and item NFT
 * with its live in-world status. With the escrow contract configured, Adopt,
 * List, Buy and Cancel build the transaction and Boing Express signs it.
 * Static page, no 3D.
 */
import {
  boingToWei,
  buildItemBuyTx,
  buildItemCancelTx,
  buildItemListTx,
  itemTotalWei,
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
  type MarketItemHolding,
  type MarketItemListing,
  type MarketItemsResponse,
  type MarketMintChallenge,
  type MarketMintResult,
  type MarketMintRetryable,
  type MarketOwnership,
  MARKET_ITEMS_MINT_CHALLENGE_PATH,
  MARKET_ITEMS_MINT_PATH,
  MARKET_ITEMS_MINT_RETRY_PATH,
  itemImageSrc,
  speciesImageSrc,
} from "@boing-pets/contract";
import {
  prepareBoingWallet,
  resolveBoingProvider,
  walletErrorText,
} from "../wallet/boing-wallet";
import { catalogUrl, itemsUrl, marketPostUrl } from "./catalog-source";
import {
  holdingBlock,
  itemListingOffer,
  mintFeeText,
  mintOffer,
  mintReplyAction,
  parseQty,
  readyToList,
  savedMintPayment,
  saveMintPayment,
  visibleHoldings,
  type MintPaymentStorage,
} from "./item-market";
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

/** Unminted lineage keepsakes: awarded when a player first names the lineage. */
const LINEAGE_UNMINTED_LABEL =
  "Awarded to the first player to name this lineage";

function ownershipLabel(a: MarketAsset): string {
  if (a.kind === "LINEAGE" && a.ownership === "UNMINTED") {
    return LINEAGE_UNMINTED_LABEL;
  }
  return OWNERSHIP_LABEL[a.ownership];
}

function syncOwnershipFilterLabels(): void {
  const option = $("ownership").querySelector('option[value="UNMINTED"]');
  if (option != null) {
    option.textContent =
      state.kind === "LINEAGE"
        ? LINEAGE_UNMINTED_LABEL
        : OWNERSHIP_LABEL.UNMINTED;
  }
}

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
  items: null as MarketItemsResponse | null,
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

function cardImage(a: MarketAsset): HTMLElement {
  const src =
    a.image ?? itemImageSrc(a.itemSlug) ?? speciesImageSrc(a.speciesSlug);
  const fallback =
    a.itemCategory === "RELIC"
      ? "Relic"
      : a.kind === "ITEM"
        ? "Item"
        : (a.speciesName ?? a.name);
  if (src == null) {
    return el("div", { className: "noimg" }, [fallback]);
  }
  const img = el("img", {
    src,
    alt: a.speciesName ?? a.name,
    loading: "lazy",
    width: 480,
    height: 327,
  });
  // A species can ship before its portrait does (bestiary pass 2). Show the
  // same muted placeholder the marketing gallery uses, not a broken image.
  img.addEventListener("error", () => {
    img.replaceWith(el("div", { className: "noimg" }, [fallback]));
  });
  return img;
}

function itemThumb(
  slug: string | null | undefined,
  image: string | null | undefined,
  alt: string,
): HTMLElement {
  const src = image ?? itemImageSrc(slug);
  if (src == null) return el("span", { className: "noimg" });
  const img = el("img", { src, alt: "", width: 40, height: 28 });
  img.setAttribute("alt", alt);
  img.addEventListener("error", () => {
    img.replaceWith(el("span", { className: "noimg" }));
  });
  return img;
}

function card(a: MarketAsset): HTMLLIElement {
  const img = cardImage(a);
  const badges = el("div", { className: "badges" }, [
    el("span", { className: `own ${a.ownership.toLowerCase()}` }, [
      ownershipLabel(a),
    ]),
    ...(a.genesis ? [el("span", { className: "genesis" }, ["Genesis"])] : []),
    ...(a.itemCategory === "RELIC"
      ? [el("span", { className: "relic" }, ["Relic · LPAR"])]
      : []),
    ...(a.itemCategory === "CONSUMABLE"
      ? [
          el("span", { className: "lpit" }, [
            state.catalog?.escrow.itemEscrowHex != null
              ? "LPIT · item market"
              : "LPIT · not tradable",
          ]),
        ]
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
          ? a.kind === "LINEAGE"
            ? LINEAGE_UNMINTED_LABEL
            : "not minted yet"
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
  button.addEventListener("click", () =>
    openTrade(`${action.label}: ${a.name}`, action),
  );
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
  /** Label of the price input (default "Price (BOING)"). */
  priceLabel?: string;
  /** Ask for a quantity, 1..max (item market). */
  needsQty?: { max: number; label: string };
  /** Live total under the inputs (item market). */
  preview?: (priceText: string, qtyText: string) => string;
  /** Why the sign button is off even with a wallet connected. */
  blocked?: string;
  /** Builds the wallet transaction (escrow contract configured only). */
  build?: (
    wallet: string,
    priceText: string,
    qtyText: string,
  ) => EscrowWalletTx;
  /**
   * A multi-step flow instead of one transaction (mint on demand: sign a
   * message, then maybe list). Reports progress through `status`.
   */
  run?: (
    wallet: string,
    priceText: string,
    qtyText: string,
    status: (text: string | Node[]) => void,
  ) => Promise<void>;
  /** Sign button text (default "Sign in Boing Express"). */
  signLabel?: string;
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
    if (state.catalog?.escrow.itemEscrowHex != null) {
      return {
        label: "Item market",
        trade: false,
        steps: [
          a.escrowNote ?? "LPIT items trade by quantity in the Item market.",
          "Connect your wallet to see how many units you can list.",
        ],
      };
    }
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
      return a.kind === "LINEAGE"
        ? {
            label: "View",
            trade: false,
            steps: [LINEAGE_UNMINTED_LABEL],
          }
        : {
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

function openTrade(title: string, action: Action): void {
  const dialog = $<HTMLDialogElement>("trade");
  $("trade-title").textContent = title;
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
  $("trade-price-label").textContent = action.priceLabel ?? "Price (BOING)";
  priceInput.value = "";
  const qtyRow = $("trade-qty-row");
  const qtyInput = $<HTMLInputElement>("trade-qty");
  qtyRow.hidden = action.needsQty == null;
  $("trade-qty-label").textContent = action.needsQty?.label ?? "Quantity";
  qtyInput.value = action.needsQty != null ? "1" : "";
  qtyInput.max = String(action.needsQty?.max ?? 1);
  const preview = $("trade-preview");
  const updatePreview = () => {
    preview.textContent =
      action.preview?.(priceInput.value, qtyInput.value) ?? "";
  };
  priceInput.oninput = updatePreview;
  qtyInput.oninput = updatePreview;
  updatePreview();
  sign.hidden = !action.trade;
  sign.dataset.label ??= (sign.textContent ?? "").trim();
  sign.textContent = action.signLabel ?? sign.dataset.label;
  sign.disabled =
    (action.build == null && action.run == null) ||
    state.wallet == null ||
    action.blocked != null;
  $("trade-note").textContent = !action.trade
    ? ""
    : action.run == null && escrow?.mode !== "CONTRACT"
      ? (escrow?.note ?? "Trading is not available on this server yet.")
      : action.blocked != null
        ? action.blocked
        : state.wallet == null
          ? "Connect your wallet to sign."
          : action.run != null
            ? "Boing Express shows exactly what you sign before you approve it."
            : "Boing Express shows the full transaction before you approve it.";
  sign.onclick = async () => {
    const wallet = state.wallet;
    if (action.run != null && wallet != null) {
      sign.disabled = true;
      try {
        await action.run(wallet, priceInput.value, qtyInput.value, (text) => {
          if (typeof text === "string") status.textContent = text;
          else status.replaceChildren(...text);
        });
      } catch (error) {
        status.textContent = tradeError(error);
        sign.disabled = false;
      }
      return;
    }
    if (action.build == null || wallet == null) return;
    sign.disabled = true;
    try {
      const { summary, ...request } = action.build(
        wallet,
        priceInput.value,
        qtyInput.value,
      );
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
      window.setTimeout(() => void loadItems(), 8_000);
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
  syncOwnershipFilterLabels();
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
  renderItemMarket();
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

// -- LPIT item market ---------------------------------------------------------

async function loadItems(): Promise<void> {
  const url = itemsUrl(
    window.location.search,
    import.meta.env.VITE_LIVING_PETS_MP_URL as string | undefined,
    state.wallet,
  );
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.items = (await res.json()) as MarketItemsResponse;
  } catch {
    // Older servers have no item market; keep the last good view.
  }
  renderItemMarket();
}

function itemFeeText(): { bps: number; fee: string } {
  const bps = state.items?.feeBps ?? 250;
  return { bps, fee: `${bps / 100}%` };
}

function itemBuyAction(l: MarketItemListing, max: number): Action {
  const items = state.items!;
  const { bps, fee } = itemFeeText();
  const unit = BigInt(l.unitPriceWei);
  const feeTo = items.feeToHex;
  return {
    label: "Buy",
    trade: true,
    needsQty: { max, label: `Quantity (1–${max})` },
    steps: [
      `${l.remaining} × ${l.name} listed at ${boing(unit)} each by ${short(l.sellerHex)}.`,
      `You pay quantity × ${boing(unit)} to the item escrow (${short(items.itemEscrowHex)}); it sends you the units in the same transaction and they appear in your item bag in the world.`,
      `The seller receives the total minus the ${fee} market fee, which goes to the operator.`,
    ],
    preview: (_p, q) => {
      const n = parseQty(q, max);
      if (n == null) return `Enter a whole number from 1 to ${max}.`;
      const total = itemTotalWei(unit, n);
      const split = escrowSplit(total, bps);
      return `Total ${boing(total)} (seller ${boing(split.sellerWei)}, fee ${boing(split.feeWei)}).`;
    },
    ...(feeTo == null
      ? { blocked: "The item escrow fee account is not known yet." }
      : {}),
    build: (w, _p, q) => {
      const n = parseQty(q, max);
      if (n == null) throw new Error(`Enter a quantity from 1 to ${max}`);
      return buildItemBuyTx({
        itemEscrowHex: items.itemEscrowHex!,
        collectionHex: items.collectionHex!,
        buyerHex: w,
        sellerHex: l.sellerHex,
        feeToHex: feeTo!,
        listingId: l.id,
        qty: n,
        unitPriceWei: unit,
        itemName: l.name,
      });
    },
  };
}

function itemCancelAction(l: MarketItemListing): Action {
  const items = state.items!;
  return {
    label: "Cancel",
    trade: true,
    steps: [
      `Your listing: ${l.remaining} of ${l.listed} × ${l.name} left at ${boing(BigInt(l.unitPriceWei))} each.`,
      "Cancel returns the unsold units from escrow to your wallet in one transaction; they are usable in the world again after the next market refresh.",
    ],
    build: (w) =>
      buildItemCancelTx({
        itemEscrowHex: items.itemEscrowHex!,
        collectionHex: items.collectionHex!,
        senderHex: w,
        sellerHex: l.sellerHex,
        listingId: l.id,
      }),
  };
}

function itemListAction(h: MarketItemHolding): Action {
  const items = state.items!;
  const { bps, fee } = itemFeeText();
  const max = h.tradable;
  return {
    label: "List",
    trade: true,
    needsPrice: true,
    priceLabel: "Price per unit (BOING)",
    needsQty: { max, label: `Quantity (1–${max})` },
    steps: [
      `You can list up to ${max} × ${h.name}: units in your wallet that are still unused in the world.`,
      `One atomic transaction moves the units into the item escrow (${short(items.itemEscrowHex)}) and opens the listing at your price per unit. Listed units can't be used in the world.`,
      `Buyers can take any quantity. You receive each sale minus the ${fee} market fee; cancel any time to take back what is left.`,
    ],
    preview: (p, q) => {
      const n = parseQty(q, max);
      const unit = boingToWei(p);
      if (n == null) return `Enter a whole number from 1 to ${max}.`;
      if (unit == null || unit === 0n) return "Set a price per unit in BOING.";
      const total = itemTotalWei(unit, n);
      const split = escrowSplit(total, bps);
      return `If all ${n} sell: ${boing(total)}, you receive ${boing(split.sellerWei)}.`;
    },
    build: (w, p, q) => {
      const n = parseQty(q, max);
      if (n == null) throw new Error(`Enter a quantity from 1 to ${max}`);
      const unit = boingToWei(p);
      if (unit == null || unit === 0n) {
        throw new Error("Enter a price per unit in BOING, like 0.5");
      }
      return buildItemListTx({
        itemEscrowHex: items.itemEscrowHex!,
        collectionHex: items.collectionHex!,
        sellerHex: w,
        itemId: h.itemId,
        qty: n,
        unitPriceWei: unit,
        itemName: h.name,
      });
    },
  };
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = marketPostUrl(
    window.location.search,
    import.meta.env.VITE_LIVING_PETS_MP_URL as string | undefined,
    path,
  );
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!res.ok || json == null) {
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  return json;
}

async function postMint(
  path: string,
  body: unknown,
): Promise<{
  status: number;
  body: (MarketMintResult & Record<string, unknown>) | null;
}> {
  const url = marketPostUrl(
    window.location.search,
    import.meta.env.VITE_LIVING_PETS_MP_URL as string | undefined,
    path,
  );
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as
      (MarketMintResult & Record<string, unknown>) | null;
    return { status: res.status, body: json };
  } catch {
    return { status: 0, body: null };
  }
}

const browserStorage = (): MintPaymentStorage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * Player-paid mint: get a challenge (names item, qty, fee and pay-to), sign
 * it, pay the fee with one BOING transfer (or reuse an unused earlier fee),
 * then ask the server to mint. The server checks the payment on chain; while
 * it is not included yet the same request is repeated.
 */
async function requestMint(
  wallet: string,
  h: MarketItemHolding,
  qty: number,
  status: (text: string) => void,
): Promise<void> {
  status(`Mint ${qty} × ${h.name}: asking the server for a challenge…`);
  const challenge = await postJson<MarketMintChallenge>(
    MARKET_ITEMS_MINT_CHALLENGE_PATH,
    { wallet, itemSlug: h.itemSlug, qty },
  );
  status(`Mint ${qty} × ${h.name}: sign the request in Boing Express…`);
  await prepareBoingWallet();
  const provider = resolveBoingProvider();
  if (provider == null) throw new Error("Boing Express is not available");
  const signature = await provider.request({
    method: "boing_signMessage",
    params: [challenge.message, wallet],
  });
  if (typeof signature !== "string" || signature.length < 64) {
    throw new Error("Boing Express did not return a signature");
  }
  const storage = browserStorage();
  let paymentTx = savedMintPayment(storage, wallet);
  if (paymentTx == null) {
    status(
      `Mint ${qty} × ${h.name}: approve the ${challenge.feeBoing} BOING mint fee in Boing Express…`,
    );
    const sent = await provider.request({
      method: "boing_sendTransaction",
      params: [
        {
          type: "transfer",
          to: challenge.payToHex,
          amount: challenge.feeWei,
        },
      ],
    });
    paymentTx = txIdOf(sent);
    if (paymentTx == null) {
      throw new Error("Boing Express did not return the fee tx id");
    }
    // Remember it before anything else can fail: it pays for a retry.
    saveMintPayment(storage, wallet, paymentTx);
  } else {
    status(
      `Mint ${qty} × ${h.name}: using your unused fee ${short(paymentTx)}…`,
    );
  }
  for (let i = 0; i < 40; i += 1) {
    const reply = await postMint(MARKET_ITEMS_MINT_PATH, {
      wallet,
      nonce: challenge.nonce,
      signature,
      paymentTx,
    });
    const next = mintReplyAction(reply.status, reply.body);
    const error =
      reply.body != null && !reply.body.ok
        ? reply.body.error
        : `HTTP ${reply.status}`;
    if (next === "done") {
      saveMintPayment(storage, wallet, null);
      return;
    }
    if (next === "reused") {
      saveMintPayment(storage, wallet, null);
      throw new Error(
        "Your saved fee had already paid for an earlier mint (that mint was re-checked). Press Mint again to pay a new fee.",
      );
    }
    if (next === "keep") {
      throw new Error(
        `${error}. Your ${challenge.feeBoing} BOING fee (${short(paymentTx)}) is unused and will pay for your next mint.`,
      );
    }
    if (next === "drop") {
      saveMintPayment(storage, wallet, null);
      throw new Error(error);
    }
    status(
      `Mint ${qty} × ${h.name}: waiting for the fee ${short(paymentTx)} to land on chain… (${i * 3}s)`,
    );
    await sleep(3_000);
  }
  throw new Error(
    `The fee ${short(paymentTx)} is not on chain yet. Press Mint again in a minute; it will not charge you twice.`,
  );
}

function mintSteps(h: MarketItemHolding, max: number): string[] {
  const mint = state.items?.mint;
  const fee = mintFeeText(mint) ?? "a small";
  const saved =
    state.wallet != null &&
    savedMintPayment(browserStorage(), state.wallet) != null;
  return [
    `${h.unminted ?? 0} × ${h.name} in your world bag aren't on chain yet; you can mint up to ${max} now.`,
    `Mint fee: ${fee} per request (any quantity), paid to the game operator (${short(mint?.payToHex ?? null)}), which pays the mint gas. ${saved ? "You have an unused fee from an earlier try, so you won't be charged again." : "Boing Express asks you to sign the request, then to approve the fee transfer (plus its network gas)."} If the mint then fails, you can retry it without paying again.`,
    `Minted units are yours to list or keep, but your creatures won't eat or use them any more.${mint != null ? ` Up to ${mint.maxRequestsPerDay} mints a day${mint.requestsLeft != null ? ` (${mint.requestsLeft} left today)` : ""}.` : ""}`,
  ];
}

/** Re-queue a paid mint whose operator tx failed (no new fee). */
function retryMintButton(r: MarketMintRetryable): HTMLElement {
  const button = el("button", { type: "button", className: "secondary" }, [
    "Retry (already paid)",
  ]) as HTMLButtonElement;
  button.addEventListener("click", () => {
    button.disabled = true;
    void postMint(MARKET_ITEMS_MINT_RETRY_PATH, {
      paymentTx: r.paymentTx,
    }).then((reply) => {
      button.textContent = reply.body?.ok === true ? "Retrying…" : "Try later";
      window.setTimeout(() => void loadItems(), 20_000);
    });
  });
  return button;
}

function itemMintAction(h: MarketItemHolding, max: number): Action {
  return {
    label: "Mint",
    trade: true,
    signLabel: `Sign, pay ${mintFeeText(state.items?.mint) ?? "fee"} & mint`,
    needsQty: { max, label: `Quantity (1–${max})` },
    steps: mintSteps(h, max),
    run: async (w, _p, q, status) => {
      const n = parseQty(q, max);
      if (n == null) throw new Error(`Enter a quantity from 1 to ${max}`);
      await requestMint(w, h, n, status);
      status(
        `Minting ${n} × ${h.name} to your wallet. It lands within a minute or two; then List it here.`,
      );
      window.setTimeout(() => void loadItems(), 2_000);
      window.setTimeout(() => void loadItems(), 30_000);
    },
  };
}

function itemMintListAction(h: MarketItemHolding, max: number): Action {
  const items = state.items!;
  const { bps, fee } = itemFeeText();
  return {
    label: "Mint & List",
    trade: true,
    signLabel: `Sign, pay ${mintFeeText(state.items?.mint) ?? "fee"}, mint & list`,
    needsPrice: true,
    priceLabel: "Price per unit (BOING)",
    needsQty: { max, label: `Quantity (1–${max})` },
    steps: [
      ...mintSteps(h, max).slice(0, 2),
      `Once the units are in your wallet, Boing Express asks you to approve the listing: one transaction moves them into the item escrow (${short(items.itemEscrowHex)}) at your price. You receive each sale minus the ${fee} fee.`,
    ],
    preview: (p, q) => {
      const n = parseQty(q, max);
      const unit = boingToWei(p);
      if (n == null) return `Enter a whole number from 1 to ${max}.`;
      if (unit == null || unit === 0n) return "Set a price per unit in BOING.";
      const split = escrowSplit(itemTotalWei(unit, n), bps);
      return `If all ${n} sell: you receive ${boing(split.sellerWei)}.`;
    },
    run: async (w, p, q, status) => {
      const n = parseQty(q, max);
      if (n == null) throw new Error(`Enter a quantity from 1 to ${max}`);
      const unit = boingToWei(p);
      if (unit == null || unit === 0n) {
        throw new Error("Enter a price per unit in BOING, like 0.5");
      }
      await requestMint(w, h, n, status);
      // Wait for the mint to land and the server to see it (up to 4 min).
      let ready: MarketItemHolding | null = null;
      for (let i = 0; i < 48 && ready == null; i += 1) {
        status(
          `Minting ${n} × ${h.name}… (${i * 5}s) Keep this open; you'll be asked to approve the listing next.`,
        );
        await sleep(5_000);
        await loadItems();
        ready = readyToList(state.items, h.itemId, n);
      }
      if (ready == null) {
        status(
          "The mint is still settling. Your units will appear under Your items; list them from there.",
        );
        return;
      }
      const { summary, ...request } = buildItemListTx({
        itemEscrowHex: items.itemEscrowHex!,
        collectionHex: items.collectionHex!,
        sellerHex: w,
        itemId: h.itemId,
        qty: n,
        unitPriceWei: unit,
        itemName: h.name,
      });
      status(`${summary}: waiting for Boing Express…`);
      const provider = resolveBoingProvider();
      if (provider == null) throw new Error("Boing Express is not available");
      const result = await provider.request({
        method: "boing_sendTransaction",
        params: [request],
      });
      const id = txIdOf(result);
      status(
        `Minted and listed ${n} × ${h.name}${id != null ? ` (tx ${short(id)})` : ""}. The listing appears within about 30 seconds.`,
      );
      window.setTimeout(() => void loadItems(), 8_000);
    },
  };
}

function actionButton(
  label: string,
  action: Action | null,
  opts: { hover?: string; subject?: string } = {},
) {
  const b = el(
    "button",
    { type: "button", className: "act", title: opts.hover ?? "" },
    [label],
  );
  if (action == null) b.disabled = true;
  else {
    b.addEventListener("click", () =>
      openTrade(
        opts.subject ? `${action.label}: ${opts.subject}` : action.label,
        action,
      ),
    );
  }
  return b;
}

function renderItemMarket(): void {
  const box = $("item-market");
  const items = state.items;
  if (state.kind !== "ITEM" || items == null) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const wallet = state.wallet;
  const head = el("div", { className: "im-head" }, [
    el("h2", {}, ["Item market"]),
    el("p", { className: "sub" }, [
      items.itemEscrowHex != null
        ? `${items.note} Escrow ${short(items.itemEscrowHex)}, ${itemFeeText().fee} fee.`
        : items.note,
    ]),
    ...(items.error != null
      ? [el("p", { className: "note" }, [`Stale view: ${items.error}`])]
      : []),
  ]);
  const rows = items.listings.map((l) => {
    const offer = itemListingOffer(l, wallet);
    const unit = BigInt(l.unitPriceWei);
    let button: HTMLButtonElement;
    switch (offer.kind) {
      case "BUY":
        button = actionButton("Buy", itemBuyAction(l, offer.max), {
          subject: l.name,
        });
        break;
      case "CANCEL":
        button = actionButton("Cancel", itemCancelAction(l), {
          subject: l.name,
        });
        break;
      case "UNBACKED":
        button = actionButton("Not backed", null, {
          hover: `Only ${offer.backed} of ${l.remaining} units are unused in the world; the rest were already used. Not offered.`,
        });
        break;
      case "PENDING":
        button = actionButton("Settling…", null, {
          hover:
            "Waiting for the server to lock the seller's units (about 30 s).",
        });
        break;
      case "CONNECT":
        button = actionButton("Connect wallet", null);
        break;
    }
    return el("tr", {}, [
      el("td", { className: "im-item" }, [
        itemThumb(l.itemSlug, l.image, l.name),
        l.name,
      ]),
      el("td", {}, [`${l.remaining} / ${l.listed}`]),
      el("td", {}, [boing(unit)]),
      el("td", {}, [short(l.sellerHex)]),
      el("td", {}, [button]),
    ]);
  });
  const table = (headers: string[], body: HTMLElement[], empty: string) =>
    body.length === 0
      ? el("p", { className: "empty" }, [empty])
      : el("table", {}, [
          el("thead", {}, [
            el(
              "tr",
              {},
              headers.map((h) => el("th", {}, [h])),
            ),
          ]),
          el("tbody", {}, body),
        ]);
  const parts: HTMLElement[] = [
    head,
    el("h3", {}, ["Open listings"]),
    table(
      ["Item", "Left / listed", "Price per unit", "Seller", ""],
      rows,
      items.itemEscrowHex != null
        ? "No open item listings yet."
        : "Item trading is not configured on this server.",
    ),
  ];
  if (items.itemEscrowHex != null) {
    if (wallet == null) {
      parts.push(
        el("p", { className: "sub" }, [
          "Connect your wallet to list your potions and rations.",
        ]),
      );
    } else {
      const mintInfo = items.mint;
      const mine = visibleHoldings(items.wallet?.holdings ?? []).map((h) => {
        const block = holdingBlock(h);
        const offer = mintOffer(h, mintInfo);
        const buttons: HTMLElement[] = [
          block == null
            ? actionButton("List", itemListAction(h), { subject: h.name })
            : actionButton("List", null, { hover: block }),
        ];
        if (offer.kind === "MINT") {
          buttons.push(
            actionButton("Mint", itemMintAction(h, offer.max), {
              subject: h.name,
              hover: `Mint to your wallet as LPIT (fee ${mintFeeText(mintInfo) ?? "shown next"}).`,
            }),
            actionButton("Mint & List", itemMintListAction(h, offer.max), {
              subject: h.name,
            }),
          );
        } else if (offer.kind === "BLOCKED") {
          buttons.push(actionButton("Mint", null, { hover: offer.reason }));
        }
        const notMinted = h.unminted == null ? "—" : String(h.unminted);
        return el("tr", {}, [
          el("td", { className: "im-item" }, [
            itemThumb(h.itemSlug, h.image, h.name),
            h.name,
          ]),
          el("td", {}, [h.chain == null ? "?" : String(h.chain)]),
          el("td", {}, [String(h.usable)]),
          el("td", {}, [
            (h.minting ?? 0) > 0
              ? `${notMinted} (+${h.minting} minting)`
              : notMinted,
          ]),
          el("td", {}, [String(h.tradable)]),
          el("td", {}, [String(h.listed)]),
          el("td", { className: "im-actions" }, buttons),
        ]);
      });
      parts.push(
        el("h3", {}, ["Your items"]),
        ...(mintInfo != null
          ? [el("p", { className: "sub" }, [mintInfo.note])]
          : []),
        table(
          [
            "Item",
            "In wallet",
            "Minted, unused",
            "Not minted",
            "Tradable",
            "Listed",
            "",
          ],
          mine,
          items.wallet == null
            ? "Loading your balances…"
            : "Nothing in your bag or wallet yet. Your creatures find items as they forage.",
        ),
      );
      const retryable = mintInfo?.retryable ?? [];
      if (retryable.length > 0) {
        parts.push(
          el("h3", {}, ["Paid mints to retry"]),
          el(
            "ul",
            { className: "im-retry" },
            retryable.map((r) =>
              el("li", {}, [
                `${r.qty} × ${r.itemSlug} (fee ${short(r.paymentTx)}) did not mint${r.error != null ? `: ${r.error}` : ""}. `,
                retryMintButton(r),
              ]),
            ),
          ),
        );
      }
    }
  }
  box.replaceChildren(...parts);
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
    void loadItems();
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
void loadItems();
window.setInterval(() => void load(), 10_000);
window.setInterval(() => void loadItems(), 15_000);
