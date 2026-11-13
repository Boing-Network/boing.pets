import { app, $ } from "../appRuntime";
import type { ActivityId } from "../../content/attempts";
import {
  loadAttemptStatus,
  playFishing,
  playMining,
  playRacing,
  playTreasure,
  wireActivityButton,
} from "../minigames/playActivity";

type Status = Awaited<ReturnType<typeof loadAttemptStatus>>;

const statuses: Partial<Record<ActivityId, Status>> = {};

function summaryLine(activity: ActivityId, fallback: string) {
  const s = statuses[activity];
  if (!app.owner) return fallback;
  if (!s) return "Loading attempts…";
  if (!s.hatched)
    return "Hatch a buddy on the pasture to unlock this activity.";
  const pending = s.pendingClaim ? " · reward waiting to be signed" : "";
  return `${s.attemptsUsed}/${s.dailyCap} attempts today · ${s.remaining} left${pending}`;
}

export async function refreshRacing() {
  statuses.racing = await loadAttemptStatus("racing");
  $("#racing-summary").textContent = summaryLine(
    "racing",
    "Connect Express and hatch a buddy to line up for heats.",
  );
  ensureWired("racing");
}

export async function refreshFishing() {
  statuses.fishing = await loadAttemptStatus("fishing");
  $("#fishing-summary").textContent = summaryLine(
    "fishing",
    "Connect Express and hatch a buddy to cast at the pond pier.",
  );
  ensureWired("fishing");
}

export async function refreshMining() {
  statuses.mining = await loadAttemptStatus("mining");
  $("#mining-summary").textContent = summaryLine(
    "mining",
    "Connect Express and hatch a buddy to swing in the crystal cavern.",
  );
  ensureWired("mining");
}

export async function refreshTreasure() {
  statuses.treasure = await loadAttemptStatus("treasure");
  $("#treasure-summary").textContent = summaryLine(
    "treasure",
    "Connect Express and hatch a buddy to dig for pasture treasures.",
  );
  ensureWired("treasure");
}

const wiredButtons = new Map<ActivityId, HTMLButtonElement>();
const buttonIds: Partial<Record<ActivityId, string>> = {
  fishing: "fish-cast",
  mining: "mine-swing",
  racing: "race-start",
  treasure: "treasure-start",
};

function ensureWired(activity: ActivityId) {
  const id = buttonIds[activity];
  const current = id
    ? (document.getElementById(id) as HTMLButtonElement | null)
    : null;
  if (current && wiredButtons.get(activity) === current) {
    current.dispatchEvent(new Event("boing-refresh-label"));
    return;
  }
  const map: Record<
    ActivityId,
    {
      button: string;
      stage: string;
      play: typeof playFishing;
      label: string;
    } | null
  > = {
    fishing: {
      button: "fish-cast",
      stage: "fish-minigame",
      play: playFishing,
      label: "Cast · play",
    },
    mining: {
      button: "mine-swing",
      stage: "mine-minigame",
      play: playMining,
      label: "Swing · play",
    },
    racing: {
      button: "race-start",
      stage: "race-minigame",
      play: playRacing,
      label: "Line up · play",
    },
    treasure: {
      button: "treasure-start",
      stage: "treasure-minigame",
      play: playTreasure,
      label: "Start dig · play",
    },
    garden: null,
    cook: null,
  };
  const cfg = map[activity];
  if (!cfg) return;
  const button = document.getElementById(
    cfg.button,
  ) as HTMLButtonElement | null;
  const stage = document.getElementById(cfg.stage) as HTMLElement | null;
  if (!button || !stage) return;
  const refreshLabel = wireActivityButton({
    button,
    activity,
    stage,
    getStatus: () => statuses[activity] || null,
    setStatus: (s) => {
      statuses[activity] = s;
    },
    play: cfg.play,
    labelReady: cfg.label,
  });
  button.addEventListener("boing-refresh-label", () => refreshLabel());
  if (button) wiredButtons.set(activity, button);
}

/** Legacy no-ops kept for any leftover imports. */
export function clearFishingTimer() {}
export function clearMiningTimer() {}
export function clearRacingTimer() {}
export async function castLine() {}
export async function reelIn() {}
export async function swingPick() {}
export async function strikeVein() {}
export async function startRace() {}
export async function finishRace() {}
export async function startTreasureDig() {}
export async function chooseTile(_n: number) {
  void _n;
}
