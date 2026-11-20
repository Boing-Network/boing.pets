/**
 * Marketing page (`/welcome/`): a static page with no 3D, so it loads fast.
 * The species gallery is generated from the shared catalog, so a new species
 * shows up here as soon as it has a render in `public/media/species/`.
 */
import { Diet, SPECIES_CATALOG, type SpeciesKey } from "@boing-pets/contract";
import "./welcome.css";

const TERRITORIES: Record<string, string> = {
  meadow: "Meadow",
  thicket: "Thicket",
  ridge: "Ridge",
  glade: "Moonlit Glade",
  fen: "Glowfen",
  grove: "Elder Grove",
  crags: "High Crags",
};

const DIET_LABEL: Record<Diet, string> = {
  [Diet.HERBIVORE]: "Herbivore",
  [Diet.OMNIVORE]: "Omnivore",
  [Diet.INSECTIVORE]: "Insectivore",
  [Diet.CARNIVORE]: "Carnivore",
};

const GAIT_LABEL: Record<SpeciesKey["gait"], string> = {
  walk: "walks",
  trot: "trots",
  hop: "hops",
  bound: "bounds",
  scurry: "scurries",
  waddle: "waddles",
  crawl: "crawls",
  wade: "wades",
  fly: "flies",
};

export function territoryName(slug: string): string {
  return TERRITORIES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

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
  const meta = el("p", { className: "meta" }, [
    `${DIET_LABEL[s.diet]} · ${GAIT_LABEL[s.gait]} · ${territoryName(s.home)}`,
  ]);
  const card = el("li", { className: "card" }, [
    img,
    el("h3", {}, [s.displayName]),
    meta,
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

/** Keep `?mp=` etc. when a visitor arrives with them and presses Play. */
function wirePlayLinks(): void {
  const search = window.location.search;
  if (!search) return;
  for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-play]")) {
    a.href = `/${search}`;
  }
}

renderGallery();
wirePlayLinks();
