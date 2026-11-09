import { api, app, $, notice } from "../appRuntime";
import { assertWallet, run } from "../careActions";
import { refreshEconomy } from "./progressPage";

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

let miningTimer = 0;
let miningChallenge: {
  id: string;
  message: string;
  strike_at: number;
  window_ms: number;
} | null = null;
export function clearMiningTimer() {
  if (miningTimer) window.clearTimeout(miningTimer);
  miningTimer = 0;
}

let racingTimer = 0;
let racingChallenge: {
  id: string;
  message: string;
  go_at: number;
  window_ms: number;
} | null = null;
export function clearRacingTimer() {
  if (racingTimer) window.clearTimeout(racingTimer);
  racingTimer = 0;
}

export async function refreshRacing() {
  const data = await api<{
    tracks: Array<{ id: string; name: string; blurb: string }>;
    remaining: number;
    heatsToday: number;
    dailyCap: number;
  }>("/api/racing/status" + (app.owner ? `?owner=${app.owner}` : ""));
  $("#racing-summary").textContent = app.owner
    ? `${data.heatsToday}/${data.dailyCap} heats today · ${data.remaining} left`
    : "Connect Express and hatch a buddy to line up at the race track.";
  const startBtn = $("#race-start") as HTMLButtonElement;
  startBtn.hidden = !app.owner;
  startBtn.disabled = app.busy || data.remaining <= 0 || !!racingChallenge;
  startBtn.textContent =
    data.remaining <= 0 ? "Daily limit reached ✓" : "Line up · sign";
  $("#race-log").replaceChildren(
    ...data.tracks.map((t) => {
      const el = document.createElement("article");
      el.className = "market-card";
      el.innerHTML = `<h3>${t.name}</h3><p class="subtle">${t.blurb}</p>`;
      return el;
    }),
  );
}

export async function startRace() {
  await assertWallet();
  notice("Approve your lineup in Express…");
  const challenge = await api<{
    id: string;
    message: string;
    go_at: number;
    window_ms: number;
  }>("/api/racing/challenge", { owner: app.owner });
  racingChallenge = challenge;
  const finishBtn = $("#race-finish") as HTMLButtonElement;
  const startBtn = $("#race-start") as HTMLButtonElement;
  finishBtn.hidden = false;
  finishBtn.disabled = true;
  startBtn.disabled = true;
  $("#racing-prompt").textContent = `On your marks…`;
  $("#racing-needle").className = "waiting";
  const wait = Math.max(0, challenge.go_at - Date.now());
  clearRacingTimer();
  racingTimer = window.setTimeout(() => {
    $("#racing-prompt").textContent =
      `Go! Finish now — ${Math.round(challenge.window_ms / 100) / 10}s window.`;
    $("#racing-needle").className = "bite";
    finishBtn.disabled = false;
    racingTimer = window.setTimeout(() => {
      $("#racing-prompt").textContent =
        "Too slow — you missed the finish. Line up again.";
      $("#racing-needle").className = "";
      finishBtn.hidden = true;
      racingChallenge = null;
      void refreshRacing();
    }, challenge.window_ms);
  }, wait);
  notice("Lined up. Watch for the starting flash…");
}

export async function finishRace() {
  if (!racingChallenge) throw new Error("Line up first");
  await assertWallet();
  clearRacingTimer();
  ($("#race-finish") as HTMLButtonElement).disabled = true;
  notice("Signing your finish…");
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [racingChallenge.message, app.owner],
  });
  const result = await api<{
    ok: boolean;
    result: string;
    message?: string;
    place?: number;
    ribbon?: { name: string; rewardBoinglets: number };
    track?: { name: string };
    party_bonus?: {
      percent: number;
      amount: number;
      together: boolean;
      partySize: number;
    } | null;
    variety_awarded?: number;
  }>("/api/racing/confirm", {
    id: racingChallenge.id,
    signature,
  });
  racingChallenge = null;
  $("#race-finish").hidden = true;
  $("#racing-needle").className = "";
  if (!result.ok) {
    $("#racing-prompt").textContent =
      result.message || "Missed the window. Line up again.";
    notice(result.message || "Missed the finish.", true);
  } else {
    $("#racing-prompt").textContent =
      `${result.track?.name}: ${result.place}${result.place === 1 ? "st" : result.place === 2 ? "nd" : "rd"} · ${result.ribbon?.name} (+${result.ribbon?.rewardBoinglets}ℬ)`;
    notice(
      `Placed ${result.place} — ${result.ribbon?.name}.${rewardExtrasNotice(result.party_bonus, result.variety_awarded)}`,
    );
  }
  await refreshEconomy().catch(() => undefined);
  await refreshRacing();
}

let fishingTimer = 0;
let fishingChallenge: {
  id: string;
  message: string;
  bite_at: number;
  window_ms: number;
} | null = null;

export function clearFishingTimer() {
  if (fishingTimer) window.clearTimeout(fishingTimer);
  fishingTimer = 0;
}

export async function refreshFishing() {
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
  }>("/api/fishing/status" + (app.owner ? `?owner=${app.owner}` : ""));
  $("#fishing-summary").textContent = app.owner
    ? `${data.catchesToday}/${data.dailyCap} catches today · ${data.remaining} left`
    : "Connect Express and hatch a buddy to cast at the pond pier.";
  const castBtn = $("#fish-cast") as HTMLButtonElement;
  castBtn.hidden = !app.owner;
  castBtn.disabled = app.busy || data.remaining <= 0 || !!fishingChallenge;
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

export async function castLine() {
  await assertWallet();
  notice("Approve your cast in Express…");
  const challenge = await api<{
    id: string;
    message: string;
    bite_at: number;
    window_ms: number;
  }>("/api/fishing/challenge", { owner: app.owner });
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
      `Nibble! Reel now — ${Math.round(challenge.window_ms / 100) / 10}s window.`;
    $("#fishing-needle").className = "bite";
    reelBtn.disabled = false;
    fishingTimer = window.setTimeout(() => {
      $("#fishing-prompt").textContent =
        "Too slow — the fish got away. Cast again.";
      $("#fishing-needle").className = "";
      reelBtn.hidden = true;
      fishingChallenge = null;
      void refreshFishing();
    }, challenge.window_ms);
  }, wait);
  notice("Cast approved. Watch for the nibble…");
}

export async function reelIn() {
  if (!fishingChallenge) throw new Error("Cast a line first");
  await assertWallet();
  clearFishingTimer();
  ($("#fish-reel") as HTMLButtonElement).disabled = true;
  notice("Signing your catch…");
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [fishingChallenge.message, app.owner],
  });
  const result = await api<{
    ok: boolean;
    result: string;
    message?: string;
    fish?: { name: string; rewardBoinglets: number; rarity: string };
    party_bonus?: {
      percent: number;
      amount: number;
      together: boolean;
      partySize: number;
    } | null;
    variety_awarded?: number;
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
    $("#fishing-prompt").textContent =
      `Caught ${result.fish?.name}! +${result.fish?.rewardBoinglets} Boinglets.`;
    notice(
      `Caught ${result.fish?.name} (${result.fish?.rarity}).${rewardExtrasNotice(result.party_bonus, result.variety_awarded)}`,
    );
  }
  await refreshEconomy().catch(() => undefined);
  await refreshFishing();
}

let treasureChallenge: {
  id: string;
  message: string;
  clue: string;
} | null = null;

export async function refreshMining() {
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
  }>("/api/mining/status" + (app.owner ? `?owner=${app.owner}` : ""));
  $("#mining-summary").textContent = app.owner
    ? `Stamina ${data.staminaLeft}/${data.staminaMax} · pickaxe tier ${data.pickaxeTier}`
    : "Connect Express and hatch a buddy to swing at crystal veins.";
  const swingBtn = $("#mine-swing") as HTMLButtonElement;
  swingBtn.hidden = !app.owner;
  swingBtn.disabled = app.busy || data.staminaLeft <= 0 || !!miningChallenge;
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

export async function swingPick() {
  await assertWallet();
  notice("Approve your swing in Express…");
  const challenge = await api<{
    id: string;
    message: string;
    strike_at: number;
    window_ms: number;
  }>("/api/mining/challenge", { owner: app.owner });
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
      `Weak spot! Strike now — ${Math.round(challenge.window_ms / 100) / 10}s window.`;
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

export async function strikeVein() {
  if (!miningChallenge) throw new Error("Swing first");
  await assertWallet();
  clearMiningTimer();
  ($("#mine-strike") as HTMLButtonElement).disabled = true;
  notice("Signing your strike…");
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [miningChallenge.message, app.owner],
  });
  const result = await api<{
    ok: boolean;
    result: string;
    message?: string;
    ore?: { name: string; rewardBoinglets: number; rarity: string };
    party_bonus?: {
      percent: number;
      amount: number;
      together: boolean;
      partySize: number;
    } | null;
    variety_awarded?: number;
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
    $("#mining-prompt").textContent =
      `Mined ${result.ore?.name}! +${result.ore?.rewardBoinglets} Boinglets.`;
    notice(
      `Mined ${result.ore?.name} (${result.ore?.rarity}).${rewardExtrasNotice(result.party_bonus, result.variety_awarded)}`,
    );
  }
  await refreshEconomy().catch(() => undefined);
  await refreshMining();
}

export async function refreshTreasure() {
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
  }>("/api/treasure/status" + (app.owner ? `?owner=${app.owner}` : ""));
  $("#treasure-summary").textContent = app.owner
    ? `${data.digsToday}/${data.dailyCap} digs today · ${data.remaining} left`
    : "Connect Express and hatch a buddy to dig for pasture treasure.";
  const startBtn = $("#treasure-start") as HTMLButtonElement;
  startBtn.hidden = !app.owner;
  startBtn.disabled = app.busy || data.remaining <= 0 || !!treasureChallenge;
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

export async function startTreasureDig() {
  await assertWallet();
  notice("Approve your dig in Express…");
  const challenge = await api<{
    id: string;
    message: string;
    clue: string;
    grid: number;
  }>("/api/treasure/challenge", { owner: app.owner });
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

export async function digTreasureTile(guess: number) {
  if (!treasureChallenge) throw new Error("Start a dig first");
  await assertWallet();
  notice("Signing your dig…");
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [treasureChallenge.message, app.owner],
  });
  const result = await api<{
    ok: boolean;
    result: string;
    spot?: number;
    message?: string;
    treasure?: { name: string; rewardBoinglets: number; rarity: string };
    party_bonus?: {
      percent: number;
      amount: number;
      together: boolean;
      partySize: number;
    } | null;
    variety_awarded?: number;
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
    $("#treasure-clue").textContent =
      `Found ${result.treasure?.name}! +${result.treasure?.rewardBoinglets} Boinglets.`;
    notice(
      `Found ${result.treasure?.name} (${result.treasure?.rarity}).${rewardExtrasNotice(result.party_bonus, result.variety_awarded)}`,
    );
  }
  await refreshEconomy().catch(() => undefined);
  await refreshTreasure();
}
