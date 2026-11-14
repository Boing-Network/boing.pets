import { playSfx, popMusicDuck, pushMusicDuck } from "../../audio";
import { api, app, notice } from "../appRuntime";
import { assertWallet, run } from "../careActions";
import { noticeWalletError } from "../appRuntime";
import { sessionApi } from "../socialSession";
import { bindDisablePopover, type DisableReason } from "../disableReason";
import type { ActivityId } from "../../content/attempts";
import { needleAt } from "../../minigames/fishingGame";
import {
  COOK_FLASH_MS,
  cookIngredientItemId,
  type CookFeedback,
} from "../../minigames/cookGame";
import { itemIconSvg } from "../itemIcons";
import { refreshEconomy } from "../pages/progressPage";
import {
  closeRewardModal,
  showRewardModal,
  updateRewardChainStatus,
} from "../rewardModal";
import {
  claimResultForActivity,
  type ClaimRewardResult,
} from "../rewardBreakdown";

interface AttemptStatus {
  activity: ActivityId;
  dailyCap: number;
  attemptsUsed: number;
  remaining: number;
  hatched: boolean;
  pendingClaim: {
    id: string;
    claim_expires_at: number;
    claim_message?: string | null;
  } | null;
  playWindowMs: number;
  dayKey: string;
}

type StartResponse = {
  id: string;
  public: Record<string, unknown>;
  created_at: number;
  expires_at: number;
  remaining: number;
};

type FinishResponse = {
  ok: boolean;
  status: string;
  message?: string;
  claim_message?: string;
  claim_expires_at?: number;
  feedback?: CookFeedback;
};

type PlaySession = {
  aborted: boolean;
  timers: number[];
  rafs: number[];
  onAbort: Array<() => void>;
  keydown: ((event: KeyboardEvent) => void) | null;
  ducked: boolean;
};

const activePlays = new Set<PlaySession>();

function beginPlay(): PlaySession {
  const play: PlaySession = {
    aborted: false,
    timers: [],
    rafs: [],
    onAbort: [],
    keydown: null,
    ducked: true,
  };
  activePlays.add(play);
  pushMusicDuck();
  return play;
}

function clearPlayHandles(play: PlaySession) {
  for (const id of play.timers) window.clearTimeout(id);
  play.timers.length = 0;
  for (const id of play.rafs) cancelAnimationFrame(id);
  play.rafs.length = 0;
  if (play.keydown) {
    window.removeEventListener("keydown", play.keydown);
    play.keydown = null;
  }
}

function endPlay(play: PlaySession) {
  clearPlayHandles(play);
  activePlays.delete(play);
  if (play.ducked) {
    popMusicDuck();
    play.ducked = false;
  }
}

/** Stop in-progress minigames and hide any leftover reward modal. */
export function resetActivityOverlayState() {
  for (const play of [...activePlays]) {
    play.aborted = true;
    clearPlayHandles(play);
    for (const fn of play.onAbort) fn();
    play.onAbort.length = 0;
    if (play.ducked) {
      popMusicDuck();
      play.ducked = false;
    }
  }
  activePlays.clear();
  closeRewardModal();
}

export const abortActivityPlay = resetActivityOverlayState;

function trackTimeout(play: PlaySession, fn: () => void, ms: number) {
  const id = window.setTimeout(fn, ms);
  play.timers.push(id);
  return id;
}

function trackRaf(play: PlaySession, fn: FrameRequestCallback) {
  for (const id of play.rafs) cancelAnimationFrame(id);
  play.rafs.length = 0;
  const id = requestAnimationFrame(fn);
  play.rafs.push(id);
  return id;
}

function trackKeydown(play: PlaySession, fn: (event: KeyboardEvent) => void) {
  play.keydown = fn;
  window.addEventListener("keydown", fn);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function reasonForActivity(
  status: AttemptStatus | null,
  inProgress: boolean,
): DisableReason {
  if (!app.owner) return "connect";
  if (!status?.hatched) return "hatch";
  if (app.busy) return "busy";
  if (status.pendingClaim) return "claim_pending";
  if (inProgress) return "in_progress";
  if (status.remaining <= 0) return "limit";
  return null;
}

export async function loadAttemptStatus(
  activity: ActivityId,
): Promise<AttemptStatus> {
  const q = app.owner
    ? `?activity=${activity}&owner=${encodeURIComponent(app.owner)}`
    : `?activity=${activity}`;
  return api<AttemptStatus>(`/api/activity/attempts/status${q}`);
}

async function claimAttempt(
  id: string,
  claimMessage: string,
  activity?: ActivityId,
  play?: PlaySession,
) {
  if (play?.aborted) return;
  await assertWallet();
  if (play?.aborted) return;
  notice("Approve to keep your reward…");
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [claimMessage, app.owner],
  });
  if (play?.aborted) return;
  showRewardModal(null, { chainStatus: "pending" });
  try {
    const result = await sessionApi<ClaimRewardResult>(
      "/api/activity/attempt/claim",
      {
        id,
        owner: app.owner,
        signature,
      },
    );
    if (play?.aborted) {
      closeRewardModal();
      return;
    }
    const shown = claimResultForActivity(result, activity);
    updateRewardChainStatus("confirmed", shown);
    notice(`Claimed ${shown.reward.name}.`);
    playSfx("reward");
    await refreshEconomy().catch(() => undefined);
  } catch (error) {
    if (play?.aborted) {
      closeRewardModal();
      throw error;
    }
    updateRewardChainStatus("failed");
    throw error;
  }
}

async function claimOrNotice(
  id: string,
  claimMessage: string,
  activity: ActivityId,
  play: PlaySession,
) {
  try {
    await claimAttempt(id, claimMessage, activity, play);
  } catch (error) {
    noticeWalletError(error, () =>
      claimOrNotice(id, claimMessage, activity, play),
    );
  }
}

function mountShell(root: HTMLElement, title: string) {
  root.innerHTML = "";
  root.hidden = false;
  const h = document.createElement("p");
  h.className = "subtle";
  h.textContent = title;
  root.append(h);
  return root;
}

function finishPlay(root: HTMLElement, onDone: () => void, play: PlaySession) {
  endPlay(play);
  root.hidden = true;
  if (!play.aborted) onDone();
}

export async function playFishing(root: HTMLElement, onDone: () => void) {
  const play = beginPlay();
  try {
    const start = await sessionApi<StartResponse>(
      "/api/activity/attempt/start",
      {
        owner: app.owner,
        activity: "fishing",
      },
    );
    if (play.aborted) return;
    const pub = start.public as {
      periodMs: number;
      zoneStart: number;
      zoneWidth: number;
      phase: number;
    };
    mountShell(
      root,
      prefersReducedMotion()
        ? "Reduced motion: the zone is highlighted — click Reel when ready (timing still checked)."
        : "Click Reel when the needle is in the green zone.",
    );
    const bar = document.createElement("div");
    bar.className = "minigame-bar";
    const zone = document.createElement("div");
    zone.className = "minigame-zone";
    zone.style.left = `${pub.zoneStart * 100}%`;
    zone.style.width = `${pub.zoneWidth * 100}%`;
    const needle = document.createElement("div");
    needle.className = "minigame-needle";
    bar.append(zone, needle);
    root.append(bar);
    const reel = document.createElement("button");
    reel.textContent = "Reel!";
    root.append(reel);
    playSfx("fish-cast");
    const started = performance.now();
    const tick = () => {
      if (play.aborted) return;
      const elapsed = performance.now() - started;
      // Client mirrors server triangle using phase 0 visually; server validates with secret phase.
      // Use zone-relative animation that still requires timing skill:
      const pos = needleAt(elapsed, pub.periodMs, pub.phase);
      needle.style.left = `${pos * 100}%`;
      if (!prefersReducedMotion()) trackRaf(play, tick);
    };
    if (prefersReducedMotion()) {
      needle.style.left = `${(pub.zoneStart + pub.zoneWidth / 2) * 100}%`;
    } else {
      trackRaf(play, tick);
    }
    await new Promise<void>((resolve, reject) => {
      play.onAbort.push(resolve);
      reel.onclick = () => {
        playSfx("fish-reel");
        if (play.aborted) {
          resolve();
          return;
        }
        clearPlayHandles(play);
        const clickElapsedMs = Math.round(performance.now() - started);
        void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
          id: start.id,
          owner: app.owner,
          input: { clickElapsedMs },
        })
          .then(async (finish) => {
            if (play.aborted) {
              resolve();
              return;
            }
            if (!finish.ok) {
              notice(
                finish.message || "Missed — attempt used, no signature.",
                true,
              );
              resolve();
              return;
            }
            notice(finish.message || "Success!");
            if (finish.claim_message) {
              await claimOrNotice(
                start.id,
                finish.claim_message,
                "fishing",
                play,
              );
            }
            resolve();
          })
          .catch(reject);
      };
    });
  } finally {
    finishPlay(root, onDone, play);
  }
}

export async function playMining(root: HTMLElement, onDone: () => void) {
  const play = beginPlay();
  try {
    const start = await sessionApi<StartResponse>(
      "/api/activity/attempt/start",
      {
        owner: app.owner,
        activity: "mining",
      },
    );
    if (play.aborted) return;
    const pub = start.public as { combo: string[]; timeLimitMs: number };
    mountShell(
      root,
      `Press ${pub.combo.map((k) => k.toUpperCase()).join(" → ")} within ${Math.round(pub.timeLimitMs / 1000)}s`,
    );
    const row = document.createElement("div");
    row.className = "minigame-keys";
    const kbds = pub.combo.map((k, i) => {
      const el = document.createElement("kbd");
      el.textContent = k.toUpperCase();
      if (i === 0) el.classList.add("next");
      row.append(el);
      return el;
    });
    root.append(row);
    const touchRow = document.createElement("div");
    touchRow.className = "minigame-touch-keys";
    const started = performance.now();
    const keys: string[] = [];
    const pressElapsedMs: number[] = [];
    await new Promise<void>((resolve, reject) => {
      play.onAbort.push(resolve);
      const pushKey = (key: string) => {
        if (play.aborted) return;
        keys.push(key);
        pressElapsedMs.push(Math.round(performance.now() - started));
        const idx = keys.length - 1;
        if (kbds[idx]) {
          kbds[idx]!.classList.remove("next");
          kbds[idx]!.classList.add("done");
        }
        if (kbds[idx + 1]) kbds[idx + 1]!.classList.add("next");
        if (keys.length >= pub.combo.length) {
          if (play.keydown) {
            window.removeEventListener("keydown", play.keydown);
            play.keydown = null;
          }
          void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
            id: start.id,
            owner: app.owner,
            input: { keys, pressElapsedMs },
          })
            .then(async (finish) => {
              if (play.aborted) {
                resolve();
                return;
              }
              if (!finish.ok) {
                notice(finish.message || "Combo failed — no signature.", true);
              } else if (finish.claim_message) {
                notice(finish.message || "Vein cracked!");
                await claimOrNotice(
                  start.id,
                  finish.claim_message,
                  "mining",
                  play,
                );
              }
              resolve();
            })
            .catch(reject);
        }
      };
      const onKey = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key.length !== 1) return;
        event.preventDefault();
        pushKey(key);
      };
      for (const label of ["q", "w", "e", "a", "s", "d"]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "secondary";
        b.textContent = label.toUpperCase();
        b.onclick = () => {
          playSfx("mine-hit");
          pushKey(label);
        };
        touchRow.append(b);
      }
      root.append(touchRow);
      trackKeydown(play, onKey);
      trackTimeout(
        play,
        () => {
          if (play.aborted || keys.length >= pub.combo.length) return;
          if (play.keydown) {
            window.removeEventListener("keydown", play.keydown);
            play.keydown = null;
          }
          void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
            id: start.id,
            owner: app.owner,
            input: { keys, pressElapsedMs },
          })
            .then((finish) => {
              if (play.aborted) {
                resolve();
                return;
              }
              notice(finish.message || "Too slow — attempt used.", true);
              resolve();
            })
            .catch(reject);
        },
        pub.timeLimitMs + 50,
      );
    });
  } finally {
    finishPlay(root, onDone, play);
  }
}

export async function playRacing(root: HTMLElement, onDone: () => void) {
  const play = beginPlay();
  try {
    playSfx("race-start");
    const start = await sessionApi<StartResponse>(
      "/api/activity/attempt/start",
      {
        owner: app.owner,
        activity: "racing",
      },
    );
    if (play.aborted) return;
    const pub = start.public as { beatsMs: number[]; windowMs: number };
    mountShell(root, "Tap / click on each beat flash.");
    const pad = document.createElement("button");
    pad.textContent = "Tap!";
    pad.style.minHeight = "64px";
    root.append(pad);
    const started = performance.now();
    const taps: number[] = [];
    for (const ms of pub.beatsMs) {
      trackTimeout(
        play,
        () => {
          if (play.aborted) return;
          pad.classList.add("secondary");
          pad.textContent = "NOW";
          trackTimeout(
            play,
            () => {
              if (play.aborted) return;
              pad.classList.remove("secondary");
              pad.textContent = "Tap!";
            },
            pub.windowMs,
          );
        },
        ms,
      );
    }
    await new Promise<void>((resolve, reject) => {
      play.onAbort.push(resolve);
      pad.onclick = () => {
        if (play.aborted) return;
        taps.push(Math.round(performance.now() - started));
        if (taps.length >= pub.beatsMs.length) {
          clearPlayHandles(play);
          void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
            id: start.id,
            owner: app.owner,
            input: { tapElapsedMs: taps },
          })
            .then(async (finish) => {
              if (play.aborted) {
                resolve();
                return;
              }
              if (!finish.ok)
                notice(finish.message || "Off-beat — no signature.", true);
              else if (finish.claim_message) {
                notice(finish.message || "Photo finish!");
                playSfx("race-finish");
                await claimOrNotice(
                  start.id,
                  finish.claim_message,
                  "racing",
                  play,
                );
              }
              resolve();
            })
            .catch(reject);
        }
      };
    });
  } finally {
    finishPlay(root, onDone, play);
  }
}

export async function playTreasure(root: HTMLElement, onDone: () => void) {
  const play = beginPlay();
  try {
    const start = await sessionApi<StartResponse>(
      "/api/activity/attempt/start",
      {
        owner: app.owner,
        activity: "treasure",
      },
    );
    if (play.aborted) return;
    const pub = start.public as {
      gridSize: number;
      flashMs: number;
      spot: number;
    };
    mountShell(root, "Memorize the glowing tile, then dig it.");
    const grid = document.createElement("div");
    grid.className = "treasure-grid";
    const buttons: HTMLButtonElement[] = [];
    for (let i = 0; i < pub.gridSize; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "·";
      b.disabled = true;
      grid.append(b);
      buttons.push(b);
    }
    root.append(grid);
    buttons[pub.spot]!.classList.add("flash");
    buttons[pub.spot]!.textContent = "★";
    const started = performance.now();
    await new Promise<void>((resolve) => {
      play.onAbort.push(resolve);
      trackTimeout(play, resolve, pub.flashMs);
    });
    if (play.aborted) return;
    buttons.forEach((b) => {
      b.classList.remove("flash");
      b.textContent = "?";
      b.disabled = false;
    });
    await new Promise<void>((resolve, reject) => {
      play.onAbort.push(resolve);
      buttons.forEach((b, guess) => {
        b.onclick = () => {
          playSfx("dig");
          if (play.aborted) return;
          buttons.forEach((x) => (x.disabled = true));
          void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
            id: start.id,
            owner: app.owner,
            input: {
              guess,
              guessElapsedMs: Math.round(performance.now() - started),
            },
          })
            .then(async (finish) => {
              if (play.aborted) {
                resolve();
                return;
              }
              if (!finish.ok)
                notice(finish.message || "Empty dirt — no signature.", true);
              else if (finish.claim_message) {
                notice(finish.message || "Something sparkled!");
                await claimOrNotice(
                  start.id,
                  finish.claim_message,
                  "treasure",
                  play,
                );
              }
              resolve();
            })
            .catch(reject);
        };
      });
    });
  } finally {
    finishPlay(root, onDone, play);
  }
}

export async function playGarden(root: HTMLElement, onDone: () => void) {
  const play = beginPlay();
  try {
    const start = await sessionApi<StartResponse>(
      "/api/activity/attempt/start",
      {
        owner: app.owner,
        activity: "garden",
      },
    );
    if (play.aborted) return;
    const pub = start.public as { targetHoldMs: number; windowMs: number };
    mountShell(
      root,
      `Hold Water for about ${Math.round(pub.targetHoldMs / 100) / 10}s, then release.`,
    );
    const btn = document.createElement("button");
    btn.textContent = "Hold to water";
    root.append(btn);
    let down = 0;
    await new Promise<void>((resolve, reject) => {
      play.onAbort.push(resolve);
      const end = (holdMs: number) => {
        if (play.aborted) {
          resolve();
          return;
        }
        void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
          id: start.id,
          owner: app.owner,
          input: { holdMs },
        })
          .then(async (finish) => {
            if (play.aborted) {
              resolve();
              return;
            }
            if (!finish.ok)
              notice(
                finish.message || "Over/under watered — no signature.",
                true,
              );
            else if (finish.claim_message) {
              notice(finish.message || "Fresh greens!");
              await claimOrNotice(
                start.id,
                finish.claim_message,
                "garden",
                play,
              );
            }
            resolve();
          })
          .catch(reject);
      };
      btn.onpointerdown = (e) => {
        playSfx("water");
        e.preventDefault();
        down = performance.now();
        btn.textContent = "Watering…";
      };
      btn.onpointerup = () => {
        if (!down) return;
        end(Math.round(performance.now() - down));
      };
      btn.onpointerleave = () => {
        if (!down) return;
        end(Math.round(performance.now() - down));
      };
    });
  } finally {
    finishPlay(root, onDone, play);
  }
}

const COOK_HINT_DWELL_MS = 2200;

function cookChip(name: string, step?: number): HTMLElement {
  const artId = cookIngredientItemId(name);
  const wrap = document.createElement(step != null ? "div" : "button");
  if (wrap instanceof HTMLButtonElement) wrap.type = "button";
  wrap.className = step != null ? "cook-chip" : "secondary cook-chip";
  wrap.dataset.name = name;
  if (step != null) {
    const num = document.createElement("span");
    num.className = "cook-chip-num";
    num.textContent = String(step);
    wrap.append(num);
  }
  if (artId) {
    const art = document.createElement("span");
    art.className = "cook-chip-art";
    art.innerHTML = itemIconSvg(artId);
    wrap.append(art);
  }
  const label = document.createElement("span");
  label.className = "cook-chip-label";
  label.textContent = name;
  wrap.append(label);
  return wrap;
}

function showCookFeedback(
  root: HTMLElement,
  buttons: HTMLButtonElement[],
  picked: string[],
  feedback: CookFeedback,
) {
  picked.forEach((name, i) => {
    const mark = feedback.spots[i];
    if (!mark) return;
    const button = buttons.find(
      (b) => b.dataset.name === name && !b.dataset.marked,
    );
    if (!button) return;
    button.dataset.marked = "1";
    button.classList.add(`cook-spot-${mark}`);
  });
  let line = root.querySelector(".cook-feedback");
  if (!line) {
    line = document.createElement("p");
    line.className = "cook-feedback";
    root.append(line);
  }
  line.textContent = feedback.summary;
}

export async function playCook(root: HTMLElement, onDone: () => void) {
  const play = beginPlay();
  try {
    const start = await sessionApi<StartResponse>(
      "/api/activity/attempt/start",
      {
        owner: app.owner,
        activity: "cook",
      },
    );
    if (play.aborted) return;
    const pub = start.public as {
      ingredients?: string[];
      scrambled: string[];
      timeLimitMs: number;
      flashMs?: number;
      count: number;
    };
    const flashMs =
      typeof pub.flashMs === "number" && pub.flashMs >= 0
        ? pub.flashMs
        : COOK_FLASH_MS;
    const ingredients = Array.isArray(pub.ingredients) ? pub.ingredients : [];
    const count = pub.count || ingredients.length;
    const started = performance.now();
    mountShell(root, `Memorize the recipe order (${count} steps).`);
    const flash = document.createElement("div");
    flash.className = "cook-flash";
    flash.setAttribute("role", "img");
    flash.setAttribute("aria-label", `Recipe order: ${ingredients.join(", ")}`);
    ingredients.forEach((name, i) => flash.append(cookChip(name, i + 1)));
    root.append(flash);
    await new Promise<void>((resolve) => {
      play.onAbort.push(resolve);
      trackTimeout(play, resolve, flashMs);
    });
    if (play.aborted) return;
    flash.remove();
    mountShell(root, `Tap ingredients in the recipe order (${count} steps).`);
    const row = document.createElement("div");
    row.className = "cook-ingredients";
    const picked: string[] = [];
    const pickElapsedMs: number[] = [];
    const buttons: HTMLButtonElement[] = [];
    const timer = document.createElement("p");
    timer.className = "cook-timer small";
    const deadline = performance.now() + pub.timeLimitMs;
    const tickTimer = () => {
      if (play.aborted || picked.length >= count) return;
      const left = Math.max(0, deadline - performance.now());
      timer.textContent = `${(left / 1000).toFixed(1)}s`;
      if (left > 0) trackTimeout(play, tickTimer, 100);
    };
    await new Promise<void>((resolve, reject) => {
      play.onAbort.push(resolve);
      const submit = () => {
        clearPlayHandles(play);
        void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
          id: start.id,
          owner: app.owner,
          input: { picked, pickElapsedMs },
        })
          .then(async (finish) => {
            if (play.aborted) {
              resolve();
              return;
            }
            if (!finish.ok) {
              if (finish.feedback) {
                showCookFeedback(root, buttons, picked, finish.feedback);
                await new Promise<void>((wait) => {
                  trackTimeout(play, wait, COOK_HINT_DWELL_MS);
                });
              } else {
                notice(finish.message || "Wrong order — no signature.", true);
              }
            } else if (finish.claim_message) {
              notice(finish.message || "Dish ready!");
              await claimOrNotice(start.id, finish.claim_message, "cook", play);
            }
            resolve();
          })
          .catch(reject);
      };
      pub.scrambled.forEach((name) => {
        const b = cookChip(name) as HTMLButtonElement;
        b.onclick = () => {
          playSfx("cook");
          if (play.aborted || b.disabled) return;
          picked.push(name);
          pickElapsedMs.push(Math.round(performance.now() - started));
          b.disabled = true;
          if (picked.length >= count) submit();
        };
        buttons.push(b);
        row.append(b);
      });
      root.append(row);
      root.append(timer);
      tickTimer();
      trackTimeout(
        play,
        () => {
          if (play.aborted || picked.length >= count) return;
          submit();
        },
        pub.timeLimitMs + 30,
      );
    });
  } finally {
    finishPlay(root, onDone, play);
  }
}

export function wireActivityButton(opts: {
  button: HTMLButtonElement;
  activity: ActivityId;
  stage: HTMLElement;
  getStatus: () => AttemptStatus | null;
  setStatus: (s: AttemptStatus) => void;
  play: (stage: HTMLElement, done: () => void) => Promise<void>;
  labelReady: string;
}) {
  let inProgress = false;
  const refreshLabel = () => {
    const status = opts.getStatus();
    const reason = reasonForActivity(status, inProgress);
    opts.button.hidden = false;
    opts.button.disabled = reason !== null || !app.owner;
    if (!app.owner) {
      opts.button.textContent = "Connect Express first";
      opts.button.className = "secondary";
    } else if (!status?.hatched) {
      opts.button.textContent = "Hatch a buddy first";
      opts.button.className = "secondary";
    } else if (status.pendingClaim) {
      opts.button.textContent = "Claim pending reward · sign";
      opts.button.className = "";
      opts.button.disabled = false;
    } else if (status.remaining <= 0) {
      opts.button.textContent = "Daily attempts done ✓";
      opts.button.className = "secondary";
    } else if (inProgress) {
      opts.button.textContent = "In progress…";
      opts.button.className = "secondary";
    } else {
      opts.button.textContent = opts.labelReady;
      opts.button.className = "";
    }
  };
  bindDisablePopover(opts.button, () =>
    reasonForActivity(opts.getStatus(), inProgress),
  );
  opts.button.onclick = () =>
    void run(async () => {
      const status = opts.getStatus();
      if (status?.pendingClaim?.claim_message) {
        await claimAttempt(
          status.pendingClaim.id,
          status.pendingClaim.claim_message,
          opts.activity,
        );
        const next = await loadAttemptStatus(opts.activity);
        opts.setStatus(next);
        refreshLabel();
        return;
      }
      if (status?.pendingClaim) {
        notice(
          "You have an unclaimed success, but the claim message is missing — wait for it to expire (~10 min).",
          true,
        );
        return;
      }
      if (!app.owner) throw new Error("Connect Boing Express first");
      inProgress = true;
      refreshLabel();
      try {
        await opts.play(opts.stage, () => undefined);
      } finally {
        inProgress = false;
        const next = await loadAttemptStatus(opts.activity);
        opts.setStatus(next);
        refreshLabel();
      }
    });
  refreshLabel();
  return refreshLabel;
}
