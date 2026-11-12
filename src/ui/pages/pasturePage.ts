import { ACHIEVEMENTS, petSvg } from "../../core";
import {
  COSMETIC_SLOT_LABELS,
  COSMETIC_SLOTS,
  type CosmeticSlot,
  type EquippedCosmetics,
} from "../../content/cosmetics";
import { catalogItem } from "../../economy";
import { api, app, $maybe, notice, pending, type ViewPet } from "../appRuntime";
import { sessionApi } from "../socialSession";
import { formatWalletLabel } from "../../wallet/session";
import type { PastureMount } from "../../pasture3d/mountPasture3d";
import type { PasturePet } from "../../pasture3d/types";
import type { PresenceChat } from "../../world/hooks/usePlazaPresence";

export function controls() {
  for (const id of [
    "connect",
    "hatch",
    "checkin",
    "play",
    "groom",
    "feed",
    "retry",
    "refresh",
    "next",
    "prev",
    "claim",
  ])
    $maybe("#" + id)?.toggleAttribute("disabled", app.busy);
  const hatch = $maybe("#hatch");
  if (hatch) {
    hatch.hidden = !!app.mine;
    hatch.toggleAttribute("disabled", app.busy || !app.owner);
  }
  const checkin = $maybe("#checkin");
  const play = $maybe("#play");
  const groom = $maybe("#groom");
  const feed = $maybe("#feed");
  if (checkin) {
    checkin.hidden = !app.mine;
    checkin.toggleAttribute(
      "disabled",
      app.busy || !!app.mine?.state.checkedIn,
    );
    checkin.textContent = app.mine?.state.checkedIn
      ? "Hello sent today ✓"
      : "Daily hello · sign only";
  }
  if (play) {
    play.hidden = !app.mine;
    play.toggleAttribute("disabled", app.busy || !!app.mine?.state.playedToday);
    play.textContent = app.mine?.state.playedToday
      ? "Played today ✓"
      : "Play · sign only";
  }
  if (groom) {
    groom.hidden = !app.mine;
    groom.toggleAttribute(
      "disabled",
      app.busy || !!app.mine?.state.groomedToday,
    );
    groom.textContent = app.mine?.state.groomedToday
      ? "Groomed today ✓"
      : "Groom · sign only";
  }
  if (feed) {
    feed.hidden = !app.mine;
    feed.toggleAttribute("disabled", app.busy || !!app.mine?.state.fedToday);
    feed.textContent = app.mine?.state.fedToday
      ? "Fed today ✓"
      : "Feed · tiny transaction";
  }
  const retry = $maybe("#retry");
  const forget = $maybe("#forget");
  if (retry) retry.hidden = !pending() || pending()?.owner !== app.owner;
  if (forget) forget.hidden = !!retry?.hidden;
  const disconnectBtn = $maybe("#disconnect");
  if (disconnectBtn) disconnectBtn.hidden = !app.owner;
  const connect = $maybe("#connect");
  if (connect) {
    if (!app.owner) {
      const web = app.providerKind === "web";
      connect.textContent = web ? "Connect web wallet" : "Connect Express";
      connect.title = web
        ? "No Boing Express extension detected — connect with the web wallet"
        : "Connect Boing Express";
      connect.setAttribute("aria-expanded", "false");
    } else if (app.providerKind === "web") {
      connect.textContent = `${formatWalletLabel(app.owner)} · web wallet`;
      connect.title =
        "Connected with the Boing Express web wallet — open menu to disconnect";
    } else {
      connect.textContent = formatWalletLabel(app.owner);
      connect.title =
        "Connected with the Boing Express extension — open menu to disconnect";
    }
  }
}
export function meter(label: string, value: number) {
  return `<label>${label} <meter min="0" max="100" value="${value}"></meter> ${value}%</label>`;
}
export function card(p: ViewPet) {
  const el = document.createElement("article");
  el.className = "pet-card" + (p.owner === app.owner ? " yours" : "");
  const badges = (p.achievements || [])
    .slice(0, 4)
    .map(
      (a) =>
        `<span class="ach" title="${ACHIEVEMENTS[a.code]?.description || a.description}">${a.title}</span>`,
    )
    .join("");
  // SVG is generated exclusively from validated hashes and internal palettes, never user HTML.
  const mind = p.mind
    ? `<p class="mind"><b>${p.mind.mood}</b> · ${p.mind.suggestion}</p><p class="subtle">${(p.mind.cues || []).slice(0, 2).join(" · ")}</p>`
    : "";
  el.innerHTML = `<div class="pet-picture">${petSvg(p.traits, ["scruffy", "stray"].includes(p.state.status))}</div><div class="card-head"><h3>${p.traits.species}</h3><span class="badge">${p.owner === app.owner ? "YOUR BUDDY" : p.state.status.toUpperCase()}</span></div><p class="subtle">${p.traits.personality} · ${p.state.stage} · ${p.state.skills.focus}</p><p class="subtle">${p.state.streak} day streak · ${p.state.xp} XP · ${p.state.boinglets} Boinglets · ${p.state.status}</p>${mind}${meter("Belly", p.state.hunger)}${meter("Joy", p.state.happiness)}${meter("Energy", p.state.energy)}${meter("Hygiene", p.state.hygiene)}${meter("Health", p.state.health)}${badges ? `<div class="ach-row">${badges}</div>` : ""}<p class="small">${p.owner.slice(0, 10)}…${p.owner.slice(-6)}</p><a class="small" target="_blank" rel="noreferrer" href="https://boing.observer/tx/${p.hatch_tx}">Hatch transaction ↗</a>`;
  return el;
}
export async function refreshBuddyCard() {
  app.mine = app.owner
    ? (await api<{ pet: ViewPet | null }>("/api/pet?owner=" + app.owner)).pet
    : null;
  const slot = $maybe("#my-pet");
  if (!slot) return;
  slot.replaceChildren();
  if (app.mine) {
    const el = card(app.mine);
    slot.append(el);
    void attachEquipPanel(el, app.mine);
  } else
    slot.textContent = app.owner
      ? "Your egg is waiting. Ready to meet the tiny oddball inside?"
      : "Connect Boing Express to hatch your first buddy. You can browse the pasture without a wallet.";
}

export async function refreshPastureGallery() {
  const gallery = $maybe("#gallery");
  const data = await api<{ pets: ViewPet[]; next: number | null }>(
    "/api/pasture?offset=" + app.offset,
  );
  app.next = data.next;
  renderPastureWorld(data.pets);
  if (gallery) {
    gallery.replaceChildren(...data.pets.map(card));
    if (!data.pets.length)
      gallery.textContent =
        "A peaceful, empty pasture. Your buddy could be the very first.";
  }
  const prev = $maybe("#prev");
  const nextBtn = $maybe("#next");
  if (prev) prev.hidden = app.offset === 0;
  if (nextBtn) nextBtn.hidden = app.next === null;
}

let pastureMount: PastureMount | null = null;
let pastureChatHooked = false;
let pastureEscapeHooked = false;
let pastureViewportHooked = false;

export async function unmountPasture3d() {
  pastureMount?.unmount();
  pastureMount = null;
}

function renderChatLog(chats: PresenceChat[]) {
  const log = $maybe("#pasture-chat-log");
  if (!log) return;
  log.replaceChildren();
  for (const chat of chats.slice(-8)) {
    const row = document.createElement("p");
    row.className = "pasture-chat-line";
    row.textContent = `${chat.name}: ${chat.text}`;
    log.append(row);
  }
}

function scrollPastureIntoView() {
  const canvas = $maybe("#pasture-canvas");
  if (!canvas) return;
  const reduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
  const rect = canvas.getBoundingClientRect();
  const topPad = 8;
  const bottomPad = 8;
  const room = window.innerHeight - topPad - bottomPad;
  // Prefer keeping the chat bar (the canvas bottom) in view.
  const targetTop =
    rect.height >= room
      ? window.scrollY + rect.bottom - (window.innerHeight - bottomPad)
      : window.scrollY + rect.top - topPad;
  if (Math.abs(targetTop - window.scrollY) > 1) {
    window.scrollTo({ top: Math.max(0, targetTop), behavior });
  }
}

function hookPastureViewport() {
  if (pastureViewportHooked) {
    if (location.hash === "#pasture" || location.hash === "#pasture-canvas") {
      requestAnimationFrame(() => scrollPastureIntoView());
    }
    return;
  }
  pastureViewportHooked = true;
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const link = target?.closest?.(
      'a[href="#pasture"], a[href="#pasture-canvas"]',
    );
    if (!link) return;
    event.preventDefault();
    const canvas = $maybe("#pasture-canvas");
    if (canvas && "id" in canvas) {
      history.replaceState(null, "", "#pasture-canvas");
    }
    scrollPastureIntoView();
  });
  if (location.hash === "#pasture" || location.hash === "#pasture-canvas") {
    requestAnimationFrame(() => scrollPastureIntoView());
  }
}

function hookPastureChat() {
  const form = $maybe<HTMLFormElement>("#pasture-chat-form");
  const input = $maybe<HTMLInputElement>("#pasture-chat-input");
  if (!form || !input) return;
  form.hidden = false;
  if (pastureChatHooked) return;
  pastureChatHooked = true;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const sent = window.__pasture3d?.sendChat(text);
    if (sent) input.value = "";
    else
      notice(
        app.owner
          ? "Still joining the pasture as your wallet to chat. Try once more in a moment."
          : "Connect to chat in the pasture.",
        true,
      );
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (window.__pasture3d?.getStationMenu?.()) {
        window.__pasture3d.closeStationMenu();
        event.preventDefault();
        return;
      }
      if (document.activeElement === input) {
        input.blur();
        event.preventDefault();
        return;
      }
      closeInspect();
      return;
    }
    if (event.key !== "Enter") return;
    if (document.querySelector(".pasture-station-menu")) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      tag === "BUTTON"
    )
      return;
    event.preventDefault();
    input.focus();
  });
}

type CosmeticsPayload = {
  equipped: EquippedCosmetics;
  owned: Array<{ id: string; slot: CosmeticSlot | null; name: string }>;
};

const cosmeticsCache = new Map<string, CosmeticsPayload>();

async function loadOwnedCosmetics(owner: string): Promise<CosmeticsPayload> {
  const cached = cosmeticsCache.get(owner);
  if (cached) return cached;
  const data = await api<CosmeticsPayload>(
    "/api/pet/cosmetics?owner=" + encodeURIComponent(owner),
  );
  const payload = {
    equipped: data.equipped || {},
    owned: data.owned || [],
  };
  cosmeticsCache.set(owner, payload);
  return payload;
}

async function attachEquipPanel(host: HTMLElement, pet: ViewPet) {
  if (pet.owner !== app.owner) return;
  const existing = host.querySelector(".pasture-equip");
  existing?.remove();
  const box = document.createElement("div");
  box.className = "pasture-equip";
  const title = document.createElement("p");
  title.className = "eyebrow";
  title.textContent = "EQUIPPED COSMETICS";
  box.append(title);
  let data: CosmeticsPayload;
  try {
    data = await loadOwnedCosmetics(pet.owner);
  } catch {
    const hint = document.createElement("p");
    hint.className = "small";
    hint.textContent = "Could not load cosmetics yet.";
    box.append(hint);
    host.append(box);
    return;
  }
  if (pet.cosmetics) data = { ...data, equipped: pet.cosmetics };
  if (!data.owned.length) {
    const hint = document.createElement("p");
    hint.className = "small";
    hint.textContent =
      "Unlock cosmetics in the collection log, then equip them here.";
    box.append(hint);
    host.append(box);
    return;
  }
  for (const slot of COSMETIC_SLOTS) {
    const row = document.createElement("label");
    row.className = "pasture-equip-row";
    row.append(`${COSMETIC_SLOT_LABELS[slot]} `);
    const select = document.createElement("select");
    select.dataset.slot = slot;
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "Unequipped";
    select.append(none);
    const items = data.owned.filter((item) => item.slot === slot);
    for (const item of items) {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.name || catalogItem(item.id)?.name || item.id;
      if (data.equipped?.[slot] === item.id) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener("change", () => {
      void equipSlot(pet, slot, select.value || null, select);
    });
    row.append(select);
    box.append(row);
  }
  host.append(box);
}

async function equipSlot(
  pet: ViewPet,
  slot: CosmeticSlot,
  itemId: string | null,
  select: HTMLSelectElement,
) {
  select.disabled = true;
  try {
    const result = await sessionApi<{
      ok: boolean;
      equipped: EquippedCosmetics;
    }>("/api/pet/cosmetics/equip", {
      owner: pet.owner,
      slot,
      item_id: itemId,
    });
    const equipped = result.equipped || {};
    cosmeticsCache.set(pet.owner, {
      equipped,
      owned: cosmeticsCache.get(pet.owner)?.owned || [],
    });
    pet.cosmetics = equipped;
    if (app.mine?.owner === pet.owner) app.mine.cosmetics = equipped;
    pastureMount?.setEquipped(pet.owner, equipped);
    window.__pasture3d?.sendCosmetics(equipped);
  } catch (error) {
    notice(
      error instanceof Error ? error.message : "Could not equip that cosmetic",
      true,
    );
    const current = pet.cosmetics?.[slot] || "";
    select.value = current;
  } finally {
    select.disabled = false;
  }
}

function closeInspect() {
  const inspect = $maybe("#pasture-inspect");
  if (!inspect) return;
  inspect.hidden = true;
  inspect.replaceChildren();
}

function openInspect(pet: ViewPet) {
  const inspect = $maybe("#pasture-inspect");
  if (!inspect) return;
  inspect.hidden = false;
  inspect.replaceChildren();
  const head = document.createElement("div");
  head.className = "pasture-inspect-head";
  const title = document.createElement("p");
  title.className = "eyebrow";
  title.textContent = pet.owner === app.owner ? "YOUR BUDDY" : "PASTURE FRIEND";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "quiet";
  close.textContent = "Close";
  close.addEventListener("click", closeInspect);
  head.append(title, close);
  const petCard = card(pet);
  inspect.append(head, petCard);
  void attachEquipPanel(petCard, pet);
  inspect.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderA11yList(pets: ViewPet[]) {
  const layer = $maybe("#pasture-sprites");
  if (!layer) return;
  layer.replaceChildren();
  for (const pet of pets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "pasture-sprite" + (pet.owner === app.owner ? " yours" : "");
    btn.dataset.owner = pet.owner;
    btn.textContent = `${pet.traits.species} · open pet card`;
    btn.addEventListener("click", () => openInspect(pet));
    layer.append(btn);
  }
}

async function mountOrUpdatePasture(pets: ViewPet[]) {
  const root = $maybe("#pasture-3d");
  const empty = $maybe("#pasture-empty");
  if (empty) empty.hidden = pets.length > 0;
  renderA11yList(pets);
  if (!root) return;
  const { mountPasture3d } = await import("../../pasture3d/mountPasture3d");
  const props = {
    pets,
    owner: app.owner || null,
    onInspect: (pet: PasturePet) => openInspect(pet as ViewPet),
    onChats: renderChatLog,
    onStatus: (text: string) => {
      const status = $maybe("#pasture-presence-status");
      if (status) status.textContent = text;
    },
  };
  if (!pastureMount) pastureMount = mountPasture3d(root, props);
  else pastureMount.update(props);
  hookPastureChat();
  hookPastureViewport();
  if (!pastureEscapeHooked) pastureEscapeHooked = true;
}

function renderPastureWorld(pets: ViewPet[]) {
  void mountOrUpdatePasture(pets);
}
