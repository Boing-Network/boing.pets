import { ACHIEVEMENTS, petSvg } from "../../core";
import { petSerialLabel } from "../petSerial";
import { type EquippedCosmetics } from "../../content/cosmetics";
import { api, app, $maybe, notice, pending, type ViewPet } from "../appRuntime";
import {
  buddyChipLabel,
  equippedSummary,
  isOwnBuddy,
  publicPetInfo,
} from "./buddyPanel";
import { formatWalletLabel } from "../../wallet/session";
import type { PastureMount } from "../../pasture3d/mountPasture3d";
import type { PasturePet } from "../../pasture3d/types";
import type { PresenceChat } from "../../world/hooks/usePlazaPresence";
import { activityKindForHash } from "../../pasture3d/activityAreas";

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
  el.innerHTML = `<div class="pet-picture">${petSvg(p.traits, ["scruffy", "stray"].includes(p.state.status))}</div><p class="pet-kicker">PASTURE · LIVE</p><div class="card-head"><h3>${p.traits.species}</h3><span class="sticker sticker-accent">${p.owner === app.owner ? "YOUR BUDDY" : p.state.status.toUpperCase()}</span></div><p class="pet-serial">${petSerialLabel(p.hatch_tx)}</p><p class="subtle">${p.traits.personality} · ${p.state.stage} · ${p.state.skills.focus}</p><p class="subtle">${p.state.streak} day streak · ${p.state.xp} XP · ${p.state.boinglets} Boinglets · ${p.state.status}</p>${mind}${meter("Belly", p.state.hunger)}${meter("Joy", p.state.happiness)}${meter("Energy", p.state.energy)}${meter("Hygiene", p.state.hygiene)}${meter("Health", p.state.health)}${badges ? `<div class="ach-row">${badges}</div>` : ""}<p class="small">${p.owner.slice(0, 10)}…${p.owner.slice(-6)}</p><a class="small" target="_blank" rel="noreferrer" href="https://boing.observer/tx/${p.hatch_tx}">Hatch transaction ↗</a>`;
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
    void attachEquippedSummary(el, app.mine);
  } else
    slot.textContent = app.owner
      ? "Your egg is waiting. Ready to meet the tiny oddball inside?"
      : "Connect Boing Express to hatch your first buddy. You can browse the pasture without a wallet.";
  refreshBuddyChip();
}

function refreshBuddyChip() {
  const chip = $maybe("#buddy-chip");
  const label = chip?.querySelector(".pasture-buddy-chip-label") || chip;
  if (!label) return;
  label.textContent = buddyChipLabel({
    connected: !!app.owner,
    hasPet: !!app.mine,
    species: app.mine?.traits.species,
  });
  chip?.setAttribute(
    "aria-label",
    app.mine
      ? `Open your buddy card, ${app.mine.traits.species}`
      : app.owner
        ? "Open hatch and care"
        : "Open your buddy corner",
  );
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
      if (isBuddyOverlayOpen()) {
        closeBuddyOverlay();
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
  owned: Array<{ id: string; slot: string | null; name: string }>;
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

async function attachEquippedSummary(host: HTMLElement, pet: ViewPet) {
  const existing = host.querySelector(".pasture-equip");
  existing?.remove();
  const box = document.createElement("div");
  box.className = "pasture-equip";
  const title = document.createElement("p");
  title.className = "eyebrow";
  title.textContent = "EQUIPPED COSMETICS";
  box.append(title);
  const line = document.createElement("p");
  line.className = "small";
  try {
    const data = await loadOwnedCosmetics(pet.owner);
    const equipped = pet.cosmetics || data.equipped;
    line.textContent = equippedSummary(equipped);
  } catch {
    line.textContent = "Could not load cosmetics yet.";
  }
  const hint = document.createElement("p");
  hint.className = "small";
  hint.innerHTML =
    "Walk southeast of spawn to the Customization Station to change outfits.";
  box.append(line, hint);
  host.append(box);
}

function setCanvasOverlayOpen(open: boolean) {
  $maybe("#pasture-canvas")?.classList.toggle("is-overlay-open", open);
}

function isBuddyOverlayOpen() {
  const overlay = $maybe("#pasture-buddy-overlay");
  return !!overlay && !overlay.hidden;
}

function syncOverlayClass() {
  const inspect = $maybe("#pasture-inspect");
  setCanvasOverlayOpen(isBuddyOverlayOpen() || (!!inspect && !inspect.hidden));
}

function closeBuddyOverlay() {
  const overlay = $maybe("#pasture-buddy-overlay");
  const chip = $maybe("#buddy-chip");
  if (overlay) overlay.hidden = true;
  chip?.setAttribute("aria-expanded", "false");
  syncOverlayClass();
}

export function openBuddyOverlay() {
  closeInspect(false);
  const overlay = $maybe("#pasture-buddy-overlay");
  const chip = $maybe("#buddy-chip");
  if (!overlay) return;
  overlay.hidden = false;
  chip?.setAttribute("aria-expanded", "true");
  syncOverlayClass();
  if (app.mine) {
    const cardEl = $maybe("#my-pet .pet-card");
    if (cardEl) void attachEquippedSummary(cardEl, app.mine);
  }
  overlay.scrollIntoView({ block: "nearest", behavior: "smooth" });
  $maybe("#buddy-close")?.focus();
}

function hookActivityAreaHash() {
  const go = () => {
    const kind = activityKindForHash(location.hash);
    if (!kind) return;
    const tryWalk = (attempts = 0) => {
      const dbg = pastureMount?.getDebug() || window.__pasture3d;
      if (dbg?.walkToAndOpen) {
        dbg.walkToAndOpen(kind);
        return;
      }
      if (attempts < 40) window.setTimeout(() => tryWalk(attempts + 1), 50);
    };
    tryWalk();
  };
  if (!document.documentElement.dataset.activityHashWired) {
    document.documentElement.dataset.activityHashWired = "1";
    window.addEventListener("hashchange", go);
    document.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute("href") || "";
      const hash = href.startsWith("/#")
        ? href.slice(1)
        : href.startsWith("#")
          ? href
          : "";
      const kind = activityKindForHash(hash);
      if (!kind) return;
      const path = location.pathname;
      const onPasture =
        path === "/" || path.endsWith("/index.html") || path.endsWith("/");
      if (!onPasture) return;
      event.preventDefault();
      history.replaceState(null, "", hash.startsWith("#") ? hash : `#${hash}`);
      go();
    });
  }
  go();
}

function hookBuddyOverlay() {
  const chip = $maybe("#buddy-chip");
  const close = $maybe("#buddy-close");
  if (chip && !chip.dataset.wired) {
    chip.dataset.wired = "1";
    chip.addEventListener("click", () => {
      if (isBuddyOverlayOpen()) closeBuddyOverlay();
      else openBuddyOverlay();
    });
  }
  if (close && !close.dataset.wired) {
    close.dataset.wired = "1";
    close.addEventListener("click", closeBuddyOverlay);
  }
  const openFromHash = () => {
    if (location.hash === "#buddy") openBuddyOverlay();
  };
  if (!document.documentElement.dataset.buddyHashWired) {
    document.documentElement.dataset.buddyHashWired = "1";
    window.addEventListener("hashchange", openFromHash);
    document.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.('a[href="#buddy"]');
      if (!link) return;
      event.preventDefault();
      history.replaceState(null, "", "#buddy");
      openBuddyOverlay();
    });
  }
  openFromHash();
}

function closeInspect(sync = true) {
  const inspect = $maybe("#pasture-inspect");
  if (!inspect) return;
  inspect.hidden = true;
  inspect.replaceChildren();
  if (sync) syncOverlayClass();
}

function openPublicInspect(pet: ViewPet) {
  const inspect = $maybe("#pasture-inspect");
  if (!inspect) return;
  closeBuddyOverlay();
  inspect.hidden = false;
  inspect.replaceChildren();
  const head = document.createElement("div");
  head.className = "pasture-inspect-head";
  const title = document.createElement("p");
  title.className = "eyebrow";
  title.textContent = "PASTURE FRIEND";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "quiet";
  close.textContent = "Close";
  close.addEventListener("click", () => closeInspect());
  head.append(title, close);
  const info = publicPetInfo(pet);
  const petCard = document.createElement("article");
  petCard.className = "pet-card";
  petCard.innerHTML = `<p class="pet-kicker">PASTURE FRIEND</p><div class="card-head"><h3>${info.species}</h3><span class="sticker">NEIGHBOR</span></div><p class="pet-serial">${petSerialLabel(pet.hatch_tx)}</p><p class="subtle">${info.personality} · ${info.stage}</p><p class="small">A pasture friend. Private care stats stay with their owner.</p>`;
  inspect.append(head, petCard);
  syncOverlayClass();
  inspect.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function openInspect(pet: ViewPet) {
  if (isOwnBuddy(pet, app.owner)) {
    openBuddyOverlay();
    return;
  }
  openPublicInspect(pet);
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
  hookBuddyOverlay();
  hookActivityAreaHash();
  if (!pastureEscapeHooked) pastureEscapeHooked = true;
}

function renderPastureWorld(pets: ViewPet[]) {
  void mountOrUpdatePasture(pets);
}
