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
$("#app").innerHTML =
  `<header><a class="brand" href="#">boing<span>pets</span><i>✦</i></a><nav aria-label="Main"><a href="#pasture">The pasture</a><a href="#social">Friends</a><a href="#fishing">Fishing</a><a href="#treasure">Treasure</a><a href="#garden">Garden</a><a href="#kitchen">Kitchen</a><a href="#home">Home</a><a href="#quests">Quests</a><a href="#collections">Collections</a><a href="#market">Market</a><a href="/world.html">Starter Town</a><a href="#how">How to play</a><a href="https://boing.network/testnet" target="_blank" rel="noreferrer">Boing Network ↗</a></nav><button id="connect">Connect Express</button></header><main><section class="hero"><div><p class="eyebrow">BOING TESTNET · CHAIN 6913 <span class="pill">PHASE 6 / CONTENT PREVIEW</span></p><h1>A little bounce.<br>A buddy for life.</h1><p class="lede">Hatch, care, quest, trade cosmetics, and wander expanding zones.<br>Seasons and collections are config-driven for years of drops ahead.</p><div class="hero-cta"><a class="button" href="#buddy">Meet your buddy ↓</a><a class="button secondary" href="/world.html">Enter Starter Town</a></div><p class="small">No dying. Cosmetics-only market. Testnet only.</p></div><div class="hero-pets" id="hero-pets" aria-hidden="true"></div></section><div id="notice" role="status" aria-live="polite">Loading the pasture…</div><section id="buddy" class="panel"><div class="section-title"><div><p class="eyebrow">YOUR LITTLE CORNER</p><h2>Home, sweet wallet.</h2></div><button id="disconnect" class="quiet" hidden>Disconnect</button></div><div id="my-pet"></div><div class="actions"><button id="hatch">Hatch a buddy</button><button id="checkin" class="secondary" hidden>Daily hello · sign only</button><button id="play" class="secondary" hidden>Play · sign only</button><button id="groom" class="secondary" hidden>Groom · sign only</button><button id="feed" hidden>Feed · tiny transaction</button><button id="retry" class="secondary" hidden>Confirm pending transaction</button><button id="forget" class="quiet" hidden>Forget pending record</button></div><p class="small">Hatch & feed: ~0.001 BOING self-transfer + network fee. Hello, play, and groom: free signatures. Daily limits reset at midnight UTC. Care earns Boinglets and XP.</p></section><section id="social" class="panel"><div class="section-title"><div><p class="eyebrow">MMO-LITE SOCIAL</p><h2>Friends &amp; messages</h2></div></div><p id="social-summary" class="subtle">Connect to set a display name, add friends by wallet, and DM.</p><div class="social-form"><label>Display name <input id="display-name" maxlength="24" placeholder="PasturePal" /></label><button id="save-profile" class="secondary" hidden>Save name · sign</button></div><div class="social-form"><label>Friend wallet <input id="friend-wallet" placeholder="0x…" /></label><button id="add-friend" class="secondary" hidden>Send request · sign</button></div><div class="social-cols"><div><h3 class="market-sub">Requests</h3><div id="friend-requests"></div></div><div><h3 class="market-sub">Friends</h3><div id="friends-list"></div></div></div><div class="social-cols"><div><h3 class="market-sub">Party</h3><p id="party-summary" class="subtle">Create a party of up to 4 friends.</p><div id="party-roster"></div><button id="party-create" class="secondary" hidden>Create party · sign</button><button id="party-leave" class="quiet" hidden>Leave party · sign</button></div><div><h3 class="market-sub">Party invites</h3><div id="party-invites"></div></div></div><div id="dm-panel" hidden><h3 class="market-sub">Messages with <span id="dm-with"></span></h3><div id="dm-thread" class="dm-thread"></div><div class="social-form"><input id="dm-body" maxlength="280" placeholder="Say hello…" /><button id="dm-send" class="secondary">Send · sign</button></div></div></section><section id="fishing" class="panel"><div class="section-title"><div><p class="eyebrow">FIRST ACTIVITY LOOP</p><h2>Pond pier fishing</h2></div></div><p id="fishing-summary" class="subtle">Connect, hatch a buddy, then cast — wait for the nibble and reel in the window.</p><div class="fishing-stage" id="fishing-stage"><div class="fishing-meter" aria-hidden="true"><span id="fishing-needle"></span></div><p id="fishing-prompt" class="subtle">Ready when you are.</p><div class="actions"><button id="fish-cast" class="secondary" hidden>Cast · sign</button><button id="fish-reel" hidden disabled>Reel!</button></div></div><div id="fish-log" class="market-grid"></div><p class="small">Up to 3 successful catches per UTC day. Timing window is server-checked. Catches add fish to inventory, Boinglets to your ledger, and collection discoveries.</p></section><section id="treasure" class="panel"><div class="section-title"><div><p class="eyebrow">ACTIVITY LOOP #2</p><h2>Treasure dig</h2></div></div><p id="treasure-summary" class="subtle">Connect, hatch a buddy, then dig from a clue — up to 3 tries per UTC day.</p><p id="treasure-clue" class="subtle">No dig in progress.</p><div class="actions"><button id="treasure-start" class="secondary" hidden>Start dig · sign</button></div><div id="treasure-grid" class="treasure-grid" hidden></div><div id="treasure-log" class="market-grid"></div><p class="small">The correct tile is committed server-side and never sent to the client. Hits award loot + Boinglets + collection discoveries; misses still count toward the daily dig cap.</p></section><section id="garden" class="panel"><div class="section-title"><div><p class="eyebrow">ACTIVITY LOOP #3</p><h2>Garden beds</h2></div></div><p id="garden-summary" class="subtle">Connect, hatch a buddy, then plant → water → harvest on three slots.</p><div class="social-form"><label>Crop <select id="garden-crop"></select></label></div><div id="garden-plots" class="garden-plots"></div><p class="small">Watering shortens grow time. Harvest awards crops, Boinglets, and collection discoveries.</p></section><section id="kitchen" class="panel"><div class="section-title"><div><p class="eyebrow">ACTIVITY LOOP #4</p><h2>Pasture kitchen</h2></div></div><p id="kitchen-summary" class="subtle">Cook crops and fish into snacks, then serve them for hunger and energy boosts.</p><div id="kitchen-recipes" class="market-grid"></div><h3 class="subtle">Ready to serve</h3><div id="kitchen-dishes" class="market-grid"></div><p class="small">Daily caps apply. Cookbook discoveries unlock the first time you cook each recipe.</p></section><section id="home" class="panel"><div class="section-title"><div><p class="eyebrow">HOUSING FOUNDATION</p><h2>My little plot</h2></div><button id="home-visibility" class="secondary" hidden>Make private · sign</button></div><p id="home-summary" class="subtle">Buy Bounce Cushion or Meadow Lamp on the market, then place them on your 4×4 home grid.</p><div id="home-grid" class="home-grid" aria-label="Home plot"></div><div class="social-form"><label>Furniture to place <select id="home-furniture"><option value="">Select owned furniture…</option></select></label></div><p class="small">Empty cell + selected furniture → place (sign). Occupied cell → pick up (sign). Public plots are visible to visitors.</p></section><section id="quests" class="panel"><div class="section-title"><div><p class="eyebrow">STORIES · DAILIES · SEASONS</p><h2>Quests &amp; festivals</h2></div></div><p id="season-summary" class="subtle">Loading seasonal calendar…</p><div id="quest-list" class="market-grid"></div></section><section id="collections" class="panel"><div class="section-title"><div><p class="eyebrow">DISCOVERY LOG</p><h2>Collections</h2></div></div><p id="collections-summary" class="subtle">Unlock species, discoveries, and cosmetics as you play.</p><div id="collections-list" class="market-grid"></div></section><section id="market" class="panel"><div class="section-title"><div><p class="eyebrow">COSMETICS ONLY</p><h2>Boinglets &amp; the market</h2></div><div class="actions"><button id="claim" class="secondary" hidden>Claim care Boinglets</button><button id="claim-sparkles" class="secondary" hidden>Claim daily Sparkles</button></div></div><p id="economy-summary" class="subtle">Connect to claim care rewards into your spendable balance, then browse cosmetics.</p><div id="catalog" class="market-grid"></div><h3 class="market-sub">Player listings</h3><div id="listings" class="market-grid"></div><p class="small">5% sale fee sinks to the pasture treasury (anti-inflation). Sparkles are a testnet faucet currency for premium cosmetics — not a payment product.</p></section><section id="pasture"><div class="section-title"><div><p class="eyebrow">A NEIGHBORHOOD OF HAPPY ACCIDENTS</p><h2>The public pasture</h2></div><button id="refresh" class="secondary">Refresh ↻</button></div><p class="subtle">Bouncy, peckish, a little scruffy — everybody belongs here.</p><div id="gallery" class="gallery"></div><div class="pages"><button id="prev" class="secondary" hidden>← Previous</button><button id="next" class="secondary" hidden>More buddies →</button></div></section><section id="how" class="how"><article><b>01 / HATCH</b><h3>One wallet. One weirdo.</h3><p>Approve a real Boing testnet transaction in Express. Your wallet and hatch transaction reveal species, colors, and a permanent personality.</p></article><article><b>02 / DAILY CARE</b><h3>Hello, play, groom, feed.</h3><p>Signatures keep joy, energy, and hygiene up. Feeding fills the belly. Each action type is once per UTC day; any care counts toward your streak.</p></article><article><b>03 / GROW</b><h3>Stages, XP, and badges.</h3><p>Buddies grow from baby toward elder with age and care. Earn Boinglets, unlock achievements, and never lose your pet — strays always come home with a feed.</p></article></section></main><footer><span>Built for a little more joy on Boing.</span><a href="https://boing.express" target="_blank" rel="noreferrer">Wallet ↗</a><a href="https://boing.network/faucet" target="_blank" rel="noreferrer">Testnet faucet ↗</a><a href="https://github.com/Boing-Network/boing.pets">Source ↗</a><span>Testnet only. No monetary value or airdrop promise.</span></footer>`;
const demoOwner = "0x" + "11".repeat(32);
$("#hero-pets").innerHTML = [1, 2, 3]
  .map(
    (i) =>
      `<div>${petSvg(traits(demoOwner, "0x" + String(i).repeat(64)))}</div>`,
  )
  .join("");
function notice(text: string, error = false) {
  $("#notice").textContent = text;
  $("#notice").classList.toggle("error", error);
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
    $("#" + id).toggleAttribute("disabled", busy);
  $("#hatch").hidden = !!mine;
  $("#hatch").toggleAttribute("disabled", busy || !owner);
  $("#checkin").hidden = !mine;
  $("#play").hidden = !mine;
  $("#groom").hidden = !mine;
  $("#feed").hidden = !mine;
  $("#checkin").toggleAttribute("disabled", busy || !!mine?.state.checkedIn);
  $("#play").toggleAttribute("disabled", busy || !!mine?.state.playedToday);
  $("#groom").toggleAttribute("disabled", busy || !!mine?.state.groomedToday);
  $("#feed").toggleAttribute("disabled", busy || !!mine?.state.fedToday);
  $("#checkin").textContent = mine?.state.checkedIn
    ? "Hello sent today ✓"
    : "Daily hello · sign only";
  $("#play").textContent = mine?.state.playedToday
    ? "Played today ✓"
    : "Play · sign only";
  $("#groom").textContent = mine?.state.groomedToday
    ? "Groomed today ✓"
    : "Groom · sign only";
  $("#feed").textContent = mine?.state.fedToday
    ? "Fed today ✓"
    : "Feed · tiny transaction";
  $("#retry").hidden = !pending() || pending()?.owner !== owner;
  $("#forget").hidden = $("#retry").hidden;
  $("#disconnect").hidden = !owner;
  $("#connect").textContent = owner
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
async function refresh() {
  const data = await api<{ pets: ViewPet[]; next: number | null }>(
    "/api/pasture?offset=" + offset,
  );
  next = data.next;
  $("#gallery").replaceChildren(...data.pets.map(card));
  if (!data.pets.length)
    $("#gallery").textContent =
      "A peaceful, empty pasture. Your buddy could be the very first.";
  mine = owner
    ? (await api<{ pet: ViewPet | null }>("/api/pet?owner=" + owner)).pet
    : null;
  $("#my-pet").replaceChildren();
  if (mine) $("#my-pet").append(card(mine));
  else
    $("#my-pet").textContent = owner
      ? "Your egg is waiting. Ready to meet the tiny oddball inside?"
      : "Connect Boing Express to hatch your first buddy. You can browse the pasture without a wallet.";
  $("#prev").hidden = offset === 0;
  $("#next").hidden = next === null;
  await refreshEconomy().catch(() => {
    /* economy tables may be missing until migration 0004 */
  });
  await refreshQuests().catch(() => {
    /* content tables may be missing until migration 0005 */
  });
  await refreshCollections().catch(() => {
    /* content tables may be missing until migration 0005 */
  });
  await refreshSocial().catch(() => {
    /* social tables may be missing until migration 0006 */
  });
  await refreshFishing().catch(() => {
    /* fishing tables may be missing until migration 0008 */
  });
  await refreshHousing().catch(() => {
    /* housing tables may be missing until migration 0009 */
  });
  await refreshTreasure().catch(() => {
    /* treasure tables may be missing until migration 0011 */
  });
  await refreshGarden().catch(() => {
    /* garden tables may be missing until migration 0013 */
  });
  await refreshKitchen().catch(() => {
    /* cooking tables may be missing until migration 0014 */
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
$("#connect").onclick = () =>
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
  });
function disconnect() {
  provider?.removeListener?.("accountsChanged", disconnect);
  provider?.removeListener?.("chainChanged", disconnect);
  owner = "";
  mine = null;
  provider = null;
  controls();
  void refresh().catch(() => notice("Pasture unavailable", true));
}
$("#disconnect").onclick = disconnect;
for (const action of ["hatch", "feed", "checkin", "play", "groom"] as Action[])
  $("#" + action).onclick = () => void run(() => act(action));
$("#retry").onclick = () => void run(confirmPending);
$("#forget").onclick = () => {
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
};
$("#claim").onclick = () => void run(() => economyAct("claim"));
$("#claim-sparkles").onclick = () =>
  void run(() => economyAct("sparkles_claim"));
$("#fish-cast").onclick = () => void run(castLine);
$("#fish-reel").onclick = () => void run(reelIn);
$("#treasure-start").onclick = () => void run(startTreasureDig);
$("#home-visibility").onclick = () =>
  void run(async () => {
    const data = await api<{ plot: { visibility: string } | null }>(
      `/api/housing/plot?owner=${owner}&viewer=${owner}`,
    );
    const next =
      data.plot?.visibility === "public" ? "private" : "public";
    await housingAct("set_visibility", { visibility: next });
  });
$("#save-profile").onclick = () =>
  void run(() =>
    socialAct("set_profile", {
      display_name: ($("#display-name") as HTMLInputElement).value,
    }),
  );
$("#add-friend").onclick = () =>
  void run(() =>
    socialAct("friend_request", {
      target: ($("#friend-wallet") as HTMLInputElement).value.trim(),
    }),
  );
$("#party-create").onclick = () =>
  void run(() => socialAct("party_create"));
$("#party-leave").onclick = () =>
  void run(() => socialAct("party_leave"));
$("#dm-send").onclick = () =>
  void run(async () => {
    if (!dmTarget) throw new Error("Pick a friend to message");
    await socialAct("send_message", {
      target: dmTarget,
      body: ($("#dm-body") as HTMLInputElement).value,
    });
    ($("#dm-body") as HTMLInputElement).value = "";
  });
$("#refresh").onclick = () =>
  void run(async () => {
    await refresh();
    notice("Fresh from the pasture.");
  });
$("#next").onclick = () =>
  void run(async () => {
    offset = next ?? 0;
    await refresh();
  });
$("#prev").onclick = () =>
  void run(async () => {
    offset = Math.max(0, offset - 24);
    await refresh();
  });
controls();
void refresh()
  .then(() => notice("Testnet pasture ready. Make yourself at home."))
  .catch(() =>
    notice(
      "Pasture API unavailable. Start the local API and apply the D1 migration (see README).",
      true,
    ),
  );
