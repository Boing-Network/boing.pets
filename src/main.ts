import { createBoingWebWalletProvider } from "@boing-network/boing-sdk";
import {
  ACHIEVEMENTS,
  hex32,
  isSignatureAction,
  petSvg,
  traits,
  state,
  type AchievementCode,
  type Action,
  type Pet,
} from "./core";
import { CATALOG } from "./economy";
import "./style.css";
import { FOOTER_HTML, PAGE_BODIES } from "./ui/pageBodies";
import { PAGE_META, renderHeader, type PageId } from "./ui/nav";
import {
  applyLegacyHashRedirect,
  readPageId,
  wireNavDropdowns,
} from "./ui/navDom";
interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, handler: () => void) => void;
  removeListener?: (event: string, handler: () => void) => void;
  isBoingWeb?: boolean;
}
type ViewPet = Pet & {
  traits: ReturnType<typeof traits>;
  state: ReturnType<typeof state>;
  achievements?: Array<{
    code: AchievementCode;
    unlocked_at: number;
    title: string;
    description: string;
  }>;
  mind?: {
    mood: string;
    favoriteActivity: string;
    suggestion: string;
    cues: string[];
  };
};
interface Challenge {
  id: string;
  owner: string;
  action: Action;
  message: string;
  transaction: Record<string, unknown> | null;
}
interface Pending {
  id: string;
  owner: string;
  tx_hash: string;
}
let provider: Provider | null = null,
  owner = "",
  busy = false,
  mine: ViewPet | null = null,
  offset = 0,
  next: number | null = null,
  dmTarget = "";
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const $maybe = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);
function on(
  selector: string,
  event: "click",
  handler: (ev: MouseEvent) => void,
) {
  $maybe(selector)?.addEventListener(event, handler);
}
applyLegacyHashRedirect();
const page: PageId = readPageId();
document.title = PAGE_META[page].docTitle;
const body = PAGE_BODIES[page] || PAGE_BODIES.pasture;
$("#app").innerHTML =
  `${renderHeader(page)}<main class="page page-${page}">${body}</main>${FOOTER_HTML}`;
wireNavDropdowns();
if (page === "pasture") {
  const demoOwner = "0x" + "11".repeat(32);
  const hero = document.querySelector("#hero-pets");
  if (hero) {
    hero.innerHTML = [1, 2, 3]
      .map(
        (i) =>
          `<div>${petSvg(traits(demoOwner, "0x" + String(i).repeat(64)))}</div>`,
      )
      .join("");
  }
}
function notice(text: string, error = false) {
  const el = $maybe("#notice");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("error", error);
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || "Pasture unavailable");
  return data as T;
}
function pending(): Pending | null {
  try {
    return JSON.parse(
      localStorage.getItem("boing-pets-pending") || "null",
    ) as Pending | null;
  } catch {
    return null;
  }
}
async function economyAct(
  kind: string,
  extra: Record<string, unknown> = {},
) {
  await assertWallet();
  notice("Approve the economy signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/economy/challenge",
    { owner, kind, ...extra },
  );
  const signature = await provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, owner],
  });
  await api("/api/economy/confirm", { id: challenge.id, signature });
  await refreshEconomy();
  notice("Economy action confirmed.");
}

async function socialAct(kind: string, extra: Record<string, unknown> = {}) {
  await assertWallet();
  notice("Approve the social signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/social/challenge",
    { owner, kind, ...extra },
  );
  const signature = await provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, owner],
  });
  await api("/api/social/confirm", { id: challenge.id, signature });
  await refreshSocial();
  notice("Social action confirmed.");
}

async function openDm(friendOwner: string, label: string) {
  dmTarget = friendOwner;
  $("#dm-panel").hidden = false;
  $("#dm-with").textContent = label;
  const data = await api<{
    messages: Array<{
      from_owner: string;
      body: string;
      created_at: number;
    }>;
  }>(`/api/social/messages?owner=${owner}&with=${friendOwner}`);
  $("#dm-thread").replaceChildren(
    ...data.messages.map((m) => {
      const p = document.createElement("p");
      p.className = "dm-line";
      p.textContent = `${m.from_owner === owner ? "You" : "Friend"}: ${m.body}`;
      return p;
    }),
  );
}

async function refreshSocial() {
  const partyCreate = $("#party-create") as HTMLButtonElement;
  const partyLeave = $("#party-leave") as HTMLButtonElement;
  if (!owner) {
    $("#social-summary").textContent =
      "Connect to set a display name, add friends by wallet, and DM.";
    $("#save-profile").hidden = true;
    $("#add-friend").hidden = true;
    $("#friend-requests").textContent = "";
    $("#friends-list").textContent = "";
    $("#party-summary").textContent = "Create a party of up to 4 friends.";
    $("#party-roster").textContent = "";
    $("#party-invites").textContent = "";
    partyCreate.hidden = true;
    partyLeave.hidden = true;
    $("#dm-panel").hidden = true;
    return;
  }
  $("#save-profile").hidden = false;
  $("#add-friend").hidden = false;
  const profile = await api<{
    profile: { display_name: string } | null;
  }>("/api/social/profile?owner=" + owner);
  if (profile.profile)
    ($("#display-name") as HTMLInputElement).value =
      profile.profile.display_name;
  $("#social-summary").textContent = profile.profile
    ? `Signed in as ${profile.profile.display_name}`
    : "Pick a display name (2–24 chars), then add friends by their 0x wallet.";
  const requests = await api<{
    incoming: Array<{
      id: string;
      from_owner: string;
      from_name: string | null;
    }>;
  }>("/api/social/requests?owner=" + owner);
  if (!requests.incoming.length) {
    $("#friend-requests").textContent = "No pending requests.";
  } else {
    $("#friend-requests").replaceChildren(
      ...requests.incoming.map((r) => {
        const row = document.createElement("div");
        row.className = "social-row";
        const label = r.from_name || `${r.from_owner.slice(0, 10)}…`;
        row.innerHTML = `<span>${label}</span>`;
        const accept = document.createElement("button");
        accept.className = "secondary";
        accept.textContent = "Accept";
        accept.onclick = () =>
          void run(() =>
            socialAct("friend_accept", { request_id: r.id }),
          );
        const decline = document.createElement("button");
        decline.className = "quiet";
        decline.textContent = "Decline";
        decline.onclick = () =>
          void run(() =>
            socialAct("friend_decline", { request_id: r.id }),
          );
        row.append(accept, decline);
        return row;
      }),
    );
  }
  const friends = await api<{
    friends: Array<{ owner: string; display_name: string | null }>;
  }>("/api/social/friends?owner=" + owner);
  const party = await api<{
    party: {
      id: string;
      leader: string;
      members: Array<{
        owner: string;
        role: string;
        display_name: string | null;
      }>;
    } | null;
    maxSize: number;
  }>("/api/social/party?owner=" + owner);
  const partyInvites = await api<{
    incoming: Array<{
      id: string;
      party_id: string;
      from_owner: string;
      from_name: string | null;
    }>;
  }>("/api/social/party/invites?owner=" + owner);
  const isLeader = party.party?.leader === owner;
  const memberOwners = new Set(
    party.party?.members.map((m) => m.owner) || [],
  );
  if (!friends.friends.length) {
    $("#friends-list").textContent = "No friends yet.";
  } else {
    $("#friends-list").replaceChildren(
      ...friends.friends.map((f) => {
        const row = document.createElement("div");
        row.className = "social-row";
        const label = f.display_name || `${f.owner.slice(0, 10)}…`;
        row.innerHTML = `<span>${label}</span>`;
        const msg = document.createElement("button");
        msg.className = "secondary";
        msg.textContent = "Message";
        msg.onclick = () => void run(() => openDm(f.owner, label));
        const remove = document.createElement("button");
        remove.className = "quiet";
        remove.textContent = "Remove";
        remove.onclick = () =>
          void run(() => socialAct("friend_remove", { target: f.owner }));
        row.append(msg, remove);
        if (
          isLeader &&
          party.party &&
          party.party.members.length < party.maxSize &&
          !memberOwners.has(f.owner)
        ) {
          const invite = document.createElement("button");
          invite.className = "secondary";
          invite.textContent = "Invite";
          invite.onclick = () =>
            void run(() => socialAct("party_invite", { target: f.owner }));
          row.append(invite);
        }
        return row;
      }),
    );
  }
  if (!party.party) {
    $("#party-summary").textContent =
      "No party yet — create one (max 4), then invite friends.";
    $("#party-roster").textContent = "";
    partyCreate.hidden = false;
    partyCreate.disabled = busy;
    partyLeave.hidden = true;
  } else {
    $("#party-summary").textContent = `Party ${party.party.members.length}/${party.maxSize}${isLeader ? " · you lead" : ""}`;
    $("#party-roster").replaceChildren(
      ...party.party.members.map((m) => {
        const row = document.createElement("div");
        row.className = "social-row";
        const label = m.display_name || `${m.owner.slice(0, 10)}…`;
        row.innerHTML = `<span>${label}${m.role === "leader" ? " ★" : ""}</span>`;
        return row;
      }),
    );
    partyCreate.hidden = true;
    partyLeave.hidden = false;
    partyLeave.disabled = busy;
  }
  if (!partyInvites.incoming.length) {
    $("#party-invites").textContent = "No party invites.";
  } else {
    $("#party-invites").replaceChildren(
      ...partyInvites.incoming.map((r) => {
        const row = document.createElement("div");
        row.className = "social-row";
        const label = r.from_name || `${r.from_owner.slice(0, 10)}…`;
        row.innerHTML = `<span>${label}</span>`;
        const accept = document.createElement("button");
        accept.className = "secondary";
        accept.textContent = "Accept";
        accept.onclick = () =>
          void run(() => socialAct("party_accept", { invite_id: r.id }));
        const decline = document.createElement("button");
        decline.className = "quiet";
        decline.textContent = "Decline";
        decline.onclick = () =>
          void run(() => socialAct("party_decline", { invite_id: r.id }));
        row.append(accept, decline);
        return row;
      }),
    );
  }
  if (dmTarget) {
    const active = friends.friends.find((f) => f.owner === dmTarget);
    if (active)
      await openDm(
        dmTarget,
        active.display_name || `${dmTarget.slice(0, 10)}…`,
      );
    else {
      dmTarget = "";
      $("#dm-panel").hidden = true;
    }
  }
}

let miningTimer = 0;
let miningChallenge: {
  id: string;
  message: string;
  strike_at: number;
  window_ms: number;
  ore_name: string;
} | null = null;
function clearMiningTimer() {
  if (miningTimer) window.clearTimeout(miningTimer);
  miningTimer = 0;
}

let fishingTimer = 0;
let fishingChallenge: {
  id: string;
  message: string;
  bite_at: number;
  window_ms: number;
  fish_name: string;
} | null = null;

function clearFishingTimer() {
  if (fishingTimer) window.clearTimeout(fishingTimer);
  fishingTimer = 0;
}

async function refreshFishing() {
  const data = await api<{
    fish: Array<{
      id: string;
      name: string;
      rarity: string;
      rewardBoinglets: number;
    }>;
    remaining: number;
    catchesToday: number;
    dailyCap: number;
  }>("/api/fishing/status" + (owner ? `?owner=${owner}` : ""));
  $("#fishing-summary").textContent = owner
    ? `${data.catchesToday}/${data.dailyCap} catches today · ${data.remaining} left`
    : "Connect Express and hatch a buddy to cast at the pond pier.";
  const castBtn = $("#fish-cast") as HTMLButtonElement;
  castBtn.hidden = !owner;
  castBtn.disabled = busy || data.remaining <= 0 || !!fishingChallenge;
  castBtn.textContent =
    data.remaining <= 0 ? "Daily limit reached ✓" : "Cast · sign";
  $("#fish-log").replaceChildren(
    ...data.fish.map((f) => {
      const el = document.createElement("article");
      el.className = "market-card";
      el.innerHTML = `<h3>${f.name}</h3><p class="subtle">${f.rarity} · ${f.rewardBoinglets} Boinglets</p><p class="small">Collection: discovery:fish:${f.id}</p>`;
      return el;
    }),
  );
}

async function castLine() {
  await assertWallet();
  notice("Approve your cast in Express…");
  const challenge = await api<{
    id: string;
    message: string;
    bite_at: number;
    window_ms: number;
    fish_name: string;
  }>("/api/fishing/challenge", { owner });
  fishingChallenge = challenge;
  const reelBtn = $("#fish-reel") as HTMLButtonElement;
  const castBtn = $("#fish-cast") as HTMLButtonElement;
  reelBtn.hidden = false;
  reelBtn.disabled = true;
  castBtn.disabled = true;
  $("#fishing-prompt").textContent = "Line is out… wait for the nibble.";
  $("#fishing-needle").className = "waiting";
  const wait = Math.max(0, challenge.bite_at - Date.now());
  clearFishingTimer();
  fishingTimer = window.setTimeout(() => {
    $("#fishing-prompt").textContent =
      `Nibble! Reel ${challenge.fish_name} — ${Math.round(challenge.window_ms / 100) / 10}s window.`;
    $("#fishing-needle").className = "bite";
    reelBtn.disabled = false;
    fishingTimer = window.setTimeout(() => {
      $("#fishing-prompt").textContent = "Too slow — the fish got away. Cast again.";
      $("#fishing-needle").className = "";
      reelBtn.hidden = true;
      fishingChallenge = null;
      void refreshFishing();
    }, challenge.window_ms);
  }, wait);
  notice("Cast approved. Watch for the nibble…");
}

async function reelIn() {
  if (!fishingChallenge) throw new Error("Cast a line first");
  await assertWallet();
  clearFishingTimer();
  ($("#fish-reel") as HTMLButtonElement).disabled = true;
  notice("Signing your catch…");
  const signature = await provider!.request({
    method: "boing_signMessage",
    params: [fishingChallenge.message, owner],
  });
  const result = await api<{
    ok: boolean;
    result: string;
    message?: string;
    fish?: { name: string; rewardBoinglets: number; rarity: string };
  }>("/api/fishing/confirm", {
    id: fishingChallenge.id,
    signature,
  });
  fishingChallenge = null;
  $("#fish-reel").hidden = true;
  $("#fishing-needle").className = "";
  if (!result.ok) {
    $("#fishing-prompt").textContent =
      result.message || "Missed the window. Cast again.";
    notice(result.message || "The fish got away.", true);
  } else {
    $("#fishing-prompt").textContent = `Caught ${result.fish?.name}! +${result.fish?.rewardBoinglets} Boinglets.`;
    notice(`Caught ${result.fish?.name} (${result.fish?.rarity}).`);
  }
  await refreshEconomy().catch(() => undefined);
  await refreshFishing();
}

let treasureChallenge: {
  id: string;
  message: string;
  clue: string;
} | null = null;

async function refreshMining() {
  const data = await api<{
    ores: Array<{
      id: string;
      name: string;
      rarity: string;
      rewardBoinglets: number;
      staminaCost: number;
      minTier: number;
    }>;
    staminaLeft: number;
    staminaMax: number;
    staminaSpent: number;
    pickaxeTier: number;
  }>("/api/mining/status" + (owner ? `?owner=${owner}` : ""));
  $("#mining-summary").textContent = owner
    ? `Stamina ${data.staminaLeft}/${data.staminaMax} · pickaxe tier ${data.pickaxeTier}`
    : "Connect Express and hatch a buddy to swing at crystal veins.";
  const swingBtn = $("#mine-swing") as HTMLButtonElement;
  swingBtn.hidden = !owner;
  swingBtn.disabled = busy || data.staminaLeft <= 0 || !!miningChallenge;
  swingBtn.textContent =
    data.staminaLeft <= 0 ? "Out of stamina ✓" : "Swing · sign";
  $("#mine-log").replaceChildren(
    ...data.ores.map((o) => {
      const el = document.createElement("article");
      el.className = "market-card";
      el.innerHTML = `<h3>${o.name}</h3><p class="subtle">${o.rarity} · ${o.rewardBoinglets}ℬ · ${o.staminaCost} stamina · tier ${o.minTier}+</p>`;
      return el;
    }),
  );
}

async function swingPick() {
  await assertWallet();
  notice("Approve your swing in Express…");
  const challenge = await api<{
    id: string;
    message: string;
    strike_at: number;
    window_ms: number;
    ore_name: string;
  }>("/api/mining/challenge", { owner });
  miningChallenge = challenge;
  const strikeBtn = $("#mine-strike") as HTMLButtonElement;
  const swingBtn = $("#mine-swing") as HTMLButtonElement;
  strikeBtn.hidden = false;
  strikeBtn.disabled = true;
  swingBtn.disabled = true;
  $("#mining-prompt").textContent = "Pick raised… wait for the weak spot.";
  $("#mining-needle").className = "waiting";
  const wait = Math.max(0, challenge.strike_at - Date.now());
  clearMiningTimer();
  miningTimer = window.setTimeout(() => {
    $("#mining-prompt").textContent =
      `Weak spot! Strike ${challenge.ore_name} — ${Math.round(challenge.window_ms / 100) / 10}s window.`;
    $("#mining-needle").className = "bite";
    strikeBtn.disabled = false;
    miningTimer = window.setTimeout(() => {
      $("#mining-prompt").textContent =
        "Too slow — the vein sealed. Swing again.";
      $("#mining-needle").className = "";
      strikeBtn.hidden = true;
      miningChallenge = null;
      void refreshMining();
    }, challenge.window_ms);
  }, wait);
  notice("Swing approved. Watch for the weak spot…");
}

async function strikeVein() {
  if (!miningChallenge) throw new Error("Swing first");
  await assertWallet();
  clearMiningTimer();
  ($("#mine-strike") as HTMLButtonElement).disabled = true;
  notice("Signing your strike…");
  const signature = await provider!.request({
    method: "boing_signMessage",
    params: [miningChallenge.message, owner],
  });
  const result = await api<{
    ok: boolean;
    result: string;
    message?: string;
    ore?: { name: string; rewardBoinglets: number; rarity: string };
  }>("/api/mining/confirm", {
    id: miningChallenge.id,
    signature,
  });
  miningChallenge = null;
  $("#mine-strike").hidden = true;
  $("#mining-needle").className = "";
  if (!result.ok) {
    $("#mining-prompt").textContent =
      result.message || "Missed the window. Swing again.";
    notice(result.message || "The vein sealed.", true);
  } else {
    $("#mining-prompt").textContent = `Mined ${result.ore?.name}! +${result.ore?.rewardBoinglets} Boinglets.`;
    notice(`Mined ${result.ore?.name} (${result.ore?.rarity}).`);
  }
  await refreshEconomy().catch(() => undefined);
  await refreshMining();
}

async function refreshTreasure() {
  const data = await api<{
    treasures: Array<{
      id: string;
      name: string;
      rarity: string;
      rewardBoinglets: number;
    }>;
    remaining: number;
    digsToday: number;
    dailyCap: number;
    grid: number;
  }>("/api/treasure/status" + (owner ? `?owner=${owner}` : ""));
  $("#treasure-summary").textContent = owner
    ? `${data.digsToday}/${data.dailyCap} digs today · ${data.remaining} left`
    : "Connect Express and hatch a buddy to dig for pasture treasure.";
  const startBtn = $("#treasure-start") as HTMLButtonElement;
  startBtn.hidden = !owner;
  startBtn.disabled = busy || data.remaining <= 0 || !!treasureChallenge;
  startBtn.textContent =
    data.remaining <= 0 ? "Daily digs done ✓" : "Start dig · sign";
  if (!treasureChallenge) {
    $("#treasure-clue").textContent = "No dig in progress.";
    $("#treasure-grid").hidden = true;
    $("#treasure-grid").replaceChildren();
  }
  $("#treasure-log").replaceChildren(
    ...data.treasures.map((t) => {
      const el = document.createElement("article");
      el.className = "market-card";
      el.innerHTML = `<h3>${t.name}</h3><p class="subtle">${t.rarity} · ${t.rewardBoinglets} Boinglets</p><p class="small">Collection: discovery:treasure:${t.id}</p>`;
      return el;
    }),
  );
}

async function startTreasureDig() {
  await assertWallet();
  notice("Approve your dig in Express…");
  const challenge = await api<{
    id: string;
    message: string;
    clue: string;
    grid: number;
  }>("/api/treasure/challenge", { owner });
  treasureChallenge = challenge;
  $("#treasure-clue").textContent = `Clue: ${challenge.clue}`;
  const grid = $("#treasure-grid");
  grid.hidden = false;
  grid.replaceChildren();
  for (let i = 0; i < challenge.grid; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "treasure-cell";
    cell.textContent = String(i + 1);
    cell.onclick = () => void run(() => digTreasureTile(i));
    grid.append(cell);
  }
  ($("#treasure-start") as HTMLButtonElement).disabled = true;
  notice("Dig approved. Pick a tile that matches the clue.");
}

async function digTreasureTile(guess: number) {
  if (!treasureChallenge) throw new Error("Start a dig first");
  await assertWallet();
  notice("Signing your dig…");
  const signature = await provider!.request({
    method: "boing_signMessage",
    params: [treasureChallenge.message, owner],
  });
  const result = await api<{
    ok: boolean;
    result: string;
    spot?: number;
    message?: string;
    treasure?: { name: string; rewardBoinglets: number; rarity: string };
  }>("/api/treasure/confirm", {
    id: treasureChallenge.id,
    signature,
    guess,
  });
  treasureChallenge = null;
  $("#treasure-grid").hidden = true;
  if (!result.ok) {
    $("#treasure-clue").textContent =
      result.message ||
      `Miss — treasure was tile ${(result.spot ?? 0) + 1}. Dig again.`;
    notice(result.message || "Empty dirt.", true);
  } else {
    $("#treasure-clue").textContent = `Found ${result.treasure?.name}! +${result.treasure?.rewardBoinglets} Boinglets.`;
    notice(`Found ${result.treasure?.name} (${result.treasure?.rarity}).`);
  }
  await refreshEconomy().catch(() => undefined);
  await refreshTreasure();
}

async function gardenAct(kind: string, extra: Record<string, unknown> = {}) {
  await assertWallet();
  notice("Approve the garden signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/garden/challenge",
    { owner, kind, ...extra },
  );
  const signature = await provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, owner],
  });
  await api("/api/garden/confirm", { id: challenge.id, signature });
  await refreshGarden();
  await refreshEconomy().catch(() => undefined);
  notice("Garden updated.");
}

async function refreshGarden() {
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
  }>("/api/garden/status" + (owner ? `?owner=${owner}` : ""));
  const select = $("#garden-crop") as HTMLSelectElement;
  select.replaceChildren(
    ...data.crops.map(
      (c) => new Option(`${c.name} · ${c.rewardBoinglets}ℬ`, c.id),
    ),
  );
  $("#garden-summary").textContent = owner
    ? `${data.plots.length}/${data.slots} plots planted`
    : "Connect Express and hatch a buddy to tend three garden beds.";
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
      plant.hidden = !owner;
      plant.disabled = busy;
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
        water.disabled = busy || !owner;
        water.onclick = () =>
          void run(() => gardenAct("water", { slot }));
        card.append(water);
      }
      if (plot.ready) {
        const harvest = document.createElement("button");
        harvest.className = "secondary";
        harvest.textContent = "Harvest · sign";
        harvest.disabled = busy || !owner;
        harvest.onclick = () =>
          void run(() => gardenAct("harvest", { slot }));
        card.append(harvest);
      }
    }
    cells.push(card);
  }
  $("#garden-plots").replaceChildren(...cells);
}

async function kitchenAct(kind: string, extra: Record<string, unknown> = {}) {
  await assertWallet();
  notice("Approve the kitchen signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/cook/challenge",
    { owner, kind, ...extra },
  );
  const signature = await provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, owner],
  });
  await api("/api/cook/confirm", { id: challenge.id, signature });
  await refreshKitchen();
  await refreshEconomy().catch(() => undefined);
  notice(kind === "serve" ? "Snack served — vitals boosted." : "Dish cooked.");
}

async function refreshKitchen() {
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
  }>("/api/cook/status" + (owner ? `?owner=${owner}` : ""));
  $("#kitchen-summary").textContent = owner
    ? `Cooked ${data.cookedToday}/${data.cookCap} · served ${data.servedToday}/${data.serveCap} today`
    : "Connect Express, gather crops or fish, then cook and serve snacks.";
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
      btn.hidden = !owner;
      btn.disabled =
        busy || !can || data.cookedToday >= data.cookCap;
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
          busy || !owner || data.servedToday >= data.serveCap;
        btn.onclick = () =>
          void run(() => kitchenAct("serve", { food_id: foodId }));
        el.append(btn);
        return el;
      }),
    );
  }
}

async function housingAct(kind: string, extra: Record<string, unknown> = {}) {
  await assertWallet();
  notice("Approve the housing signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/housing/challenge",
    { owner, kind, ...extra },
  );
  const signature = await provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, owner],
  });
  await api("/api/housing/confirm", { id: challenge.id, signature });
  await refreshHousing();
  await refreshEconomy().catch(() => undefined);
  notice("Home updated.");
}

async function refreshHousing() {
  const data = await api<{
    grid: number;
    plot: { visibility: string } | null;
    private?: boolean;
    placements: Array<{ id: string; item_id: string; x: number; y: number }>;
    furniture: Array<{ item_id: string; qty: number; name: string }>;
  }>(
    "/api/housing/plot" +
      (owner
        ? `?owner=${owner}&viewer=${owner}`
        : ""),
  );
  const visBtn = $("#home-visibility") as HTMLButtonElement;
  if (!owner || !data.plot) {
    $("#home-summary").textContent = owner
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
  visBtn.disabled = busy;
  visBtn.textContent =
    data.plot.visibility === "public"
      ? "Make private · sign"
      : "Make public · sign";
  const select = $("#home-furniture") as HTMLSelectElement;
  select.replaceChildren(new Option("Select owned furniture…", ""));
  for (const stack of data.furniture) {
    select.append(
      new Option(`${stack.name} ×${stack.qty}`, stack.item_id),
    );
  }
  const byCell = new Map(
    data.placements.map((p) => [`${p.x},${p.y}`, p]),
  );
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
      cell.disabled = busy;
      if (placed) {
        cell.onclick = () =>
          void run(() =>
            housingAct("pickup", { placement_id: placed.id }),
          );
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

async function claimQuest(questId: string) {
  await assertWallet();
  notice("Approve quest reward claim in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/content/quest/challenge",
    { owner, quest_id: questId },
  );
  const signature = await provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, owner],
  });
  await api("/api/content/quest/confirm", { id: challenge.id, signature });
  await refreshEconomy();
  await refreshQuests();
  notice("Quest reward claimed!");
}

async function refreshCollections() {
  const data = await api<{
    defs: Array<{
      id: string;
      title: string;
      description: string;
      category: string;
    }>;
    unlocked: Array<{ entry_id: string; unlocked_at: number }>;
  }>("/api/content/collections" + (owner ? `?owner=${owner}` : ""));
  const unlocked = new Set(data.unlocked.map((u) => u.entry_id));
  const total = data.defs.length;
  const found = data.defs.filter((d) => unlocked.has(d.id)).length;
  $("#collections-summary").textContent = owner
    ? `${found}/${total} unlocked · species, discoveries, and cosmetics`
    : `Browse ${total} collection entries — connect to track unlocks.`;
  const order = ["species", "discovery", "cosmetic"];
  const sorted = [...data.defs].sort((a, b) => {
    const ca = order.indexOf(a.category);
    const cb = order.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.title.localeCompare(b.title);
  });
  $("#collections-list").replaceChildren(
    ...sorted.map((def) => {
      const el = document.createElement("article");
      const got = unlocked.has(def.id);
      el.className = "market-card" + (got ? " collection-unlocked" : "");
      el.innerHTML = `<h3>${def.title}${got ? " ✓" : ""}</h3><p class="subtle">${def.category}</p><p class="small">${def.description}</p>`;
      return el;
    }),
  );
}

async function refreshQuests() {
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
  }>("/api/content/quests" + (owner ? `?owner=${owner}` : ""));
  $("#season-summary").textContent = data.activeEvents.length
    ? `Live now: ${data.activeEvents.map((e) => e.name).join(", ")}`
    : "No seasonal event active — check back for festivals.";
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
      } else if (q.complete && owner) {
        btn.textContent = "Claim · sign";
        btn.disabled = busy;
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

async function refreshEconomy() {
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
      price_boinglets: number;
    }>;
  }>("/api/marketplace");
  let summary =
    "Connect to claim care rewards and daily testnet Sparkles, then browse cosmetics.";
  const claimBtn = $("#claim") as HTMLButtonElement;
  const sparklesBtn = $("#claim-sparkles") as HTMLButtonElement;
  if (owner) {
    const bal = await api<{
      balances: { boinglets: number; sparkles: number };
      care: { earned: number; claimed: number; claimable: number };
      sparklesFaucet: { daily: number; claimable: number };
      inventory: Array<{ item_id: string; qty: number }>;
    }>("/api/economy/balance?owner=" + owner);
    summary = `${bal.balances.boinglets} Boinglets · ${bal.balances.sparkles} Sparkles · ${bal.care.claimable} care claimable · ${bal.inventory.length} inventory stacks`;
    claimBtn.hidden = false;
    claimBtn.disabled = busy || bal.care.claimable <= 0;
    claimBtn.textContent =
      bal.care.claimable > 0
        ? `Claim ${bal.care.claimable} Boinglets`
        : "Care rewards claimed ✓";
    sparklesBtn.hidden = false;
    sparklesBtn.disabled = busy || bal.sparklesFaucet.claimable <= 0;
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
      el.innerHTML = `<h3>${item.name}</h3><p class="subtle">${item.kind} · ${priceLabel}</p><p class="small">${item.description}</p>`;
      const btn = document.createElement("button");
      btn.className = "secondary";
      btn.textContent = "Buy · sign";
      btn.disabled = busy || !owner;
      btn.onclick = () =>
        void run(() => economyAct("buy_catalog", { item_id: item.id }));
      el.append(btn);
      return el;
    }),
  );
  if (!market.listings.length) {
    $("#listings").textContent =
      "No player listings yet. Buy from the catalog, then list from a future inventory panel.";
  } else {
    $("#listings").replaceChildren(
      ...market.listings.map((listing) => {
        const item = CATALOG.find((c) => c.id === listing.item_id);
        const el = document.createElement("article");
        el.className = "market-card";
        el.innerHTML = `<h3>${item?.name || listing.item_id}</h3><p class="subtle">${listing.qty}× · ${listing.price_boinglets} Boinglets</p><p class="small">${listing.seller.slice(0, 10)}…</p>`;
        const btn = document.createElement("button");
        btn.className = "secondary";
        btn.textContent = "Buy listing · sign";
        btn.disabled = busy || !owner || listing.seller === owner;
        btn.onclick = () =>
          void run(() =>
            economyAct("buy_listing", { listing_id: listing.id }),
          );
        el.append(btn);
        return el;
      }),
    );
  }
}

function controls() {
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
    $maybe("#" + id)?.toggleAttribute("disabled", busy);
  const hatch = $maybe("#hatch");
  if (hatch) {
    hatch.hidden = !!mine;
    hatch.toggleAttribute("disabled", busy || !owner);
  }
  const checkin = $maybe("#checkin");
  const play = $maybe("#play");
  const groom = $maybe("#groom");
  const feed = $maybe("#feed");
  if (checkin) {
    checkin.hidden = !mine;
    checkin.toggleAttribute("disabled", busy || !!mine?.state.checkedIn);
    checkin.textContent = mine?.state.checkedIn
      ? "Hello sent today ✓"
      : "Daily hello · sign only";
  }
  if (play) {
    play.hidden = !mine;
    play.toggleAttribute("disabled", busy || !!mine?.state.playedToday);
    play.textContent = mine?.state.playedToday
      ? "Played today ✓"
      : "Play · sign only";
  }
  if (groom) {
    groom.hidden = !mine;
    groom.toggleAttribute("disabled", busy || !!mine?.state.groomedToday);
    groom.textContent = mine?.state.groomedToday
      ? "Groomed today ✓"
      : "Groom · sign only";
  }
  if (feed) {
    feed.hidden = !mine;
    feed.toggleAttribute("disabled", busy || !!mine?.state.fedToday);
    feed.textContent = mine?.state.fedToday
      ? "Fed today ✓"
      : "Feed · tiny transaction";
  }
  const retry = $maybe("#retry");
  const forget = $maybe("#forget");
  if (retry) retry.hidden = !pending() || pending()?.owner !== owner;
  if (forget) forget.hidden = !!retry?.hidden;
  const disconnectBtn = $maybe("#disconnect");
  if (disconnectBtn) disconnectBtn.hidden = !owner;
  const connect = $maybe("#connect");
  if (connect)
    connect.textContent = owner
      ? `${owner.slice(0, 8)}…${owner.slice(-4)}`
      : "Connect Express";
}
function meter(label: string, value: number) {
  return `<label>${label} <meter min="0" max="100" value="${value}"></meter> ${value}%</label>`;
}
function card(p: ViewPet) {
  const el = document.createElement("article");
  el.className = "pet-card" + (p.owner === owner ? " yours" : "");
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
  el.innerHTML = `<div class="pet-picture">${petSvg(p.traits, ["scruffy", "stray"].includes(p.state.status))}</div><div class="card-head"><h3>${p.traits.species}</h3><span class="badge">${p.owner === owner ? "YOUR BUDDY" : p.state.status.toUpperCase()}</span></div><p class="subtle">${p.traits.personality} · ${p.state.stage} · ${p.state.skills.focus}</p><p class="subtle">${p.state.streak} day streak · ${p.state.xp} XP · ${p.state.boinglets} Boinglets · ${p.state.status}</p>${mind}${meter("Belly", p.state.hunger)}${meter("Joy", p.state.happiness)}${meter("Energy", p.state.energy)}${meter("Hygiene", p.state.hygiene)}${meter("Health", p.state.health)}${badges ? `<div class="ach-row">${badges}</div>` : ""}<p class="small">${p.owner.slice(0, 10)}…${p.owner.slice(-6)}</p><a class="small" target="_blank" rel="noreferrer" href="https://boing.observer/tx/${p.hatch_tx}">Hatch transaction ↗</a>`;
  return el;
}
async function refreshBuddyCard() {
  mine = owner
    ? (await api<{ pet: ViewPet | null }>("/api/pet?owner=" + owner)).pet
    : null;
  const slot = $maybe("#my-pet");
  if (!slot) return;
  slot.replaceChildren();
  if (mine) slot.append(card(mine));
  else
    slot.textContent = owner
      ? "Your egg is waiting. Ready to meet the tiny oddball inside?"
      : "Connect Boing Express to hatch your first buddy. You can browse the pasture without a wallet.";
}

async function refreshPastureGallery() {
  const gallery = $maybe("#gallery");
  if (!gallery) return;
  const data = await api<{ pets: ViewPet[]; next: number | null }>(
    "/api/pasture?offset=" + offset,
  );
  next = data.next;
  gallery.replaceChildren(...data.pets.map(card));
  if (!data.pets.length)
    gallery.textContent =
      "A peaceful, empty pasture. Your buddy could be the very first.";
  const prev = $maybe("#prev");
  const nextBtn = $maybe("#next");
  if (prev) prev.hidden = offset === 0;
  if (nextBtn) nextBtn.hidden = next === null;
}

async function refresh() {
  if (page === "pasture") {
    await refreshBuddyCard();
    await refreshPastureGallery();
  } else if (owner || page === "friends") {
    // Keep buddy vitals fresh when serving snacks / care-adjacent pages.
    if (["kitchen", "home", "market", "quests"].includes(page) && owner)
      mine = (
        await api<{ pet: ViewPet | null }>("/api/pet?owner=" + owner)
      ).pet;
  }
  if (page === "market")
    await refreshEconomy().catch(() => {
      /* economy tables may be missing until migration 0004 */
    });
  if (page === "quests")
    await refreshQuests().catch(() => {
      /* content tables may be missing until migration 0005 */
    });
  if (page === "collections")
    await refreshCollections().catch(() => {
      /* content tables may be missing until migration 0005 */
    });
  if (page === "friends")
    await refreshSocial().catch(() => {
      /* social tables may be missing until migration 0006 */
    });
  if (page === "fishing")
    await refreshFishing().catch(() => {
      /* fishing tables may be missing until migration 0008 */
    });
  if (page === "home")
    await refreshHousing().catch(() => {
      /* housing tables may be missing until migration 0009 */
    });
  if (page === "treasure")
    await refreshTreasure().catch(() => {
      /* treasure tables may be missing until migration 0011 */
    });
  if (page === "garden")
    await refreshGarden().catch(() => {
      /* garden tables may be missing until migration 0013 */
    });
  if (page === "kitchen")
    await refreshKitchen().catch(() => {
      /* cooking tables may be missing until migration 0014 */
    });
  if (page === "mining")
    await refreshMining().catch(() => {
      /* mining tables may be missing until migration 0015 */
    });
  controls();
}
async function run(task: () => Promise<void>) {
  if (busy) return;
  busy = true;
  controls();
  try {
    await task();
  } catch (e) {
    notice(
      e instanceof Error ? e.message : "Something went wrong. Please retry.",
      true,
    );
  } finally {
    busy = false;
    controls();
  }
}
async function assertWallet() {
  if (!provider || !owner) throw new Error("Connect Boing Express first");
  if (!provider.isBoingWeb) {
    const chain = await provider.request({
      method: "boing_chainId",
      params: [],
    });
    if (Number(chain) !== 6913)
      throw new Error("Switch Express to Boing testnet 6913 before continuing");
    const accounts = (await provider.request({
      method: "boing_accounts",
      params: [],
    })) as string[];
    if (!accounts?.[0] || hex32(accounts[0]) !== owner)
      throw new Error("Wallet account changed. Disconnect and reconnect.");
  }
}
async function confirmPending() {
  const p = pending();
  if (!p || p.owner !== owner)
    throw new Error("No pending transaction for this wallet");
  notice("Checking transaction inclusion…");
  await api("/api/confirm", { id: p.id, tx_hash: p.tx_hash });
  localStorage.removeItem("boing-pets-pending");
  await refresh();
  notice("Confirmed. Your buddy felt that little bounce!");
}
async function act(action: Action) {
  await assertWallet();
  if (pending()?.owner === owner)
    throw new Error(
      "Confirm your pending transaction first; do not pay twice.",
    );
  const c = await api<Challenge>("/api/challenge", { owner, action });
  if (isSignatureAction(action)) {
    const labels: Record<string, string> = {
      checkin: "daily hello",
      play: "play session",
      groom: "grooming",
    };
    notice(
      `Approve your ${labels[action] || action} in Express. This is a signature, not a transaction.`,
    );
    const signature = await provider!.request({
      method: "boing_signMessage",
      params: [c.message, owner],
    });
    await api("/api/confirm", { id: c.id, signature });
    await refresh();
    notice(
      action === "checkin"
        ? "Hello sent. A little love goes a long way."
        : action === "play"
          ? "Playtime logged. Energy up!"
          : "All fresh. Hygiene restored.",
    );
    return;
  }
  notice(
    "Approve the tiny self-transfer in Express. Only the network fee leaves your wallet.",
  );
  const result = (await provider!.request({
    method: "boing_sendTransaction",
    params: [c.transaction],
  })) as { tx_id?: string; tx_hash?: string } | string;
  const hash = hex32(
    typeof result === "string" ? result : result.tx_id || result.tx_hash,
  );
  localStorage.setItem(
    "boing-pets-pending",
    JSON.stringify({ id: c.id, owner: c.owner, tx_hash: hash }),
  );
  notice(
    "Transaction submitted. Confirming inclusion… If it is still pending, use Confirm pending transaction.",
  );
  await confirmPending();
}
function disconnect() {
  provider?.removeListener?.("accountsChanged", disconnect);
  provider?.removeListener?.("chainChanged", disconnect);
  owner = "";
  mine = null;
  provider = null;
  controls();
  void refresh().catch(() => notice("Pasture unavailable", true));
}
on("#connect", "click", () =>
  void run(async () => {
    if (owner) {
      notice("Already connected. Use Disconnect to change wallets.");
      return;
    }
    const injected = (window as Window & { boing?: Provider }).boing;
    provider =
      injected ||
      (createBoingWebWalletProvider({
        chainId: "0x1b01",
        mode: "popup",
      }) as Provider);
    const accounts = (await provider.request({
      method: "boing_requestAccounts",
      params: [],
    })) as string[];
    owner = hex32(accounts?.[0]);
    try {
      await assertWallet();
    } catch (e) {
      owner = "";
      provider = null;
      throw e;
    }
    provider.on?.("accountsChanged", disconnect);
    provider.on?.("chainChanged", disconnect);
    await refresh();
    notice("Connected on Boing testnet. Your pasture awaits.");
  }),
);
on("#disconnect", "click", () => disconnect());
for (const action of ["hatch", "feed", "checkin", "play", "groom"] as Action[])
  on("#" + action, "click", () => void run(() => act(action)));
on("#retry", "click", () => void run(confirmPending));
on("#forget", "click", () => {
  if (busy) return;
  if (
    window.confirm(
      "This only forgets the local record; it does NOT cancel a submitted transaction or refund fees. If still pending, try confirming first. Forget it?",
    )
  ) {
    localStorage.removeItem("boing-pets-pending");
    controls();
    notice(
      "Local pending record forgotten. This does not cancel the chain transaction.",
    );
  }
});
on("#claim", "click", () => void run(() => economyAct("claim")));
on("#claim-sparkles", "click", () =>
  void run(() => economyAct("sparkles_claim")),
);
on("#fish-cast", "click", () => void run(castLine));
on("#mine-swing", "click", () => void run(swingPick));
on("#mine-strike", "click", () => void run(strikeVein));
on("#fish-reel", "click", () => void run(reelIn));
on("#treasure-start", "click", () => void run(startTreasureDig));
on("#home-visibility", "click", () =>
  void run(async () => {
    const data = await api<{ plot: { visibility: string } | null }>(
      `/api/housing/plot?owner=${owner}&viewer=${owner}`,
    );
    const nextVis =
      data.plot?.visibility === "public" ? "private" : "public";
    await housingAct("set_visibility", { visibility: nextVis });
  }),
);
on("#save-profile", "click", () =>
  void run(() =>
    socialAct("set_profile", {
      display_name: ($("#display-name") as HTMLInputElement).value,
    }),
  ),
);
on("#add-friend", "click", () =>
  void run(() =>
    socialAct("friend_request", {
      target: ($("#friend-wallet") as HTMLInputElement).value.trim(),
    }),
  ),
);
on("#party-create", "click", () =>
  void run(() => socialAct("party_create")),
);
on("#party-leave", "click", () => void run(() => socialAct("party_leave")));
on("#dm-send", "click", () =>
  void run(async () => {
    if (!dmTarget) throw new Error("Pick a friend to message");
    await socialAct("send_message", {
      target: dmTarget,
      body: ($("#dm-body") as HTMLInputElement).value,
    });
    ($("#dm-body") as HTMLInputElement).value = "";
  }),
);
on("#refresh", "click", () =>
  void run(async () => {
    await refresh();
    notice("Fresh from the pasture.");
  }),
);
on("#next", "click", () =>
  void run(async () => {
    offset = next ?? 0;
    await refresh();
  }),
);
on("#prev", "click", () =>
  void run(async () => {
    offset = Math.max(0, offset - 24);
    await refresh();
  }),
);
controls();
void refresh()
  .then(() =>
    notice(
      page === "pasture"
        ? "Testnet pasture ready. Make yourself at home."
        : `${PAGE_META[page].title} ready.`,
    ),
  )
  .catch(() =>
    notice(
      "Pasture API unavailable. Start the local API and apply the D1 migration (see README).",
      true,
    ),
  );
