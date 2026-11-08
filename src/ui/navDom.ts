import { HASH_REDIRECTS, isPageId, type PageId } from "./nav";

export function wireNavDropdowns(): void {
  for (const drop of document.querySelectorAll(".nav-dropdown")) {
    const btn = drop.querySelector<HTMLButtonElement>(".nav-drop-btn");
    if (!btn) continue;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = !drop.classList.contains("is-open");
      for (const other of document.querySelectorAll(".nav-dropdown.is-open"))
        other.classList.remove("is-open");
      drop.classList.toggle("is-open", next);
      btn.setAttribute("aria-expanded", next ? "true" : "false");
    });
  }
  document.addEventListener("click", () => {
    for (const drop of document.querySelectorAll(".nav-dropdown.is-open")) {
      drop.classList.remove("is-open");
      drop
        .querySelector(".nav-drop-btn")
        ?.setAttribute("aria-expanded", "false");
    }
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
