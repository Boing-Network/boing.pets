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
  next: number | null = null;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
$("#app").innerHTML =
  `<header><a class="brand" href="#">boing<span>pets</span><i>✦</i></a><nav aria-label="Main"><a href="#pasture">The pasture</a><a href="/world.html">Starter Town</a><a href="#how">How to play</a><a href="https://boing.network/testnet" target="_blank" rel="noreferrer">Boing Network ↗</a></nav><button id="connect">Connect Express</button></header><main><section class="hero"><div><p class="eyebrow">BOING TESTNET · CHAIN 6913 <span class="pill">PHASE 2 / 3D PREVIEW</span></p><h1>A little bounce.<br>A buddy for life.</h1><p class="lede">Hatch something wonderfully weird. Feed it, play, groom, and grow together.<br>Then wander Starter Town in 3D — care stations deep-link back here.</p><div class="hero-cta"><a class="button" href="#buddy">Meet your buddy ↓</a><a class="button secondary" href="/world.html">Enter Starter Town</a></div><p class="small">No trading. No dying. Just good company on-chain.</p></div><div class="hero-pets" id="hero-pets" aria-hidden="true"></div></section><div id="notice" role="status" aria-live="polite">Loading the pasture…</div><section id="buddy" class="panel"><div class="section-title"><div><p class="eyebrow">YOUR LITTLE CORNER</p><h2>Home, sweet wallet.</h2></div><button id="disconnect" class="quiet" hidden>Disconnect</button></div><div id="my-pet"></div><div class="actions"><button id="hatch">Hatch a buddy</button><button id="checkin" class="secondary" hidden>Daily hello · sign only</button><button id="play" class="secondary" hidden>Play · sign only</button><button id="groom" class="secondary" hidden>Groom · sign only</button><button id="feed" hidden>Feed · tiny transaction</button><button id="retry" class="secondary" hidden>Confirm pending transaction</button><button id="forget" class="quiet" hidden>Forget pending record</button></div><p class="small">Hatch & feed: ~0.001 BOING self-transfer + network fee. Hello, play, and groom: free signatures. Daily limits reset at midnight UTC. Care earns Boinglets and XP.</p></section><section id="pasture"><div class="section-title"><div><p class="eyebrow">A NEIGHBORHOOD OF HAPPY ACCIDENTS</p><h2>The public pasture</h2></div><button id="refresh" class="secondary">Refresh ↻</button></div><p class="subtle">Bouncy, peckish, a little scruffy — everybody belongs here.</p><div id="gallery" class="gallery"></div><div class="pages"><button id="prev" class="secondary" hidden>← Previous</button><button id="next" class="secondary" hidden>More buddies →</button></div></section><section id="how" class="how"><article><b>01 / HATCH</b><h3>One wallet. One weirdo.</h3><p>Approve a real Boing testnet transaction in Express. Your wallet and hatch transaction reveal species, colors, and a permanent personality.</p></article><article><b>02 / DAILY CARE</b><h3>Hello, play, groom, feed.</h3><p>Signatures keep joy, energy, and hygiene up. Feeding fills the belly. Each action type is once per UTC day; any care counts toward your streak.</p></article><article><b>03 / GROW</b><h3>Stages, XP, and badges.</h3><p>Buddies grow from baby toward elder with age and care. Earn Boinglets, unlock achievements, and never lose your pet — strays always come home with a feed.</p></article></section></main><footer><span>Built for a little more joy on Boing.</span><a href="https://boing.express" target="_blank" rel="noreferrer">Wallet ↗</a><a href="https://boing.network/faucet" target="_blank" rel="noreferrer">Testnet faucet ↗</a><a href="https://github.com/Boing-Network/boing.pets">Source ↗</a><span>Testnet only. No monetary value or airdrop promise.</span></footer>`;
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
  el.innerHTML = `<div class="pet-picture">${petSvg(p.traits, ["scruffy", "stray"].includes(p.state.status))}</div><div class="card-head"><h3>${p.traits.species}</h3><span class="badge">${p.owner === owner ? "YOUR BUDDY" : p.state.status.toUpperCase()}</span></div><p class="subtle">${p.traits.personality} · ${p.state.stage} · ${p.state.skills.focus}</p><p class="subtle">${p.state.streak} day streak · ${p.state.xp} XP · ${p.state.boinglets} Boinglets · ${p.state.status}</p>${meter("Belly", p.state.hunger)}${meter("Joy", p.state.happiness)}${meter("Energy", p.state.energy)}${meter("Hygiene", p.state.hygiene)}${meter("Health", p.state.health)}${badges ? `<div class="ach-row">${badges}</div>` : ""}<p class="small">${p.owner.slice(0, 10)}…${p.owner.slice(-6)}</p><a class="small" target="_blank" rel="noreferrer" href="https://boing.observer/tx/${p.hatch_tx}">Hatch transaction ↗</a>`;
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
