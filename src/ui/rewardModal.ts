import { activityIconSvg, collectionIconSvg, itemIconSvg } from "./itemIcons";
import {
  formatRewardBreakdown,
  type ClaimRewardResult,
} from "./rewardBreakdown";

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

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function burstConfetti(canvas: HTMLCanvasElement) {
  if (prefersReducedMotion()) {
    canvas.hidden = true;
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const colors = [
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
  const particles = Array.from({ length: 96 }, (_, i) => {
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

export function showRewardModal(result: ClaimRewardResult) {
  closeRewardModal();
  const view = formatRewardBreakdown(result);
  const previously = document.activeElement as HTMLElement | null;

  const root = document.createElement("div");
  root.id = "reward-modal";
  root.className = "reward-modal";
  root.innerHTML = `
    <canvas class="reward-confetti" id="reward-confetti" aria-hidden="true"></canvas>
    <div class="reward-card" role="dialog" aria-modal="true" aria-labelledby="reward-title" tabindex="-1">
      <p id="reward-live" class="visually-hidden" aria-live="polite">${esc(view.summary)}</p>
      <div class="reward-activity">
        <span class="reward-activity-icon">${activityIconSvg(result.activity || "")}</span>
        <p class="eyebrow" id="reward-title">${esc(view.activityTitle)}</p>
      </div>
      <div class="reward-item">
        <div class="reward-item-icon">${view.itemId ? itemIconSvg(view.itemId) : collectionIconSvg("treasure")}</div>
        <div>
          <h3>${esc(view.itemName)}</h3>
          ${view.rarity ? `<p class="subtle">${esc(view.rarity)}</p>` : ""}
        </div>
      </div>
      <ul class="reward-lines">
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
      }
      <button type="button" id="reward-nice">Nice!</button>
    </div>
  `;

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRewardModal();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = root.querySelector(".reward-card") as HTMLElement | null;
    if (!dialog) return;
    const els = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
    );
    if (!els.length) return;
    const first = els[0]!;
    const last = els[els.length - 1]!;
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
  if (canvas) burstConfetti(canvas);
  const nice = root.querySelector<HTMLButtonElement>("#reward-nice");
  (nice ?? root.querySelector<HTMLElement>(".reward-card"))?.focus();
}

export { closeRewardModal };
