import { playSfx, type SfxName } from "../../audio";
import { api, app, $, notice } from "../appRuntime";
import { assertWallet, run } from "../careActions";
import { refreshEconomy } from "./progressPage";
import {
  loadAttemptStatus,
  playCook,
  playGarden,
  wireActivityButton,
} from "../minigames/playActivity";
import type { ActivityId } from "../../content/attempts";

const attemptStatus: Partial<
  Record<ActivityId, Awaited<ReturnType<typeof loadAttemptStatus>>>
> = {};
const wiredLifestyle = new Map<string, HTMLButtonElement>();

function ensureLifestylePlay(activity: "garden" | "cook") {
  const buttonId = activity === "garden" ? "garden-play" : "cook-play";
  const stageId = activity === "garden" ? "garden-minigame" : "cook-minigame";
  const existing = document.getElementById(
    buttonId,
  ) as HTMLButtonElement | null;
  if (existing && wiredLifestyle.get(buttonId) === existing) {
    existing.dispatchEvent(new Event("boing-refresh-label"));
    return;
  }
  const button = document.getElementById(buttonId) as HTMLButtonElement | null;
  const stage = document.getElementById(stageId) as HTMLElement | null;
  if (!button || !stage) return;
  const refreshLabel = wireActivityButton({
    button,
    activity,
    stage,
    getStatus: () => attemptStatus[activity] || null,
    setStatus: (s) => {
      attemptStatus[activity] = s;
    },
    play: activity === "garden" ? playGarden : playCook,
    labelReady: activity === "garden" ? "Tend · play" : "Cook · play",
  });
  button.addEventListener("boing-refresh-label", () => refreshLabel());
  if (button) wiredLifestyle.set(buttonId, button);
}

function rewardExtrasNotice(
  bonus:
    | {
        percent: number;
        amount: number;
        together: boolean;
        partySize: number;
      }
    | null
    | undefined,
  varietyAwarded?: number | null,
) {
  const parts: string[] = [];
  if (bonus && bonus.amount) {
    const pct = Math.round(bonus.percent * 100);
    parts.push(
      `Party bonus +${pct}% (+${bonus.amount}ℬ${bonus.together ? ", together" : ""})`,
    );
  }
  if (varietyAwarded && varietyAwarded > 0) {
    parts.push(`Variety day +${varietyAwarded}ℬ`);
  }
  return parts.length ? ` ${parts.join(" · ")}.` : "";
}

export async function gardenAct(
  kind: string,
  extra: Record<string, unknown> = {},
) {
  await assertWallet();
  notice("Approve the garden signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/garden/challenge",
    { owner: app.owner, kind, ...extra },
  );
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  const result = await api<{
    ok?: boolean;
    party_bonus?: {
      percent: number;
      amount: number;
      together: boolean;
      partySize: number;
    } | null;
    variety_awarded?: number;
  }>("/api/garden/confirm", { id: challenge.id, signature });
  await refreshGarden();
  await refreshEconomy().catch(() => undefined);
  notice(
    kind === "harvest"
      ? `Harvest complete.${rewardExtrasNotice(result.party_bonus, result.variety_awarded)}`
      : "Garden updated.",
  );
  const gardenSfx: Record<string, SfxName> = {
    plant: "plant",
    water: "water",
    harvest: "harvest",
  };
  playSfx(gardenSfx[kind] || "plant");
}

export async function refreshGarden() {
  const data = await api<{
    crops: Array<{ id: string; name: string; rewardBoinglets: number }>;
    slots: number;
    plots: Array<{
      slot: number;
      crop_id: string;
      ready: boolean;
      watered: boolean;
      ready_at: number;
      crop: { name: string } | null;
    }>;
  }>("/api/garden/status" + (app.owner ? `?owner=${app.owner}` : ""));
  const select = $("#garden-crop") as HTMLSelectElement;
  select.replaceChildren(
    ...data.crops.map(
      (c) => new Option(`${c.name} · ${c.rewardBoinglets}ℬ`, c.id),
    ),
  );
  try {
    attemptStatus.garden = await loadAttemptStatus("garden");
    const s = attemptStatus.garden;
    const attemptLine = app.owner
      ? !s.hatched
        ? "Hatch a buddy to unlock the watering mini-game."
        : `${s.attemptsUsed}/${s.dailyCap} play attempts today · ${s.remaining} left`
      : "";
    $("#garden-summary").textContent = app.owner
      ? `${data.plots.length}/${data.slots} plots planted · ${attemptLine}`
      : "Connect Express and hatch a buddy to tend three garden beds.";
  } catch {
    $("#garden-summary").textContent = app.owner
      ? `${data.plots.length}/${data.slots} plots planted`
      : "Connect Express and hatch a buddy to tend three garden beds.";
  }
  ensureLifestylePlay("garden");
  const bySlot = new Map(data.plots.map((p) => [p.slot, p]));
  const cells: HTMLElement[] = [];
  for (let slot = 0; slot < data.slots; slot++) {
    const plot = bySlot.get(slot);
    const card = document.createElement("article");
    card.className = "market-card";
    if (!plot) {
      card.innerHTML = `<h3>Slot ${slot + 1}</h3><p class="subtle">Empty soil</p>`;
      const plant = document.createElement("button");
      plant.className = "secondary";
      plant.textContent = "Plant · sign";
      plant.hidden = !app.owner;
      plant.disabled = app.busy;
      plant.onclick = () =>
        void run(async () => {
          const cropId = select.value;
          if (!cropId) throw new Error("Pick a crop first");
          await gardenAct("plant", { slot, crop_id: cropId });
        });
      card.append(plant);
    } else {
      const waitSec = Math.max(
        0,
        Math.ceil((plot.ready_at - Date.now()) / 1000),
      );
      card.innerHTML = `<h3>${plot.crop?.name || plot.crop_id}</h3><p class="subtle">${plot.ready ? "Ready" : `${waitSec}s left`}${plot.watered ? " · watered" : ""}</p>`;
      if (!plot.watered && !plot.ready) {
        const water = document.createElement("button");
        water.className = "secondary";
        water.textContent = "Water · sign";
        water.disabled = app.busy || !app.owner;
        water.onclick = () => void run(() => gardenAct("water", { slot }));
        card.append(water);
      }
      if (plot.ready) {
        const harvest = document.createElement("button");
        harvest.className = "secondary";
        harvest.textContent = "Harvest · sign";
        harvest.disabled = app.busy || !app.owner;
        harvest.onclick = () => void run(() => gardenAct("harvest", { slot }));
        card.append(harvest);
      }
    }
    cells.push(card);
  }
  $("#garden-plots").replaceChildren(...cells);
}

export async function kitchenAct(
  kind: string,
  extra: Record<string, unknown> = {},
) {
  await assertWallet();
  notice("Approve the kitchen signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/cook/challenge",
    { owner: app.owner, kind, ...extra },
  );
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  const result = await api<{
    ok?: boolean;
    party_bonus?: {
      percent: number;
      amount: number;
      together: boolean;
      partySize: number;
    } | null;
    variety_awarded?: number;
  }>("/api/cook/confirm", { id: challenge.id, signature });
  await refreshKitchen();
  await refreshEconomy().catch(() => undefined);
  if (kind === "serve") {
    notice("Snack served — vitals boosted.");
    playSfx("care");
  } else {
    notice(
      `Dish cooked.${rewardExtrasNotice(result.party_bonus, result.variety_awarded)}`,
    );
    playSfx("cook");
  }
}

export async function refreshKitchen() {
  const data = await api<{
    recipes: Array<{
      id: string;
      name: string;
      foodId: string;
      foodName: string;
      rewardBoinglets: number;
      hungerBoost: number;
      energyBoost: number;
      ingredients: Array<{ itemId: string; qty: number }>;
    }>;
    cookedToday: number;
    servedToday: number;
    cookCap: number;
    serveCap: number;
    pantry: Record<string, number>;
    dishes: Record<string, number>;
  }>("/api/cook/status" + (app.owner ? `?owner=${app.owner}` : ""));
  try {
    attemptStatus.cook = await loadAttemptStatus("cook");
    const s = attemptStatus.cook;
    const attemptLine = app.owner
      ? !s.hatched
        ? "Hatch a buddy to unlock the recipe mini-game."
        : `${s.attemptsUsed}/${s.dailyCap} play attempts today · ${s.remaining} left`
      : "";
    $("#kitchen-summary").textContent = app.owner
      ? `Cooked ${data.cookedToday}/${data.cookCap} · served ${data.servedToday}/${data.serveCap} · ${attemptLine}`
      : "Connect Express, gather crops or fish, then cook and serve snacks.";
  } catch {
    $("#kitchen-summary").textContent = app.owner
      ? `Cooked ${data.cookedToday}/${data.cookCap} · served ${data.servedToday}/${data.serveCap} today`
      : "Connect Express, gather crops or fish, then cook and serve snacks.";
  }
  ensureLifestylePlay("cook");
  $("#kitchen-recipes").replaceChildren(
    ...data.recipes.map((recipe) => {
      const el = document.createElement("article");
      el.className = "market-card";
      const need = recipe.ingredients
        .map((i) => `${i.qty}× ${i.itemId}`)
        .join(", ");
      const can = recipe.ingredients.every(
        (i) => (data.pantry[i.itemId] || 0) >= i.qty,
      );
      el.innerHTML = `<h3>${recipe.name}</h3><p class="subtle">+${recipe.rewardBoinglets}ℬ · hunger +${recipe.hungerBoost}${recipe.energyBoost ? ` · energy +${recipe.energyBoost}` : ""}</p><p class="small">${need}</p>`;
      const btn = document.createElement("button");
      btn.className = "secondary";
      btn.textContent = "Cook · sign";
      btn.hidden = !app.owner;
      btn.disabled = app.busy || !can || data.cookedToday >= data.cookCap;
      btn.onclick = () =>
        void run(() => kitchenAct("cook", { recipe_id: recipe.id }));
      el.append(btn);
      return el;
    }),
  );
  const dishEntries = Object.entries(data.dishes);
  if (!dishEntries.length) {
    const empty = document.createElement("p");
    empty.className = "subtle";
    empty.textContent = "No cooked dishes yet.";
    $("#kitchen-dishes").replaceChildren(empty);
  } else {
    $("#kitchen-dishes").replaceChildren(
      ...dishEntries.map(([foodId, qty]) => {
        const recipe = data.recipes.find((r) => r.foodId === foodId);
        const el = document.createElement("article");
        el.className = "market-card";
        el.innerHTML = `<h3>${recipe?.foodName || foodId}</h3><p class="subtle">×${qty}</p>`;
        const btn = document.createElement("button");
        btn.className = "secondary";
        btn.textContent = "Serve · sign";
        btn.disabled =
          app.busy || !app.owner || data.servedToday >= data.serveCap;
        btn.onclick = () =>
          void run(() => kitchenAct("serve", { food_id: foodId }));
        el.append(btn);
        return el;
      }),
    );
  }
}

export async function housingAct(
  kind: string,
  extra: Record<string, unknown> = {},
) {
  await assertWallet();
  notice("Approve the housing signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/housing/challenge",
    { owner: app.owner, kind, ...extra },
  );
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  await api("/api/housing/confirm", { id: challenge.id, signature });
  await refreshHousing();
  await refreshEconomy().catch(() => undefined);
  notice("Home updated.");
}

export async function refreshHousing() {
  const data = await api<{
    grid: number;
    plot: { visibility: string } | null;
    private?: boolean;
    placements: Array<{ id: string; item_id: string; x: number; y: number }>;
    furniture: Array<{ item_id: string; qty: number; name: string }>;
  }>(
    "/api/housing/plot" +
      (app.owner ? `?owner=${app.owner}&viewer=${app.owner}` : ""),
  );
  const visBtn = $("#home-visibility") as HTMLButtonElement;
  if (!app.owner || !data.plot) {
    $("#home-summary").textContent = app.owner
      ? "Hatch a buddy to unlock your home plot."
      : "Connect Express to claim a public 4×4 home plot.";
    visBtn.hidden = true;
    $("#home-grid").replaceChildren();
    ($("#home-furniture") as HTMLSelectElement).replaceChildren(
      new Option("Select owned furniture…", ""),
    );
    return;
  }
  $("#home-summary").textContent = data.private
    ? "This home is private."
    : `Your plot is ${data.plot.visibility}. ${data.furniture.length} furniture stack(s) ready to place.`;
  visBtn.hidden = false;
  visBtn.disabled = app.busy;
  visBtn.textContent =
    data.plot.visibility === "public"
      ? "Make private · sign"
      : "Make public · sign";
  const select = $("#home-furniture") as HTMLSelectElement;
  select.replaceChildren(new Option("Select owned furniture…", ""));
  for (const stack of data.furniture) {
    select.append(new Option(`${stack.name} ×${stack.qty}`, stack.item_id));
  }
  const byCell = new Map(data.placements.map((p) => [`${p.x},${p.y}`, p]));
  const cells: HTMLButtonElement[] = [];
  for (let y = 0; y < data.grid; y++) {
    for (let x = 0; x < data.grid; x++) {
      const key = `${x},${y}`;
      const placed = byCell.get(key);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "home-cell" + (placed ? " filled" : "");
      cell.textContent = placed ? placed.item_id.replace("furn-", "") : "·";
      cell.title = placed
        ? `${placed.item_id} — click to pick up`
        : `Empty (${x},${y}) — place selected furniture`;
      cell.disabled = app.busy;
      if (placed) {
        cell.onclick = () =>
          void run(() => housingAct("pickup", { placement_id: placed.id }));
      } else {
        cell.onclick = () =>
          void run(async () => {
            const itemId = select.value;
            if (!itemId) throw new Error("Select furniture to place first");
            await housingAct("place", { item_id: itemId, x, y });
          });
      }
      cells.push(cell);
    }
  }
  $("#home-grid").style.setProperty("--home-grid", String(data.grid));
  $("#home-grid").replaceChildren(...cells);
}
