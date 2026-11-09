import { ACHIEVEMENTS, petSvg } from "../../core";
import { api, app, $maybe, pending, type ViewPet } from "../appRuntime";

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
  if (connect)
    connect.textContent = app.owner
      ? `${app.owner.slice(0, 8)}…${app.owner.slice(-4)}`
      : "Connect Express";
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
  if (!gallery) return;
  const data = await api<{ pets: ViewPet[]; next: number | null }>(
    "/api/pasture?offset=" + app.offset,
  );
  app.next = data.next;
  gallery.replaceChildren(...data.pets.map(card));
  if (!data.pets.length)
    gallery.textContent =
      "A peaceful, empty pasture. Your buddy could be the very first.";
  const prev = $maybe("#prev");
  const nextBtn = $maybe("#next");
  if (prev) prev.hidden = app.offset === 0;
  if (nextBtn) nextBtn.hidden = app.next === null;
}
