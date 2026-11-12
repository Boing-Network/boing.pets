/** Shared markup and wiring for marketplace filters on /market. */

import {
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
  MARKET_CATEGORIES,
  MARKET_CATEGORY_LABELS,
} from "../content/rarities";
import {
  MARKET_SORT_LABELS,
  MARKET_SORTS,
  type MarketFilterQuery,
} from "../marketFilters";

export const MARKET_FILTER_FORM_HTML = `<form id="market-filters" class="market-filters" autocomplete="off">
  <label class="market-filter-search">Search
    <input id="market-filter-q" type="search" placeholder="Name or item id" />
  </label>
  <label>Category
    <select id="market-filter-category">
      <option value="">All categories</option>
      ${MARKET_CATEGORIES.map((id) => `<option value="${id}">${MARKET_CATEGORY_LABELS[id]}</option>`).join("")}
    </select>
  </label>
  <label>Rarity
    <select id="market-filter-rarity">
      <option value="">All rarities</option>
      ${ITEM_RARITIES.map((id) => `<option value="${id}">${ITEM_RARITY_LABELS[id]}</option>`).join("")}
    </select>
  </label>
  <label>Min price
    <input id="market-filter-min-price" type="text" inputmode="decimal" placeholder="0.1" />
  </label>
  <label>Max price
    <input id="market-filter-max-price" type="text" inputmode="decimal" placeholder="100" />
  </label>
  <label>Sort
    <select id="market-filter-sort">
      ${MARKET_SORTS.map((id) => `<option value="${id}">${MARKET_SORT_LABELS[id]}</option>`).join("")}
    </select>
  </label>
  <label>Min qty
    <input id="market-filter-min-qty" type="number" min="0" max="20" value="" placeholder="Any" />
  </label>
  <label class="market-filter-check">
    <input id="market-filter-mine" type="checkbox" /> My listings
  </label>
  <label class="market-filter-check">
    <input id="market-filter-affordable" type="checkbox" /> I can afford
  </label>
  <button id="market-filter-clear" type="button" class="quiet">Clear filters</button>
</form>
<p id="market-filter-status" class="small market-filter-status"></p>`;

export function readMarketFilterForm(): MarketFilterQuery {
  const value = (id: string) =>
    (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)
      ?.value ?? "";
  const checked = (id: string) =>
    !!(document.getElementById(id) as HTMLInputElement | null)?.checked;
  return {
    q: value("market-filter-q"),
    category: value("market-filter-category") as MarketFilterQuery["category"],
    rarity: value("market-filter-rarity") as MarketFilterQuery["rarity"],
    minPriceBoing: value("market-filter-min-price"),
    maxPriceBoing: value("market-filter-max-price"),
    sort: value("market-filter-sort") as MarketFilterQuery["sort"],
    minQty: value("market-filter-min-qty")
      ? Number(value("market-filter-min-qty"))
      : "",
    mine: checked("market-filter-mine"),
    affordable: checked("market-filter-affordable"),
  };
}

export function resetMarketFilterForm(): void {
  const setVal = (id: string, v: string) => {
    const el = document.getElementById(id) as
      HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = v;
  };
  const setChk = (id: string, v: boolean) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.checked = v;
  };
  setVal("market-filter-q", "");
  setVal("market-filter-category", "");
  setVal("market-filter-rarity", "");
  setVal("market-filter-min-price", "");
  setVal("market-filter-max-price", "");
  setVal("market-filter-sort", "newest");
  setVal("market-filter-min-qty", "");
  setChk("market-filter-mine", false);
  setChk("market-filter-affordable", false);
}

export function bindMarketFilterForm(onChange: () => void): void {
  const form = document.getElementById("market-filters");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", onChange);
  form.addEventListener("change", onChange);
  document
    .getElementById("market-filter-clear")
    ?.addEventListener("click", () => {
      resetMarketFilterForm();
      onChange();
    });
}
