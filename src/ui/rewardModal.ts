import { activityIconSvg, collectionIconSvg, itemIconSvg } from "./itemIcons";
import { prefersReducedMotion } from "./a11ySettings";
import {
  chainStatusDescription,
  chainStatusLabel,
  formatRewardBreakdown,
  type ClaimRewardResult,
  type RewardChainStatus,
} from "./rewardBreakdown";
import {
  adventureRevealClassName,
  formatAcquiredAt,
  formatOwnerCount,
  type AdventureRevealReward,
} from "./adventureReveal";

function esc(value: string) {
  return value.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function burstConfetti(
  canvas: HTMLCanvasElement,
  options: { colors?: string[]; extra?: boolean } = {},
) {
  if (prefersReducedMotion()) {
    canvas.hidden = true;
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const colors = options.colors ?? [
    "#7fa7ff",
    "#9ad7c2",
    "#ffd27a",
    "#ef9bb8",
    "#c9e7ff",
    "#b9eacb",
  ];
  let width = 0;
  let height = 0;
  let dpr = 1;
  const resize = () => {
    width = parent.clientWidth;
    height = parent.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const count = options.extra ? 140 : 96;
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 7;
    return {
      x: width * 0.5 + (Math.random() - 0.5) * width * 0.3,
      y: height * 0.28,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.4 - (5 + Math.random() * 6),
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 14,
      size: 4 + Math.random() * 6,
      color: colors[i % colors.length]!,
      shape: i % 3,
    };
  });
  const started = performance.now();
  const duration = 2600;
  const tick = (now: number) => {
    const elapsed = now - started;
    const fade = Math.max(0, 1 - elapsed / duration);
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.vy += 0.16;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      if (p.shape === 0) {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -p.size / 2);
        ctx.lineTo(p.size / 2, p.size / 2);
        ctx.lineTo(-p.size / 2, p.size / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    if (elapsed < duration) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, width, height);
  };
  requestAnimationFrame(tick);
}

function closeRewardModal() {
  const root = document.getElementById("reward-modal");
  if (!root) return;
  const restore = (root as HTMLElement & { __restoreFocus?: () => void })
    .__restoreFocus;
  root.remove();
  restore?.();
}

function chainStatusMarkup(status: RewardChainStatus): string {
  return `<p class="reward-chain-status is-${status}" data-status="${status}" role="status">
      <span class="reward-chain-dot" aria-hidden="true"></span>
      <span class="reward-chain-label">${esc(chainStatusLabel(status))}</span>
      <span class="reward-chain-copy">${esc(chainStatusDescription(status))}</span>
    </p>`;
}

function pendingRewardView(): ClaimRewardResult {
  return {
    reward: { name: "Securing your reward", rewardBoinglets: 0 },
  };
}

function mintLabel(status: AdventureRevealReward["mintStatus"]): string {
  if (status === "pending") return "Mint pending";
  if (status === "confirmed") return "Mint confirmed";
  if (status === "failed") return "Mint failed";
  return "Off-chain";
}

function adventureRewardMarkup(reward: AdventureRevealReward): string {
  const itemIcon = reward.previewItemId
    ? itemIconSvg(reward.previewItemId)
    : collectionIconSvg("treasure");
  return `
    <article class="${esc(adventureRevealClassName(reward))}" data-rarity="${esc(String(reward.rarity))}">
      <div class="reward-item">
        <div class="reward-item-icon">${itemIcon}</div>
        <div>
          <h3>${esc(reward.name)}${reward.qty > 1 ? ` ×${reward.qty}` : ""}</h3>
          <p class="adventure-rarity-name" style="color:${esc(reward.color)}">${esc(reward.rarityName)}</p>
        </div>
      </div>
      <ul class="reward-lines adventure-reveal-meta">
        <li><span>Category</span><strong>${esc(reward.category)}</strong></li>
        <li><span>Drop source</span><strong>${esc(reward.dropSource)}</strong></li>
        <li><span>Status</span><strong>${esc(reward.ownership)}</strong></li>
        <li><span>Acquired</span><strong>${esc(formatAcquiredAt(reward.acquiredAt))} (America/New_York)</strong></li>
        <li><span>Owners</span><strong>${esc(formatOwnerCount(reward.ownerCount))}</strong></li>
        <li><span>Mint</span><strong>${esc(mintLabel(reward.mintStatus))}</strong></li>
      </ul>
    </article>
  `;
}

export type RewardModalOptions = {
  chainStatus?: RewardChainStatus;
  adventureRewards?: AdventureRevealReward[];
  activityTitle?: string;
};

function renderRewardCard(
  result: ClaimRewardResult | null,
  options: RewardModalOptions,
): string {
  const chainStatus = options.chainStatus ?? "confirmed";
  const adventure = options.adventureRewards ?? [];
  const pending =
    !adventure.length &&
    (!result || (chainStatus === "pending" && !result.reward?.itemId));
  const view = formatRewardBreakdown(result ?? pendingRewardView());
  const itemName =
    pending && !result?.reward?.itemId ? "Securing your reward" : view.itemName;
  const itemIcon = view.itemId
    ? itemIconSvg(view.itemId)
    : collectionIconSvg("treasure");
  const title =
    options.activityTitle || (pending ? "Reward incoming" : view.activityTitle);
  const lead = adventure[0];
  const cardClass = lead ? adventureRevealClassName(lead) : "reward-card";
  const flairClass = lead?.extraFlair
    ? " reward-modal has-flair"
    : lead?.holo
      ? " has-holo"
      : "";
  return `
    <canvas class="reward-confetti" id="reward-confetti" aria-hidden="true"></canvas>
    <div class="${cardClass}" role="dialog" aria-modal="true" aria-labelledby="reward-title" tabindex="-1" data-flair="${lead?.effect ?? ""}">
      <p id="reward-live" class="visually-hidden" aria-live="polite">${esc(pending ? chainStatusDescription(chainStatus) : view.summary)}</p>
      <div class="reward-activity">
        <span class="reward-activity-icon">${activityIconSvg(result?.activity || "adventure")}</span>
        <p class="eyebrow" id="reward-title">${esc(title)}</p>
      </div>
      ${
        adventure.length
          ? adventure.map(adventureRewardMarkup).join("")
          : `<div class="reward-item">
        <div class="reward-item-icon">${itemIcon}</div>
        <div>
          <h3>${esc(itemName)}</h3>
          ${!pending && view.rarity ? `<p class="subtle">${esc(view.rarity)}</p>` : ""}
        </div>
      </div>`
      }
      ${chainStatusMarkup(chainStatus)}
      ${
        pending || adventure.length
          ? ""
          : `<ul class="reward-lines">
        ${view.lines
          .map(
            (line) =>
              `<li class="${line.key === "total" ? "is-total" : ""}"><span>${esc(line.label)}</span><strong>${esc(line.value)}</strong></li>`,
          )
          .join("")}
      </ul>
      ${
        view.extras.length
          ? `<ul class="reward-extras">${view.extras
              .map(
                (line) =>
                  `<li><span>${esc(line.label)}</span><strong>${esc(line.value)}</strong></li>`,
              )
              .join("")}</ul>`
          : ""
      }`
      }
      <button type="button" id="reward-nice">${pending ? "Working…" : "Nice!"}</button>
    </div>
  `.replace(" data-flair", flairClass ? ` data-flair` : " data-flair");
}

export function showRewardModal(
  result: ClaimRewardResult | null,
  options: RewardModalOptions = {},
) {
  const chainStatus = options.chainStatus ?? "confirmed";
  closeRewardModal();
  const previously = document.activeElement as HTMLElement | null;

  const root = document.createElement("div");
  root.id = "reward-modal";
  const lead = options.adventureRewards?.[0];
  root.className =
    "reward-modal" +
    (lead?.holo ? " has-holo" : "") +
    (lead?.extraFlair ? " has-flair" : "") +
    (lead ? ` rarity-${lead.rarity}` : "");
  root.innerHTML = renderRewardCard(result, options);
  (root as HTMLElement & { __adventure?: RewardModalOptions }).__adventure =
    options;

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRewardModal();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = root.querySelector(
      ".reward-card, .adventure-reveal",
    ) as HTMLElement | null;
    if (!dialog) return;
    const els = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
    );
    const extra = root.querySelectorAll<HTMLElement>("#reward-nice");
    const list = els.length ? els : [...extra];
    if (!list.length) return;
    const first = list[0]!;
    const last = list[list.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  (root as HTMLElement & { __restoreFocus?: () => void }).__restoreFocus =
    () => {
      document.removeEventListener("keydown", onKey, true);
      previously?.focus?.();
    };

  root.addEventListener("click", (event) => {
    if (event.target === root) closeRewardModal();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.append(root);
  root
    .querySelector<HTMLButtonElement>("#reward-nice")
    ?.addEventListener("click", closeRewardModal);
  const canvas = root.querySelector<HTMLCanvasElement>("#reward-confetti");
  if (canvas) {
    const colors = lead
      ? [lead.color, "#ff4d00", "#f5f5f0", "#2ec8e0"]
      : undefined;
    burstConfetti(canvas, { colors, extra: lead?.extraFlair });
  }
  const nice = root.querySelector<HTMLButtonElement>("#reward-nice");
  if (nice && chainStatus === "pending" && !options.adventureRewards?.length)
    nice.disabled = true;
  (nice ?? root.querySelector<HTMLElement>(".reward-card"))?.focus();
}

export function updateRewardChainStatus(
  status: RewardChainStatus,
  result?: ClaimRewardResult | null,
) {
  const root = document.getElementById("reward-modal");
  const saved = root
    ? (root as HTMLElement & { __adventure?: RewardModalOptions }).__adventure
    : undefined;
  if (!root) {
    if (result || status !== "pending")
      showRewardModal(result ?? null, {
        ...(saved ?? {}),
        chainStatus: status,
      });
    return;
  }
  if (result || saved?.adventureRewards) {
    const live = document.activeElement === root.querySelector("#reward-nice");
    const next = { ...(saved ?? {}), chainStatus: status };
    root.innerHTML = renderRewardCard(result ?? null, next);
    (root as HTMLElement & { __adventure?: RewardModalOptions }).__adventure =
      next;
    const canvas = root.querySelector<HTMLCanvasElement>("#reward-confetti");
    if (canvas && status === "confirmed") burstConfetti(canvas);
    const nice = root.querySelector<HTMLButtonElement>("#reward-nice");
    if (nice) {
      nice.disabled = status === "pending" && !saved?.adventureRewards?.length;
      nice.addEventListener("click", closeRewardModal);
      if (live) nice.focus();
    }
    return;
  }
  const el = root.querySelector(".reward-chain-status");
  if (el) {
    el.className = `reward-chain-status is-${status}`;
    el.setAttribute("data-status", status);
    const label = el.querySelector(".reward-chain-label");
    const copy = el.querySelector(".reward-chain-copy");
    if (label) label.textContent = chainStatusLabel(status);
    if (copy) copy.textContent = chainStatusDescription(status);
  }
  const live = root.querySelector("#reward-live");
  if (live) live.textContent = chainStatusDescription(status);
  const nice = root.querySelector<HTMLButtonElement>("#reward-nice");
  if (nice) {
    nice.disabled = status === "pending" && !saved?.adventureRewards?.length;
    if (status !== "pending") nice.textContent = "Nice!";
  }
}

export { closeRewardModal };
