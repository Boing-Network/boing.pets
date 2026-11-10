import { ACHIEVEMENTS, petSvg } from "../../core";
import { api, app, $maybe, pending, type ViewPet } from "../appRuntime";
import { formatWalletLabel } from "../../wallet/session";

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
  if (app.mine) slot.append(card(app.mine));
  else
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

function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function spritePose(owner: string, index: number) {
  const h = hash32(owner + ":" + index);
  const x = 8 + ((h % 8000) / 8000) * 76;
  const y = 30 + (((h >>> 8) % 6000) / 6000) * 52;
  const scale = 0.72 + (y / 100) * 0.55;
  return { x, y, scale, zIndex: Math.round(y * 10) };
}

function paintPastureGround(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const width = Math.max(1, parent.clientWidth);
  const height = Math.max(1, parent.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#16345f");
  sky.addColorStop(0.45, "#1b4a5c");
  sky.addColorStop(1, "#1f6a4a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  // Distant hills
  ctx.fillStyle = "#1a4d3c";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.48);
  ctx.quadraticCurveTo(width * 0.25, height * 0.34, width * 0.5, height * 0.46);
  ctx.quadraticCurveTo(width * 0.75, height * 0.58, width, height * 0.42);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
  const grass = ctx.createLinearGradient(0, height * 0.5, 0, height);
  grass.addColorStop(0, "#2f7a52");
  grass.addColorStop(1, "#1d5a3c");
  ctx.fillStyle = grass;
  ctx.beginPath();
  ctx.ellipse(
    width * 0.5,
    height * 1.05,
    width * 0.75,
    height * 0.62,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  // Soft flower dots
  for (let i = 0; i < 28; i++) {
    const h = hash32("flower:" + i);
    const fx = ((h % 1000) / 1000) * width;
    const fy = height * 0.55 + (((h >>> 10) % 1000) / 1000) * height * 0.4;
    ctx.fillStyle =
      i % 3 === 0 ? "#f4d38a" : i % 3 === 1 ? "#ef9bb8" : "#c9e7ff";
    ctx.beginPath();
    ctx.arc(fx, fy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

let pastureGroundHooked = false;
function ensurePastureGround() {
  const canvas = $maybe<HTMLCanvasElement>("#pasture-ground");
  if (!canvas) return;
  paintPastureGround(canvas);
  if (pastureGroundHooked) return;
  pastureGroundHooked = true;
  const ro = new ResizeObserver(() => paintPastureGround(canvas));
  if (canvas.parentElement) ro.observe(canvas.parentElement);
  window.addEventListener("resize", () => paintPastureGround(canvas));
}

function closeInspect() {
  const inspect = $maybe("#pasture-inspect");
  if (!inspect) return;
  inspect.hidden = true;
  inspect.replaceChildren();
  for (const el of document.querySelectorAll(".pasture-sprite.is-selected"))
    el.classList.remove("is-selected");
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
  inspect.append(head, card(pet));
  inspect.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderPastureWorld(pets: ViewPet[]) {
  const root = $maybe("#pasture-canvas");
  const layer = $maybe("#pasture-sprites");
  const empty = $maybe("#pasture-empty");
  if (!root || !layer) return;
  ensurePastureGround();
  layer.replaceChildren();
  if (empty) empty.hidden = pets.length > 0;
  for (const [index, pet] of pets.entries()) {
    const pose = spritePose(pet.owner, index);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "pasture-sprite" + (pet.owner === app.owner ? " yours" : "");
    btn.style.left = pose.x + "%";
    btn.style.top = pose.y + "%";
    btn.style.zIndex = String(pose.zIndex);
    btn.style.setProperty("--sprite-scale", String(pose.scale));
    btn.dataset.owner = pet.owner;
    btn.setAttribute(
      "aria-label",
      `${pet.traits.species} · ${pet.state.status} · open pet card`,
    );
    const picture = document.createElement("div");
    picture.className = "pasture-sprite-art";
    picture.innerHTML = petSvg(
      pet.traits,
      ["scruffy", "stray"].includes(pet.state.status),
    );
    const label = document.createElement("span");
    label.className = "pasture-sprite-label";
    label.textContent = pet.traits.species;
    btn.append(picture, label);
    btn.addEventListener("click", () => {
      for (const el of layer.querySelectorAll(".pasture-sprite.is-selected"))
        el.classList.remove("is-selected");
      btn.classList.add("is-selected");
      openInspect(pet);
    });
    layer.append(btn);
  }
  if (!pastureEscapeHooked) {
    pastureEscapeHooked = true;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeInspect();
    });
  }
}
let pastureEscapeHooked = false;
