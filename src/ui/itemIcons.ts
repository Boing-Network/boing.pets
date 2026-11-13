/** Self-hosted inline SVG icons for activities, items, and collection entries. */

import type { ActivityId } from "../content/attempts";

const VB =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"';

function svg(body: string): string {
  return `<svg ${VB} width="64" height="64">${body}</svg>`;
}

export const ACTIVITY_LABELS: Record<ActivityId, string> = {
  fishing: "Fishing",
  mining: "Mining",
  racing: "Racing",
  treasure: "Treasure",
  garden: "Garden",
  cook: "Cooking",
};

const ACTIVITY_ICONS: Record<ActivityId, string> = {
  fishing: svg(
    '<rect width="64" height="64" rx="16" fill="#16324f"/><path d="M14 36c10-2 16-12 18-20 8 6 18 16 14 26-6 12-28 14-32-6z" fill="#5ec4ff"/><circle cx="22" cy="34" r="3" fill="#16324f"/><path d="M36 18c8-2 16 4 18 12" fill="none" stroke="#ffd27a" stroke-width="3" stroke-linecap="round"/><circle cx="54" cy="30" r="3" fill="#ffd27a"/>',
  ),
  mining: svg(
    '<rect width="64" height="64" rx="16" fill="#2a2430"/><path d="M18 44l10-16 8 6 12-18" fill="none" stroke="#c9e7ff" stroke-width="3" stroke-linecap="round"/><path d="M14 20h16l4 8H18z" fill="#8fd4ff"/><path d="M34 26l16 22H22z" fill="#7ddea0"/><circle cx="40" cy="40" r="3" fill="#fff6c8"/>',
  ),
  racing: svg(
    '<rect width="64" height="64" rx="16" fill="#1a2e1c"/><ellipse cx="32" cy="40" rx="20" ry="8" fill="#3d5a3a"/><path d="M16 36c6-10 26-10 32 0l-4 8H20z" fill="#7fa7ff"/><circle cx="22" cy="44" r="5" fill="#09122c" stroke="#e8eeff" stroke-width="2"/><circle cx="42" cy="44" r="5" fill="#09122c" stroke="#e8eeff" stroke-width="2"/><path d="M28 28h12l4 8H24z" fill="#ffd27a"/>',
  ),
  treasure: svg(
    '<rect width="64" height="64" rx="16" fill="#2a2316"/><rect x="14" y="28" width="36" height="22" rx="4" fill="#e8c27a"/><rect x="14" y="22" width="36" height="10" rx="3" fill="#c4923a"/><rect x="28" y="30" width="8" height="8" rx="2" fill="#fff6c8"/><path d="M20 18l4 8h16l4-8" fill="none" stroke="#9ad7c2" stroke-width="3"/>',
  ),
  garden: svg(
    '<rect width="64" height="64" rx="16" fill="#16321c"/><path d="M32 48V28" stroke="#8b5a2b" stroke-width="4" stroke-linecap="round"/><path d="M32 30c-10-2-14-12-8-16 6 2 8 8 8 16z" fill="#7ddea0"/><path d="M32 30c10-2 14-12 8-16-6 2-8 8-8 16z" fill="#6edc96"/><circle cx="32" cy="22" r="4" fill="#ef9bb8"/>',
  ),
  cook: svg(
    '<rect width="64" height="64" rx="16" fill="#2a1c16"/><ellipse cx="32" cy="42" rx="18" ry="8" fill="#5a3a28"/><path d="M16 36c0-8 8-12 16-12s16 4 16 12" fill="#c4923a"/><path d="M24 22c2-6 6-8 8-8s6 2 8 8" fill="none" stroke="#ffcebe" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="34" r="3" fill="#fff6c8"/>',
  ),
};

export function activityIconSvg(activity: string): string {
  return ACTIVITY_ICONS[activity as ActivityId] ?? ACTIVITY_ICONS.fishing;
}

export function activityTitle(activity: string | undefined | null): string {
  if (!activity) return "Daily activity";
  return ACTIVITY_LABELS[activity as ActivityId] ?? activity;
}

const ITEM_ICONS: Record<string, string> = {
  "fish-ripple": svg(
    '<rect width="64" height="64" rx="16" fill="#12344a"/><path d="M12 34c10-8 22-10 30-4 2 8-4 16-16 16-8 0-16-4-14-12z" fill="#7fa7ff"/><path d="M42 30l12-8v20z" fill="#5ec4ff"/><circle cx="24" cy="32" r="2.5" fill="#09122c"/>',
  ),
  "fish-boingfin": svg(
    '<rect width="64" height="64" rx="16" fill="#12344a"/><path d="M10 36c12-14 28-14 36-2-2 12-16 18-28 14-8-2-12-6-8-12z" fill="#9ad7c2"/><path d="M46 32l12-10v22z" fill="#7ddea0"/><circle cx="24" cy="32" r="2.5" fill="#09122c"/><path d="M28 24c4-6 10-6 14-2" fill="none" stroke="#ffd27a" stroke-width="2"/>',
  ),
  "fish-moonkoi": svg(
    '<rect width="64" height="64" rx="16" fill="#121830"/><path d="M10 36c14-16 30-12 38 0-4 12-18 18-30 14-10-2-14-6-8-14z" fill="#e8eeff"/><path d="M48 32l10-8v18z" fill="#c9e7ff"/><circle cx="24" cy="32" r="2.5" fill="#16324f"/><circle cx="32" cy="28" r="3" fill="#ffd27a"/>',
  ),
  "ore-pebble": svg(
    '<rect width="64" height="64" rx="16" fill="#222830"/><path d="M16 40l8-16 16-4 12 14-6 12H22z" fill="#8aa0b8"/>',
  ),
  "ore-spark": svg(
    '<rect width="64" height="64" rx="16" fill="#222830"/><path d="M18 42l6-18 16-4 10 16-8 12H24z" fill="#5a6a80"/><path d="M28 28l4 8 8 2-6 6 2 8-8-4-6 6 2-8-8-4 8-2z" fill="#ffd27a"/>',
  ),
  "ore-crystal": svg(
    '<rect width="64" height="64" rx="16" fill="#1a1630"/><path d="M32 10l14 20-14 24L18 30z" fill="#8fd4ff"/><path d="M32 10l8 20-8 24V10z" fill="#5ec4ff"/>',
  ),
  "crop-sprout": svg(
    '<rect width="64" height="64" rx="16" fill="#16321c"/><path d="M32 52V28" stroke="#8b5a2b" stroke-width="4"/><path d="M32 30C20 26 18 16 26 14c4 4 6 10 6 16z" fill="#7ddea0"/><path d="M32 30c12-4 14-14 6-16-4 4-6 10-6 16z" fill="#9ad7c2"/>',
  ),
  "crop-berry": svg(
    '<rect width="64" height="64" rx="16" fill="#16321c"/><path d="M32 52V34" stroke="#8b5a2b" stroke-width="4"/><circle cx="26" cy="28" r="7" fill="#c45b7a"/><circle cx="38" cy="28" r="7" fill="#ef9bb8"/><circle cx="32" cy="22" r="6" fill="#d9789a"/><path d="M32 16c4-6 10-6 12-2" fill="none" stroke="#7ddea0" stroke-width="3"/>',
  ),
  "crop-moonbloom": svg(
    '<rect width="64" height="64" rx="16" fill="#121830"/><path d="M32 52V32" stroke="#8b5a2b" stroke-width="4"/><circle cx="32" cy="24" r="12" fill="#c9e7ff"/><circle cx="32" cy="24" r="5" fill="#ffd27a"/>',
  ),
  "crop-forage": svg(
    '<rect width="64" height="64" rx="16" fill="#16321c"/><circle cx="24" cy="36" r="8" fill="#7ddea0"/><circle cx="40" cy="34" r="7" fill="#9ad7c2"/><circle cx="32" cy="24" r="6" fill="#b9eacb"/>',
  ),
  "food-sprout-salad": svg(
    '<rect width="64" height="64" rx="16" fill="#2a1c16"/><ellipse cx="32" cy="44" rx="18" ry="7" fill="#8a6a50"/><path d="M18 40c4-12 24-12 28 0" fill="#7ddea0"/><circle cx="28" cy="34" r="3" fill="#ef9bb8"/>',
  ),
  "food-berry-glaze": svg(
    '<rect width="64" height="64" rx="16" fill="#2a1c16"/><ellipse cx="32" cy="44" rx="18" ry="7" fill="#8a6a50"/><path d="M16 38c8-8 24-8 32 0l-6 8H22z" fill="#ef9bb8"/><path d="M22 34c8-6 16-4 20 2" fill="none" stroke="#ffd27a" stroke-width="2"/>',
  ),
  "food-moon-feast": svg(
    '<rect width="64" height="64" rx="16" fill="#1a1630"/><ellipse cx="32" cy="44" rx="18" ry="7" fill="#3a2a50"/><path d="M16 38c8-10 24-10 32 0l-6 10H22z" fill="#c9e7ff"/><circle cx="32" cy="30" r="5" fill="#ffd27a"/>',
  ),
  "food-snack": svg(
    '<rect width="64" height="64" rx="16" fill="#2a1c16"/><ellipse cx="32" cy="36" rx="16" ry="12" fill="#e8c27a"/><ellipse cx="32" cy="36" rx="8" ry="6" fill="#c4923a"/>',
  ),
  "ribbon-gold": svg(
    '<rect width="64" height="64" rx="16" fill="#2a2316"/><circle cx="32" cy="28" r="14" fill="#ffd27a"/><path d="M24 38l-6 16 14-8 14 8-6-16" fill="#e8c27a"/><text x="32" y="33" text-anchor="middle" font-size="12" font-weight="700" fill="#09122c">1</text>',
  ),
  "ribbon-silver": svg(
    '<rect width="64" height="64" rx="16" fill="#1c242c"/><circle cx="32" cy="28" r="14" fill="#c9e7ff"/><path d="M24 38l-6 16 14-8 14 8-6-16" fill="#8aa0b8"/><text x="32" y="33" text-anchor="middle" font-size="12" font-weight="700" fill="#09122c">2</text>',
  ),
  "ribbon-bronze": svg(
    '<rect width="64" height="64" rx="16" fill="#2a1c16"/><circle cx="32" cy="28" r="14" fill="#e0a06a"/><path d="M24 38l-6 16 14-8 14 8-6-16" fill="#c4923a"/><text x="32" y="33" text-anchor="middle" font-size="12" font-weight="700" fill="#09122c">3</text>',
  ),
  "loot-pebble": svg(
    '<rect width="64" height="64" rx="16" fill="#1c2420"/><path d="M20 40l8-14 16-2 8 12-8 10H26z" fill="#9ad7c2"/><circle cx="36" cy="34" r="3" fill="#fff6c8"/>',
  ),
  "loot-map-scrap": svg(
    '<rect width="64" height="64" rx="16" fill="#2a2316"/><path d="M16 16h28l8 8v28H16z" fill="#e8c27a"/><path d="M44 16v8h8" fill="#c4923a"/><path d="M22 30h20M22 38h14M22 46h18" stroke="#5a3a28" stroke-width="2"/>',
  ),
  "loot-sun-shard": svg(
    '<rect width="64" height="64" rx="16" fill="#2a2316"/><path d="M32 8l6 16 16 6-16 6-6 16-6-16-16-6 16-6z" fill="#ffd27a"/>',
  ),
  "hat-ribbon": svg(
    '<rect width="64" height="64" rx="16" fill="#1a2030"/><ellipse cx="32" cy="36" rx="16" ry="10" fill="#7fa7ff"/><path d="M32 26v-8M24 22h16" stroke="#ef9bb8" stroke-width="3" stroke-linecap="round"/><path d="M40 22l8 10-8 2z" fill="#ef9bb8"/>',
  ),
  "hat-antenna": svg(
    '<rect width="64" height="64" rx="16" fill="#1a2030"/><ellipse cx="32" cy="40" rx="14" ry="9" fill="#7fa7ff"/><path d="M26 28c-2-10 2-16 6-16" stroke="#9ad7c2" stroke-width="3" fill="none"/><circle cx="32" cy="12" r="4" fill="#7ddea0"/>',
  ),
  "hat-stardust": svg(
    '<rect width="64" height="64" rx="16" fill="#121830"/><ellipse cx="32" cy="42" rx="14" ry="8" fill="#7fa7ff"/><path d="M16 28c8-10 24-10 32 0" fill="none" stroke="#ffd27a" stroke-width="3"/><circle cx="32" cy="18" r="4" fill="#fff6c8"/>',
  ),
  "furn-cushion": svg(
    '<rect width="64" height="64" rx="16" fill="#1a2030"/><ellipse cx="32" cy="36" rx="20" ry="14" fill="#ef9bb8"/><ellipse cx="32" cy="34" rx="12" ry="8" fill="#ffcebe"/>',
  ),
  "furn-lamp": svg(
    '<rect width="64" height="64" rx="16" fill="#1a2030"/><path d="M32 52V36" stroke="#c9e7ff" stroke-width="3"/><path d="M20 36l12-20 12 20z" fill="#ffd27a"/><rect x="24" y="50" width="16" height="4" rx="2" fill="#8aa0b8"/>',
  ),
  "frame-gold": svg(
    '<rect width="64" height="64" rx="16" fill="#1a2030"/><rect x="12" y="14" width="40" height="36" rx="4" fill="none" stroke="#ffd27a" stroke-width="4"/><rect x="20" y="22" width="24" height="20" rx="2" fill="#152546"/>',
  ),
  "frame-aurora": svg(
    '<rect width="64" height="64" rx="16" fill="#1a2030"/><rect x="12" y="14" width="40" height="36" rx="4" fill="none" stroke="#8fd4ff" stroke-width="4"/><path d="M20 40c6-10 18-10 24 0" fill="none" stroke="#ef9bb8" stroke-width="3"/>',
  ),
  "tool-pick-iron": svg(
    '<rect width="64" height="64" rx="16" fill="#222830"/><path d="M24 48L44 20" stroke="#8b5a2b" stroke-width="5" stroke-linecap="round"/><path d="M36 14l16 10-8 8z" fill="#8aa0b8"/>',
  ),
  "tool-pick-crystal": svg(
    '<rect width="64" height="64" rx="16" fill="#1a1630"/><path d="M24 48L44 20" stroke="#c9e7ff" stroke-width="5" stroke-linecap="round"/><path d="M36 14l16 10-8 8z" fill="#8fd4ff"/>',
  ),

  "ore-emberite": svg(
    '<rect width="64" height="64" rx="16" fill="#2a1810"/><path d="M14 42l10-18 16-6 14 16-8 14H22z" fill="#c4622d"/><path d="M28 28l8 4 4 10-10 6-8-8z" fill="#e08a3c"/><path d="M32 22l2 8 8 2-6 6 2 8-8-4-6 6 2-8-8-4 8-2z" fill="#ffd27a"/>',
  ),
  "ore-aetherite": svg(
    '<rect width="64" height="64" rx="16" fill="#161028"/><path d="M32 8l16 22-16 28L16 30z" fill="#9b7dff"/><path d="M32 8l8 22-8 28V8z" fill="#c9a8ff"/><circle cx="32" cy="30" r="4" fill="#fff6c8"/>',
  ),
  "fish-copperfin": svg(
    '<rect width="64" height="64" rx="16" fill="#2a1c12"/><path d="M10 36c12-14 28-12 38-2-4 12-18 18-30 14-10-2-14-6-8-12z" fill="#e08a3c"/><path d="M48 32l10-10v22z" fill="#c4622d"/><circle cx="24" cy="32" r="2.5" fill="#2a1c12"/><path d="M20 28h8" stroke="#ffd27a" stroke-width="2"/>',
  ),
  "fish-starfin": svg(
    '<rect width="64" height="64" rx="16" fill="#101428"/><path d="M8 36c14-16 32-14 40 0-4 12-20 18-32 14-10-2-14-6-8-14z" fill="#7fa7ff"/><path d="M48 32l12-10v22z" fill="#ffd27a"/><circle cx="22" cy="32" r="2.5" fill="#09122c"/><path d="M30 20l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="#fff6c8"/>',
  ),
  "loot-wind-bell": svg(
    '<rect width="64" height="64" rx="16" fill="#1c2430"/><path d="M24 18h16l2 6H22z" fill="#8aa0b8"/><path d="M18 24h28c0 14-6 22-14 24-8-2-14-10-14-24z" fill="#c9e7ff"/><circle cx="32" cy="40" r="3" fill="#ffd27a"/><path d="M12 20c6 4 8 10 6 16M52 18c-6 4-8 10-6 16" fill="none" stroke="#9ad7c2" stroke-width="2" stroke-linecap="round"/>',
  ),
  "loot-comet-bead": svg(
    '<rect width="64" height="64" rx="16" fill="#121830"/><path d="M12 48c8-6 18-16 28-28 4 6 8 12 8 16-10 6-24 10-36 12z" fill="#8fd4ff"/><circle cx="44" cy="18" r="8" fill="#ffd27a"/><circle cx="44" cy="18" r="3" fill="#fff6c8"/>',
  ),
  "crop-honeyroot": svg(
    '<rect width="64" height="64" rx="16" fill="#1c2410"/><path d="M32 12c8 8 6 16 0 22-6-6-8-14 0-22z" fill="#7ddea0"/><path d="M32 32c-8 4-12 16-6 24 8-2 14-10 16-18-4 0-8-2-10-6z" fill="#e0a06a"/><path d="M32 34c6 2 10 10 8 18" fill="none" stroke="#c4923a" stroke-width="2"/>',
  ),
  "crop-starglider": svg(
    '<rect width="64" height="64" rx="16" fill="#121830"/><path d="M32 50V28" stroke="#8b5a2b" stroke-width="4"/><path d="M32 8l6 14 16 6-16 6-6 16-6-16-16-6 16-6z" fill="#c9e7ff"/><circle cx="32" cy="28" r="4" fill="#ffd27a"/>',
  ),
  "food-honey-tart": svg(
    '<rect width="64" height="64" rx="16" fill="#2a1c16"/><ellipse cx="32" cy="42" rx="18" ry="8" fill="#8a6a50"/><path d="M16 40c4-14 28-14 32 0v4H16z" fill="#e0a06a"/><ellipse cx="32" cy="34" rx="12" ry="6" fill="#ffd27a"/><circle cx="28" cy="32" r="2" fill="#c45b7a"/>',
  ),
  "food-starlit": svg(
    '<rect width="64" height="64" rx="16" fill="#121830"/><ellipse cx="32" cy="46" rx="18" ry="7" fill="#3a2a50"/><path d="M16 40c6-12 26-12 32 0l-4 8H20z" fill="#5a4a80"/><path d="M24 32l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="#ffd27a"/><circle cx="40" cy="30" r="2" fill="#fff6c8"/>',
  ),
  "tool-pick-wood": svg(
    '<rect width="64" height="64" rx="16" fill="#2a2014"/><path d="M24 48L44 20" stroke="#8b5a2b" stroke-width="5" stroke-linecap="round"/><path d="M36 14l16 10-8 8z" fill="#c4923a"/>',
  ),
  "tool-pick-aether": svg(
    '<rect width="64" height="64" rx="16" fill="#161028"/><path d="M24 48L44 20" stroke="#9b7dff" stroke-width="5" stroke-linecap="round"/><path d="M36 14l16 10-8 8z" fill="#c9a8ff"/><circle cx="48" cy="18" r="3" fill="#fff6c8"/>',
  ),
  "hat-leaf": svg(
    '<rect width="64" height="64" rx="16" fill="#16321c"/><ellipse cx="32" cy="42" rx="16" ry="9" fill="#3d5a3a"/><path d="M20 30c8-16 24-16 24 2-8 2-16 2-24-2z" fill="#7ddea0"/><path d="M32 16v20" stroke="#16321c" stroke-width="2"/>',
  ),
  "hat-comet": svg(
    '<rect width="64" height="64" rx="16" fill="#121830"/><ellipse cx="32" cy="42" rx="14" ry="8" fill="#7fa7ff"/><path d="M18 30c8-8 16-14 22-16 2 6 2 12-2 16-8 2-16 2-20 0z" fill="#8fd4ff"/><circle cx="42" cy="16" r="5" fill="#ffd27a"/>',
  ),
  "furn-lantern": svg(
    '<rect width="64" height="64" rx="16" fill="#1a2030"/><path d="M32 10v8" stroke="#8aa0b8" stroke-width="3" stroke-linecap="round"/><rect x="22" y="18" width="20" height="6" rx="2" fill="#8aa0b8"/><path d="M24 24h16l4 22H20z" fill="#ffd27a"/><path d="M26 30h12" stroke="#fff6c8" stroke-width="2"/><rect x="20" y="46" width="24" height="4" rx="2" fill="#8aa0b8"/>',
  ),
};

const SPECIES_COLORS: Record<string, [string, string]> = {
  Blobbit: ["#5ec4ff", "#16324f"],
  Sprout: ["#7ddea0", "#16321c"],
  Mooncat: ["#c9e7ff", "#121830"],
  Cloudling: ["#e8eeff", "#3a5478"],
  Bunbounce: ["#ef9bb8", "#2a1c16"],
  Axobop: ["#ffcebe", "#2a1c16"],
  Pebblit: ["#8aa0b8", "#222830"],
  Starfin: ["#7fa7ff", "#121830"],
  Mushling: ["#e0a06a", "#16321c"],
  Boingle: ["#ffd27a", "#2a2316"],
};

function speciesIcon(name: string): string {
  const [fill, bg] = SPECIES_COLORS[name] ?? ["#7fa7ff", "#1a2030"];
  return svg(
    `<rect width="64" height="64" rx="16" fill="${bg}"/><circle cx="32" cy="34" r="16" fill="${fill}"/><circle cx="26" cy="30" r="3" fill="#09122c"/><circle cx="38" cy="30" r="3" fill="#09122c"/><path d="M26 40c4 4 8 4 12 0" fill="none" stroke="#09122c" stroke-width="2" stroke-linecap="round"/>`,
  );
}

const DISCOVERY_ICONS: Record<string, string> = {
  "discovery:stray_home": svg(
    '<rect width="64" height="64" rx="16" fill="#1a2030"/><path d="M12 36l20-16 20 16v16H12z" fill="#7fa7ff"/><rect x="28" y="40" width="8" height="12" fill="#ffd27a"/>',
  ),
  "discovery:streak_7": svg(
    '<rect width="64" height="64" rx="16" fill="#1a2030"/><path d="M32 10l4 14h14l-11 8 4 14-11-8-11 8 4-14-11-8h14z" fill="#ffd27a"/>',
  ),
};

function recipeIcon(recipeId: string): string {
  const foodId = recipeId.replace("recipe-", "food-");
  return ITEM_ICONS[foodId] ?? ITEM_ICONS["food-snack"]!;
}

/** Icon for an inventory item id (fish-ripple, ore-spark, …). */
export function itemIconSvg(itemId: string): string {
  if (ITEM_ICONS[itemId]) return ITEM_ICONS[itemId]!;
  if (itemId.startsWith("fish-")) return ITEM_ICONS["fish-ripple"]!;
  if (itemId.startsWith("ore-")) return ITEM_ICONS["ore-pebble"]!;
  if (itemId.startsWith("crop-")) return ITEM_ICONS["crop-sprout"]!;
  if (itemId.startsWith("food-")) return ITEM_ICONS["food-snack"]!;
  if (itemId.startsWith("ribbon-")) return ITEM_ICONS["ribbon-gold"]!;
  if (itemId.startsWith("loot-")) return ITEM_ICONS["loot-pebble"]!;
  if (itemId.startsWith("hat-")) return ITEM_ICONS["hat-ribbon"]!;
  if (itemId.startsWith("furn-")) return ITEM_ICONS["furn-cushion"]!;
  if (itemId.startsWith("frame-")) return ITEM_ICONS["frame-gold"]!;
  if (itemId.startsWith("tool-")) return ITEM_ICONS["tool-pick-iron"]!;
  return activityIconSvg("treasure");
}

/** Flatten an icon to a solid silhouette, dropping the rounded card background. */
export function silhouetteIconSvg(svgMarkup: string): string {
  return svgMarkup
    .replace(/<rect width="64" height="64"[^>]*>/g, "")
    .replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"')
    .replace(/stroke="(?!none)[^"]*"/g, 'stroke="currentColor"')
    .replace(/opacity="[^"]*"/g, 'opacity="1"')
    .replace(/<svg /, '<svg class="is-silhouette" ');
}

/** Icon for a collection entry id such as species:Boingle or discovery:fish:fish-ripple. */
export function collectionIconSvg(
  entryId: string,
  options: { silhouette?: boolean } = {},
): string {
  let icon = itemIconSvg(entryId);
  if (entryId.startsWith("species:"))
    icon = speciesIcon(entryId.slice("species:".length));
  else if (DISCOVERY_ICONS[entryId]) icon = DISCOVERY_ICONS[entryId]!;
  else if (entryId.startsWith("discovery:recipe:"))
    icon = recipeIcon(entryId.slice("discovery:recipe:".length));
  else {
    const prefixes = [
      "discovery:fish:",
      "discovery:treasure:",
      "discovery:crop:",
      "discovery:ore:",
      "discovery:ribbon:",
      "cosmetic:",
    ];
    for (const prefix of prefixes) {
      if (entryId.startsWith(prefix)) {
        icon = itemIconSvg(entryId.slice(prefix.length));
        break;
      }
    }
  }
  return options.silhouette ? silhouetteIconSvg(icon) : icon;
}

export function hasItemIcon(itemId: string): boolean {
  return itemId in ITEM_ICONS;
}
