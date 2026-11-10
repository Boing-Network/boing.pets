import { api, app, notice } from "../appRuntime";
import { assertWallet, run } from "../careActions";
import { sessionApi } from "../socialSession";
import { bindDisablePopover, type DisableReason } from "../disableReason";
import type { ActivityId } from "../../content/attempts";
import { needleAt } from "../../minigames/fishingGame";
import { refreshEconomy } from "../pages/progressPage";
import { showRewardModal } from "../rewardModal";
import type { ClaimRewardResult } from "../rewardBreakdown";

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
};

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
) {
  await assertWallet();
  notice("Approve to keep your reward…");
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [claimMessage, app.owner],
  });
  const result = await sessionApi<ClaimRewardResult>(
    "/api/activity/attempt/claim",
    {
      id,
      owner: app.owner,
      signature,
    },
  );
  result.activity = result.activity || activity;
  showRewardModal(result);
  notice(`Claimed ${result.reward.name}.`);
  await refreshEconomy().catch(() => undefined);
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

export async function playFishing(root: HTMLElement, onDone: () => void) {
  const start = await sessionApi<StartResponse>("/api/activity/attempt/start", {
    owner: app.owner,
    activity: "fishing",
  });
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
  const started = performance.now();
  let raf = 0;
  const tick = () => {
    const elapsed = performance.now() - started;
    // Client mirrors server triangle using phase 0 visually; server validates with secret phase.
    // Use zone-relative animation that still requires timing skill:
    const pos = needleAt(elapsed, pub.periodMs, pub.phase);
    needle.style.left = `${pos * 100}%`;
    if (!prefersReducedMotion()) raf = requestAnimationFrame(tick);
  };
  if (prefersReducedMotion()) {
    needle.style.left = `${(pub.zoneStart + pub.zoneWidth / 2) * 100}%`;
  } else {
    raf = requestAnimationFrame(tick);
  }
  await new Promise<void>((resolve, reject) => {
    reel.onclick = () => {
      cancelAnimationFrame(raf);
      const clickElapsedMs = Math.round(performance.now() - started);
      void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
        id: start.id,
        owner: app.owner,
        input: { clickElapsedMs },
      })
        .then(async (finish) => {
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
            try {
              await claimAttempt(start.id, finish.claim_message, "fishing");
            } catch (e) {
              notice(
                e instanceof Error
                  ? e.message
                  : "Claim failed — you can retry claim from the summary.",
                true,
              );
            }
          }
          resolve();
        })
        .catch(reject);
    };
  });
  root.hidden = true;
  onDone();
}

export async function playMining(root: HTMLElement, onDone: () => void) {
  const start = await sessionApi<StartResponse>("/api/activity/attempt/start", {
    owner: app.owner,
    activity: "mining",
  });
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
    const pushKey = (key: string) => {
      keys.push(key);
      pressElapsedMs.push(Math.round(performance.now() - started));
      const idx = keys.length - 1;
      if (kbds[idx]) {
        kbds[idx]!.classList.remove("next");
        kbds[idx]!.classList.add("done");
      }
      if (kbds[idx + 1]) kbds[idx + 1]!.classList.add("next");
      if (keys.length >= pub.combo.length) {
        window.removeEventListener("keydown", onKey);
        void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
          id: start.id,
          owner: app.owner,
          input: { keys, pressElapsedMs },
        })
          .then(async (finish) => {
            if (!finish.ok) {
              notice(finish.message || "Combo failed — no signature.", true);
            } else if (finish.claim_message) {
              notice(finish.message || "Vein cracked!");
              try {
                await claimAttempt(start.id, finish.claim_message, "mining");
              } catch (e) {
                notice(e instanceof Error ? e.message : "Claim failed", true);
              }
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
      b.onclick = () => pushKey(label);
      touchRow.append(b);
    }
    root.append(touchRow);
    window.addEventListener("keydown", onKey);
    window.setTimeout(() => {
      if (keys.length >= pub.combo.length) return;
      window.removeEventListener("keydown", onKey);
      void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
        id: start.id,
        owner: app.owner,
        input: { keys, pressElapsedMs },
      })
        .then((finish) => {
          notice(finish.message || "Too slow — attempt used.", true);
          resolve();
        })
        .catch(reject);
    }, pub.timeLimitMs + 50);
  });
  root.hidden = true;
  onDone();
}

export async function playRacing(root: HTMLElement, onDone: () => void) {
  const start = await sessionApi<StartResponse>("/api/activity/attempt/start", {
    owner: app.owner,
    activity: "racing",
  });
  const pub = start.public as { beatsMs: number[]; windowMs: number };
  mountShell(root, "Tap / click on each beat flash.");
  const pad = document.createElement("button");
  pad.textContent = "Tap!";
  pad.style.minHeight = "64px";
  root.append(pad);
  const started = performance.now();
  const taps: number[] = [];
  const flashes = pub.beatsMs.map((ms) =>
    window.setTimeout(() => {
      pad.classList.add("secondary");
      pad.textContent = "NOW";
      window.setTimeout(() => {
        pad.classList.remove("secondary");
        pad.textContent = "Tap!";
      }, pub.windowMs);
    }, ms),
  );
  await new Promise<void>((resolve, reject) => {
    pad.onclick = () => {
      taps.push(Math.round(performance.now() - started));
      if (taps.length >= pub.beatsMs.length) {
        flashes.forEach((id) => window.clearTimeout(id));
        void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
          id: start.id,
          owner: app.owner,
          input: { tapElapsedMs: taps },
        })
          .then(async (finish) => {
            if (!finish.ok)
              notice(finish.message || "Off-beat — no signature.", true);
            else if (finish.claim_message) {
              notice(finish.message || "Photo finish!");
              try {
                await claimAttempt(start.id, finish.claim_message, "racing");
              } catch (e) {
                notice(e instanceof Error ? e.message : "Claim failed", true);
              }
            }
            resolve();
          })
          .catch(reject);
      }
    };
  });
  root.hidden = true;
  onDone();
}

export async function playTreasure(root: HTMLElement, onDone: () => void) {
  const start = await sessionApi<StartResponse>("/api/activity/attempt/start", {
    owner: app.owner,
    activity: "treasure",
  });
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
  await new Promise((r) => setTimeout(r, pub.flashMs));
  buttons.forEach((b) => {
    b.classList.remove("flash");
    b.textContent = "?";
    b.disabled = false;
  });
  await new Promise<void>((resolve, reject) => {
    buttons.forEach((b, guess) => {
      b.onclick = () => {
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
            if (!finish.ok)
              notice(finish.message || "Empty dirt — no signature.", true);
            else if (finish.claim_message) {
              notice(finish.message || "Something sparkled!");
              try {
                await claimAttempt(start.id, finish.claim_message, "treasure");
              } catch (e) {
                notice(e instanceof Error ? e.message : "Claim failed", true);
              }
            }
            resolve();
          })
          .catch(reject);
      };
    });
  });
  root.hidden = true;
  onDone();
}

export async function playGarden(root: HTMLElement, onDone: () => void) {
  const start = await sessionApi<StartResponse>("/api/activity/attempt/start", {
    owner: app.owner,
    activity: "garden",
  });
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
    const end = (holdMs: number) => {
      void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
        id: start.id,
        owner: app.owner,
        input: { holdMs },
      })
        .then(async (finish) => {
          if (!finish.ok)
            notice(
              finish.message || "Over/under watered — no signature.",
              true,
            );
          else if (finish.claim_message) {
            notice(finish.message || "Fresh greens!");
            try {
              await claimAttempt(start.id, finish.claim_message, "garden");
            } catch (e) {
              notice(e instanceof Error ? e.message : "Claim failed", true);
            }
          }
          resolve();
        })
        .catch(reject);
    };
    btn.onpointerdown = (e) => {
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
  root.hidden = true;
  onDone();
}

export async function playCook(root: HTMLElement, onDone: () => void) {
  const start = await sessionApi<StartResponse>("/api/activity/attempt/start", {
    owner: app.owner,
    activity: "cook",
  });
  const pub = start.public as {
    scrambled: string[];
    timeLimitMs: number;
    count: number;
  };
  mountShell(
    root,
    `Tap ingredients in the secret recipe order (${pub.count} steps).`,
  );
  const row = document.createElement("div");
  row.className = "cook-ingredients";
  const picked: string[] = [];
  const pickElapsedMs: number[] = [];
  const started = performance.now();
  await new Promise<void>((resolve, reject) => {
    pub.scrambled.forEach((name) => {
      const b = document.createElement("button");
      b.className = "secondary";
      b.textContent = name;
      b.onclick = () => {
        picked.push(name);
        pickElapsedMs.push(Math.round(performance.now() - started));
        b.disabled = true;
        if (picked.length >= pub.count) {
          void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
            id: start.id,
            owner: app.owner,
            input: { picked, pickElapsedMs },
          })
            .then(async (finish) => {
              if (!finish.ok)
                notice(finish.message || "Wrong order — no signature.", true);
              else if (finish.claim_message) {
                notice(finish.message || "Dish ready!");
                try {
                  await claimAttempt(start.id, finish.claim_message, "cook");
                } catch (e) {
                  notice(e instanceof Error ? e.message : "Claim failed", true);
                }
              }
              resolve();
            })
            .catch(reject);
        }
      };
      row.append(b);
    });
    root.append(row);
    window.setTimeout(() => {
      if (picked.length >= pub.count) return;
      void sessionApi<FinishResponse>("/api/activity/attempt/finish", {
        id: start.id,
        owner: app.owner,
        input: { picked, pickElapsedMs },
      }).then((finish) => {
        notice(finish.message || "Too slow — attempt used.", true);
        resolve();
      }, reject);
    }, pub.timeLimitMs + 30);
  });
  root.hidden = true;
  onDone();
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
