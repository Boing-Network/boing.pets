# Bestiary pass 2: more species, realism, glow, and a UX audit

## What changed

**Fourteen new species (ids 22–35), two per territory**, so every territory
now hosts five. Appended only; ids 1–21 are untouched, and founders 1–42 of
the seed-1 world keep their ids, names, and genes.

| Territory | New species |
| --- | --- |
| Meadow | Clover Vole, Amber Kestrel |
| Thicket | Thorn Porcupine, Briar Weasel |
| Ridge | Ledge Goat, Mist Swift |
| Moonlit Glade | Opal Dormouse, Hush Owl |
| Glowfen | Lumen Frog, Reed Muskrat |
| Elder Grove | Elder Bear, Acorn Jay |
| High Crags | Rime Cat, Gale Chough |

They fill real gaps: the first 21 had no frog, no bear, no corvid, no raptor
other than owls, no swift, no porcupine, and only one species of goat-like
grazer in the whole map. Body plans are reused where possible (rodent,
mustelid, bovid, felid, owl); new plan names are `raptor`, `swift`, `corvid`,
`ursid`, `anuran`, built from the existing `quadruped` and `bird` builders.

**Territory capacities were raised for new worlds** (meadow 64, thicket 50,
ridge 34, glade 58, fen 50, grove 46, crags 30; sum 332, was 201) because
70 founders do not fit where 42 did.

### Glow palette

Each species has one restrained glow that says something about the animal.
Neighbours in a territory use different hues.

| Glow | Species and where |
| --- | --- |
| Clover green-gold | Clover Vole: pollen flecks on the back |
| Amber | Amber Kestrel: wing bar, lit underparts. Ledge Goat: lichen rings on horns and beard |
| Lime-gold | Thorn Porcupine: quill tips |
| Crimson | Briar Weasel: bramble-berry bib |
| Fog blue | Mist Swift: trailing wing tips |
| Opal shimmer | Opal Dormouse: pink, cyan and gold wash across back and tail |
| Moon-milk white | Hush Owl: facial disc and wing speckles |
| Mint-cyan | Lumen Frog: lumen spots and a lantern throat sac (brightest in the world) |
| Sedge gold | Reed Muskrat: sheen on wet fur |
| Fungal green | Elder Bear: bracket fungi along the spine |
| Cobalt | Acorn Jay: barred wing patch |
| Ice blue | Rime Cat: frost crystals in the coat |
| Violet | Gale Chough: sheen on glossy black wings |

## Realism and glow pass on species 1–21

Every existing species was reviewed against its own art note ("Moonlight caught
in the ear tips", "dewdrop mint on the snout") and several did not actually
show it. Fixes:

- **Glows that were nearly invisible:** Glow Tortoise shell seams 0.09 → 0.40;
  Gloam Bat wing membrane 0.07 → 0.14 plus glowing veins that fan out from the
  arm; Moon Hare ears 0.18 → 0.34; Stone Pika ear rims 0.12 → 0.26; Silver
  Deer dapples 0.12 → 0.26; Field Nightjar wing flash 0.12 → 0.30; Reed Heron
  crest 0.15 → 0.30; Lantern Moth eyespots 0.25 → 0.50 plus an edge rim.
- **Glows the art note described but the model lacked:** Moss Stag lichen
  patches (green, now cyan-lit), Shade Lynx ear tufts, Barrow Badger lamp
  stripe, Dusk Raccoon mask rim, Slate Marmot whisker pads, Crag Owl facial
  disc, Crag Ram horn ridges (one glint → every other ring).
- **New glow where it fit the animal:** Fire Fox tail tip burns like a coal and
  embers drift in its coat; Ash Wolf embers; Dew Shrew dew beads; Hollow
  Squirrel tail warms toward its tip; Thistle Hog quill tips 0.12 → 0.30.
- **Anatomy and markings:** Fire Fox and Shade Lynx cheek ruffs; Moss Stag
  shaggy neck and pale rump patch; Thistle Hog tusks; Silver Deer rump patch;
  Moon Hare, Slate Marmot, Barrow Badger and Ash Wolf grizzle and saddle
  markings; paler muzzle on marmot and nightjar throat.

New shared helpers live in `anatomy/patterns.ts` (`glowSpeckle`,
`tailTipGlow`, `cheekRuff`, `quillField`, `combine`).

## UX audit: what was found and what was done

Done in this pass (client only, all in `apps/client/src/hud/`):

1. **Creature finding was a flat wall of names** (now 70 at the start). The
   inspection panel listed every living creature as one wrapped row of
   buttons. Replaced with `CreatureFinder`: search by name or species, a
   species filter with counts, and a grouped list with each species' glow
   colour. Used both when nothing is selected and in a collapsible "Switch
   creature" section.
2. **Needs were raw numbers** (`hunger 420`). Now a word and a meter ("peckish",
   "tired") with `role="meter"`, colour by severity, and the raw 0–1000 value
   as a tooltip (`needs.ts`).
3. **Relatives were shown as `#123`.** Pairs, mother and father now show names
   (falling back to the id when the relative is not in view).
4. **Influences gave no feedback and no reasons.** Buttons did nothing visible
   when clicked and disabled controls never said why. There is now an
   `aria-live` confirmation line, a "Target: <creature>" line, a note when no
   creature is selected, and `title` text explaining each disabled control.
5. **No orientation on first visit.** The world is already moving when a
   player arrives and nothing said what they could do. `IntroTip` shows three
   lines once per browser (look, nudge, time), then stays out of the way.
6. **Keyboard focus** is now visible on the finder and influence controls, and
   reduced-motion is respected for the panels.
7. **Marketing gallery** showed broken images for species without a render
   yet. It now falls back to a placeholder tinted with the species' colours.

Found but not done (needs more than a client change, or art/design input):

- **Show the influence budget.** The client is never told how many of the 3
  daily influences remain or when one frees up, so the panel can only say
  "3 per rolling day". Expose `{used, limit, nextFreeAtMs}` in the world view
  and render "2 of 3 left, next in 5h". This is the biggest remaining UX gap.
- **Live events.** `query.events` exists but births, deaths and migrations are
  not surfaced as they happen. A small activity feed or toasts that click
  through to the creature would make the world feel alive.
- **Selecting from the world.** Far creatures are instanced meshes; add a
  follow-camera and a "find on map" action from the finder.
- **Territory overlays.** The per-territory effect and capacity text is dense
  at night; use icons, a legend and a colour-blind-safe palette.
- **Touch and accessibility.** Check touch target sizes on phones, add keyboard
  navigation for the canvas, and give HUD state text equivalents.
- **Sign-in friction.** Explain what a wallet unlocks at the point a guest
  first hits a limit.
- **Species renders.** The marketing gallery needs
  `public/media/species/<slug>.webp` for the 14 new species. Capture them from
  the dev bestiary (`/world/?bestiary=<slug>`).

## Deploying into an existing world

`introduceSpecies` adds the 14 new species (two founders each) on boot. It does
**not** change territory capacities, because territory rows are written only
when a world is created. In a deployed world the new species therefore share
the old capacities. The ecology harness was run this way: nothing goes extinct
in 150 days, but several species end thin (2–3 alive). If that matters, extend
`introduceSpecies` to raise stored capacities to the catalog value, and persist
them through the dirty set.

## Not verified here

This pass was written in a sandbox with no `node_modules` for `three`,
`react`, `zustand` or Prisma, and no browser. The sim, contract and pure-logic
tests were run (see below). The following were not, and need a pass on a real
checkout:

- the creature renders (new anatomies, glow placement, tuning of world scales
  in `materials.ts`), via `/world/?bestiary`;
- `anatomy.test.ts` (unique body shapes, triangle budget);
- the `apps/sim-host` tests whose counts were updated (42 → 70, 21 → 35);
- the React HUD components, which were type-checked against loose stubs only.
