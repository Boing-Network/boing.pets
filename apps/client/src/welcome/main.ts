/**
 * Marketing page (`/`): a static page with no 3D, so it loads fast.
 * The species gallery is generated from the shared catalog, so a new species
 * shows up here as soon as it has a render in `public/media/species/`.
 */
import {
  SPECIES_CATALOG,
  territoryName,
  type SpeciesKey,
  type SpeciesSlug,
} from "@boing-pets/contract";
import { playHref } from "../site/routes";
import { DIET_LABEL, GAIT_LABEL } from "../site/species-labels";
import { skinForSkinId } from "../view/species-skins";
import "./welcome.css";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function speciesCard(s: SpeciesKey): HTMLLIElement {
  const img = el("img", {
    src: `/media/species/${s.slug}.webp`,
    alt: `${s.displayName}, rendered in the world's moonlight`,
    loading: "lazy",
    width: 480,
    height: 327,
  });
  // A species can ship before its render does: show a glow-tinted
  // placeholder instead of a broken image.
  img.addEventListener("error", () => {
    const skin = skinForSkinId(s.slug as SpeciesSlug);
    const ph = el("div", { className: "placeholder", role: "img" }, [
      el("span", {}, [s.displayName]),
    ]);
    ph.setAttribute("aria-label", `${s.displayName} (render coming soon)`);
    ph.style.setProperty("--glow", skin.emissive);
    ph.style.setProperty("--coat", skin.primary);
    img.replaceWith(ph);
  });
  const meta = el("p", { className: "meta" }, [
    `${DIET_LABEL[s.diet]} · ${GAIT_LABEL[s.gait]} · ${territoryName(s.home)}`,
  ]);
  const card = el("li", { className: "card" }, [
    el("a", { href: "/world/?bestiary=" + s.slug }, [
      img,
      el("h3", {}, [s.displayName]),
      meta,
    ]),
  ]);
  card.dataset.home = s.home;
  return card;
}

function renderGallery(): void {
  const gallery = document.getElementById("gallery");
  const filters = document.getElementById("territory-filters");
  if (!gallery || !filters) return;
  gallery.replaceChildren(...SPECIES_CATALOG.map(speciesCard));

  const homes = [...new Set(SPECIES_CATALOG.map((s) => s.home))];
  const buttons = [
    { key: "all", label: `All ${SPECIES_CATALOG.length}` },
    ...homes.map((h) => ({ key: h, label: territoryName(h) })),
  ].map(({ key, label }) => {
    const b = el("button", { type: "button", className: "chip" }, [label]);
    b.dataset.key = key;
    b.setAttribute("aria-pressed", String(key === "all"));
    b.addEventListener("click", () => {
      for (const other of filters.querySelectorAll("button")) {
        other.setAttribute("aria-pressed", String(other === b));
      }
      for (const card of gallery.querySelectorAll<HTMLLIElement>(".card")) {
        card.hidden = key !== "all" && card.dataset.home !== key;
      }
    });
    return b;
  });
  filters.replaceChildren(...buttons);
}

/** Play goes to `/world/`, keeping game params a visitor arrived with. */
function wirePlayLinks(): void {
  const href = playHref(window.location.search);
  for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-play]")) {
    a.href = href;
  }
}

renderGallery();
wirePlayLinks();
