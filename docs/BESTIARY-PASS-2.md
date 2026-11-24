# Bestiary pass 2: more species, realism, glow, and a UX audit

## What changed

**Fourteen new species (ids 22–35), two per territory**, so every territory
now hosts five. Appended only; ids 1–21 are untouched, and founders 1–42 of
the seed-1 world keep their ids, names, and genes.

| Territory     | New species                   |
| ------------- | ----------------------------- |
| Meadow        | Clover Vole, Amber Kestrel    |
| Thicket       | Thorn Porcupine, Briar Weasel |
| Ridge         | Ledge Goat, Mist Swift        |
| Moonlit Glade | Opal Dormouse, Hush Owl       |
| Glowfen       | Lumen Frog, Reed Muskrat      |
| Elder Grove   | Elder Bear, Acorn Jay         |
| High Crags    | Rime Cat, Gale Chough         |

They fill real gaps: the first 21 had no frog, no bear, no corvid, no raptor
other than owls, no swift, no porcupine, and only one species of goat-like
grazer in the whole map. Body plans are reused where possible (rodent,
mustelid, bovid, felid, owl); new plan names are `raptor`, `swift`, `corvid`,
`ursid`, `anuran`, built from the existing `quadruped` and `bird` builders.

**Territory capacities were raised for new worlds** (meadow 64, thicket 50,
ridge 34, glade 58, fen 50, grove 46, crags 36; sum 338, was 201) because
70 founders do not fit where 42 did.

### Glow palette

Each species has one restrained glow that says something about the animal.
Neighbours in a territory use different hues.

| Glow              | Species and where                                                                    |
| ----------------- | ------------------------------------------------------------------------------------ |
| Clover green-gold | Clover Vole: pollen flecks on the back                                               |
| Amber             | Amber Kestrel: wing bar, lit underparts. Ledge Goat: lichen rings on horns and beard |
| Lime-gold         | Thorn Porcupine: quill tips                                                          |
| Crimson           | Briar Weasel: bramble-berry bib                                                      |
| Fog blue          | Mist Swift: trailing wing tips                                                       |
| Opal shimmer      | Opal Dormouse: pink, cyan and gold wash across back and tail                         |
| Moon-milk white   | Hush Owl: facial disc and wing speckles                                              |
| Mint-cyan         | Lumen Frog: lumen spots and a lantern throat sac (brightest in the world)            |
| Sedge gold        | Reed Muskrat: sheen on wet fur                                                       |
| Fungal green      | Elder Bear: bracket fungi along the spine                                            |
| Cobalt            | Acorn Jay: barred wing patch                                                         |
| Ice blue          | Rime Cat: frost crystals in the coat                                                 |
| Violet            | Gale Chough: sheen on glossy black wings                                             |

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

## Realism pass 3: a measured proportion audit

Unlike the earlier passes this one is measured rather than eyeballed. Each
anatomy now keeps its source spec (`Anatomy.shape`), so the proportions of
every quadruped and flying bird can be computed without rendering and compared
with its real animal: shoulder height / nose-to-rump length, tail / length,
head / length, ear / head (and wingspan, tail and bill for birds). The
references (rough field measurements) and tolerances live in
`apps/client/test/anatomy-proportions.test.ts`, which now guards them. The
tolerances are wide on purpose: this is a stylised game, so the test catches
clear drift, not artistic choices.

What the audit found and what changed:

- **Bird tails and wings were too short.** Tails were 19–28% of body length
  against 33–44% in life, and wings read short on the Kestrel, Owls, Nightjar
  and Chough. Tails were lengthened on all seven flying birds, wings on the
  Kestrel (0.34 → 0.44), Hush Owl, Crag Owl, Nightjar and Chough, and the
  wing-position glow patterns (kestrel bar, nightjar flash) were moved to
  follow the longer wings.
- **Small-mammal tails were stubs.** Lengthened on Briar Weasel, Barrow Badger,
  Slate Marmot, Dew Shrew, Clover Vole, Opal Dormouse, Reed Muskrat (0.16 →
  0.26) and Rime Cat (0.30 → 0.40).
- **Heads were large for their bodies** (up to 1.7x real) and ears small
  against them. Heads were trimmed on the Fire Fox, Moon Hare, Barrow Badger and
  Thorn Porcupine, and ears enlarged on the Ram, Hog, Badger, Raccoon, Wolf,
  Goat, Muskrat and Bear. The Moon Hare's ears were slightly shortened (0.15 →
  0.11) because the fix to its head made them 1.4x the real ratio.
- **Deer were leggy.** Moss Stag and Silver Deer stood at 0.75 and 0.77 of
  body length against 0.63 in life; leg height was cut (0.30 → 0.27 and 0.27 →
  0.235), and the stag's neck mane moved down to match.
- **Sizes in the world now follow one curve.** Small animals are enlarged so
  they stay visible, which is fine as long as it is consistent
  (world size ~ real size^0.56). Species off that curve were rescaled: Stone
  Pika 1.8 → 2.3, Hollow Squirrel 1.9 → 2.3, Opal Dormouse 1.8 → 2.1, Slate
  Marmot 2.2 → 2.5, Moon Hare 2.45 → 2.8, Thistle Hog 2.7 → 3.1, Ledge Goat
  3.0 → 3.3 (too small), and Amber Kestrel 2.3 → 1.8, Reed Heron 3.0 → 2.0,
  Briar Weasel 2.4 → 2.1, Dew Shrew 1.6 → 1.45, Hush Owl 2.1 → 1.9, Field
  Nightjar 1.9 → 1.75 (too big).

Not covered by the audit: the Lantern Moth, Gloam Bat, Glow Tortoise and Ember
Newt, which use their own builders and keep no spec; and anything about how a
creature actually looks (coat, markings, gait, the glow itself), which needs a
person looking at `/world/?bestiary`.

## Batch 3: seven more species (ids 36–42)

One more per territory, each a body type the bestiary did not have. Founders
1–70 of the seed-1 world are unchanged; 71–84 are new.

| Territory     | Species         | Body                          | Glow                                        |
| ------------- | --------------- | ----------------------------- | ------------------------------------------- |
| Meadow        | Candle Hedgehog | hedgehog (quadruped + spines) | candle-gold spine tips                      |
| Thicket       | Veil Marten     | mustelid                      | silver-lavender veil over the cream bib     |
| Ridge         | Tarn Eagle      | raptor                        | storm blue along the wing tips, sunlit nape |
| Moonlit Glade | Halo Loris      | primate (quadruped)           | warm ring around the huge eyes              |
| Glowfen       | Wisp Otter      | mustelid                      | aqua bioluminescent water on the fur        |
| Elder Grove   | Saddle Tapir    | tapirid (quadruped)           | faintly moonlit pale saddle                 |
| High Crags    | Aurora Yak      | bovid                         | aurora green-to-violet along the hair skirt |

Their proportions were designed against the real animals using the audit from
realism pass 3 (references added to `anatomy-proportions.test.ts`), so no
species is outside tolerance. Adding the new points also showed the Acorn Jay
was 1.3x over the size curve, so it was scaled down (2.1 to 1.75).

Capacities rose again for new worlds (meadow 76, thicket 60, ridge 40, glade
68, fen 60, grove 56, crags 60; sum 420) and `TERRITORY_CAPACITY_VERSION` is
now 3, so deployed worlds are raised on boot by the existing upgrade. The
ecology harness needed the Crags bump: with six species on Crags at capacity
42 the Slate Marmot (which lives there) fell to one survivor on seed 1, and at
50 the Crag Ram did on seed 7. Raising Ridge made no difference; raising Crags
to 60 fixed both.

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
- **Species renders.** Done: `public/media/species/<slug>.webp` for the 14
  new species, captured from the dev bestiary (`/world/?bestiary=<slug>&capture=1`).

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
- `anatomy.test.ts` (unique body shapes, triangle budget) and the new
  `anatomy-proportions.test.ts` (it passes here against a stub of `three`, since
  it only reads specs, but should be run on a real checkout too);
- the `apps/sim-host` tests whose counts were updated (42 → 70, 21 → 35);
- the React HUD components, which were type-checked against loose stubs only.
