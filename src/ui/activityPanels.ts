/** Shared activity panel markup used by fallback pages and pasture overlays. */

import type { ActivityId } from "../content/attempts";
import {
  ACTIVITY_AREA_LIST,
  type ActivityAreaMeta,
} from "../pasture3d/activityAreas";

export function metaForActivity(activity: ActivityId): ActivityAreaMeta {
  const meta = ACTIVITY_AREA_LIST.find((item) => item.activity === activity);
  if (!meta) throw new Error(`No pasture area for activity ${activity}`);
  return meta;
}

/** Inner section HTML (no #notice). IDs match the existing page hooks. */
export function activityPanelHtml(activity: ActivityId): string {
  switch (activity) {
    case "fishing":
      return `<section id="fishing" class="panel activity-panel"><div class="section-title"><div><p class="eyebrow">INTERACTIVE LOOP</p><h2>Pond pier fishing</h2></div></div><p id="fishing-summary" class="subtle">Connect, hatch a buddy, then play the timing reel — only sign if you want to keep a catch.</p><div class="actions"><button id="fish-cast" type="button">Cast · play</button></div><div id="fish-minigame" class="minigame-stage" hidden></div><div id="fish-log" class="market-grid"></div><p class="small">3 attempts per UTC day. Misses cost an attempt but never a wallet signature. Claim a success with Express to add fish + Boinglets.</p></section>`;
    case "treasure":
      return `<section id="treasure" class="panel activity-panel"><div class="section-title"><div><p class="eyebrow">INTERACTIVE LOOP</p><h2>Treasure dig</h2></div></div><p id="treasure-summary" class="subtle">Connect, hatch a buddy, memorize the glowing tile, then dig — sign only to keep loot.</p><div class="actions"><button id="treasure-start" type="button">Start dig · play</button></div><div id="treasure-minigame" class="minigame-stage" hidden></div><div id="treasure-log" class="market-grid"></div><p class="small">3 attempts per UTC day. Wrong tiles use an attempt with no signature. Claim successes for loot + Boinglets.</p></section>`;
    case "garden":
      return `<section id="garden" class="panel activity-panel"><div class="section-title"><div><p class="eyebrow">INTERACTIVE LOOP</p><h2>Garden beds</h2></div></div><p id="garden-summary" class="subtle">Connect, hatch a buddy, then time your watering hold for foraged greens — sign only to keep the harvest.</p><div class="actions"><button id="garden-play" type="button">Tend · play</button></div><div id="garden-minigame" class="minigame-stage" hidden></div><div class="social-form"><label>Crop <select id="garden-crop"></select></label></div><div id="garden-plots" class="garden-plots"></div><p class="small">3 play attempts per UTC day for the watering mini-game. Plot plant/water/harvest still available with signatures. Missed holds cost an attempt, not a signature.</p></section>`;
    case "cook":
      return `<section id="kitchen" class="panel activity-panel"><div class="section-title"><div><p class="eyebrow">INTERACTIVE LOOP</p><h2>Pasture kitchen</h2></div></div><p id="kitchen-summary" class="subtle">Connect, hatch a buddy, then tap ingredients in the secret order — sign only to keep the snack.</p><div class="actions"><button id="cook-play" type="button">Cook · play</button></div><div id="cook-minigame" class="minigame-stage" hidden></div><div id="kitchen-recipes" class="market-grid"></div><h3 class="subtle">Ready to serve</h3><div id="kitchen-dishes" class="market-grid"></div><p class="small">3 play attempts per UTC day for the recipe mini-game. Classic cook/serve recipes still work with signatures. Wrong orders cost an attempt, not a signature.</p></section>`;
    case "mining":
      return `<section id="mining" class="panel activity-panel"><div class="section-title"><div><p class="eyebrow">INTERACTIVE LOOP</p><h2>Crystal cavern mine</h2></div></div><p id="mining-summary" class="subtle">Connect, hatch a buddy, then crack the vein with a key combo under the clock — sign only to keep ore.</p><div class="actions"><button id="mine-swing" type="button">Swing · play</button></div><div id="mine-minigame" class="minigame-stage" hidden></div><div id="mine-log" class="market-grid"></div><p class="small">3 attempts per UTC day. Wrong or slow combos use an attempt with no signature. Claim successes for ore + Boinglets.</p></section>`;
    case "racing":
      return `<section id="racing" class="panel activity-panel"><div class="section-title"><div><p class="eyebrow">INTERACTIVE LOOP</p><h2>Pet racing</h2></div></div><p id="racing-summary" class="subtle">Connect, hatch a buddy, then tap the rhythm beats — sign only for a ribbon you want to keep.</p><div class="actions"><button id="race-start" type="button">Line up · play</button></div><div id="race-minigame" class="minigame-stage" hidden></div><div id="race-log" class="market-grid"></div><p class="small">3 attempts per UTC day. Off-beat taps cost an attempt, not a signature. Claim for ribbons + Boinglets.</p></section>`;
  }
}

export function activityDeskPageHtml(activity: ActivityId): string {
  const meta = metaForActivity(activity);
  const panel = activityPanelHtml(activity);
  const intended = `<p class="small activity-pasture-hint">The intended spot is the ${meta.title} in the <a href="/#${meta.hash}">public pasture</a>. This page is a fallback desk.</p>`;
  // Insert the hint before the closing section tag.
  return `<div id="notice" role="status" aria-live="polite">Loading\u2026</div>${panel.replace("</section>", `${intended}</section>`)}`;
}

export function activityFallbackNote(activity: ActivityId): string {
  const meta = metaForActivity(activity);
  return `The full desk is also at <a href="${meta.fallbackPath}">${meta.fallbackPath}</a>.`;
}
