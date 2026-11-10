import { HASH_REDIRECTS, isPageId, type PageId } from "./nav";

const CLOSE_DELAY_MS = 180;

function setOpen(drop: Element, open: boolean) {
  const btn = drop.querySelector<HTMLButtonElement>(".nav-drop-btn");
  drop.classList.toggle("is-open", open);
  btn?.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeAll(except?: Element) {
  for (const drop of document.querySelectorAll(".nav-dropdown.is-open")) {
    if (except && drop === except) continue;
    setOpen(drop, false);
  }
}

/**
 * Keep menus open while moving from the title into the panel.
 * Click/tap toggles; Escape + outside click close; focus-within stays open.
 */
export function wireNavDropdowns(): void {
  for (const drop of document.querySelectorAll(".nav-dropdown")) {
    const btn = drop.querySelector<HTMLButtonElement>(".nav-drop-btn");
    const menu = drop.querySelector<HTMLElement>(".nav-drop-menu");
    if (!btn || !menu) continue;

    let closeTimer: number | null = null;
    const cancelClose = () => {
      if (closeTimer != null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
    };
    const scheduleClose = () => {
      cancelClose();
      closeTimer = window.setTimeout(() => {
        // Keep open if focus moved into the menu (keyboard).
        if (drop.contains(document.activeElement)) return;
        setOpen(drop, false);
      }, CLOSE_DELAY_MS);
    };

    drop.addEventListener("mouseenter", () => {
      cancelClose();
      closeAll(drop);
      setOpen(drop, true);
    });
    drop.addEventListener("mouseleave", () => {
      scheduleClose();
    });
    drop.addEventListener("focusin", () => {
      cancelClose();
      closeAll(drop);
      setOpen(drop, true);
    });
    drop.addEventListener("focusout", () => {
      // Defer so focus can land on a menu link first.
      window.setTimeout(() => {
        if (!drop.contains(document.activeElement)) setOpen(drop, false);
      }, 0);
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelClose();
      const next = !drop.classList.contains("is-open");
      closeAll();
      setOpen(drop, next);
      if (next) btn.focus();
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target as Node | null;
    if (target && (target as Element).closest?.(".nav-dropdown")) return;
    closeAll();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = document.querySelector(".nav-dropdown.is-open");
    if (!open) return;
    const btn = open.querySelector<HTMLButtonElement>(".nav-drop-btn");
    closeAll();
    btn?.focus();
  });
}

export function readPageId(): PageId {
  const raw = document.body.dataset.page || "pasture";
  return isPageId(raw) ? raw : "pasture";
}

export function applyLegacyHashRedirect(): void {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return;
  const target = HASH_REDIRECTS[hash];
  if (!target) return;
  // Stay on pasture for in-page buddy anchor.
  if (target.startsWith("/#")) return;
  const onIndex =
    location.pathname === "/" ||
    location.pathname.endsWith("/index.html") ||
    location.pathname.endsWith("/");
  if (onIndex) location.replace(target);
}
