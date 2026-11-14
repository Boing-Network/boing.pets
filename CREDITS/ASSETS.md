# The Yard — 3D asset licenses

All kit models shipped in `public/yard-kits/` are **Creative Commons CC0 1.0**
(public domain dedication). They were downloaded from the official Kenney.nl
source pages after confirming the license on each page, and the same CC0 grant
is included in each pack’s `License.txt`. Credit is optional; Kenney is
credited here in thanks.

CC0 deed: https://creativecommons.org/publicdomain/zero/1.0/

## Packs used

| Pack                  | Version | Official source (license confirmed)          | License file in pack          |
| --------------------- | ------- | -------------------------------------------- | ----------------------------- |
| City Kit Roads        | 2.2     | https://kenney.nl/assets/city-kit-roads      | License: Creative Commons CC0 |
| City Kit (Commercial) | 2.1     | https://kenney.nl/assets/city-kit-commercial | License: Creative Commons CC0 |
| City Kit (Industrial) | 2.0     | https://kenney.nl/assets/city-kit-industrial | License: Creative Commons CC0 |
| City Kit (Suburban)   | 2.0     | https://kenney.nl/assets/city-kit-suburban   | License: Creative Commons CC0 |
| Furniture Kit         | 2.0     | https://kenney.nl/assets/furniture-kit       | License: Creative Commons CC0 |
| Food Kit              | —       | https://kenney.nl/assets/food-kit            | License: Creative Commons CC0 |
| Nature Kit            | 2.1     | https://kenney.nl/assets/nature-kit          | License: Creative Commons CC0 |
| Mini Skate            | 2.0     | https://kenney.nl/assets/mini-skate          | License: Creative Commons CC0 |

Created / distributed by Kenney (www.kenney.nl). You may use this content for
personal, educational, and commercial purposes. Support by crediting “Kenney”
or “www.kenney.nl” is appreciated, not required.

## Optimized files in this repo

Only a curated subset is shipped (road and sidewalk tiles, streetlights,
storefronts, suburban houses, skyline silhouettes, a food stall kit, furniture
and food props, planters, an oak, rocks, and modular skate-bowl pieces). Source zips are not committed. Each GLB was converted / optimized with
gltf-transform (`dedup`, `weld`, `quantize`, meshopt, texture resize to 512 and
WebP). See `scripts/optimize-yard-kits.mjs` and `public/yard-kits/manifest.json`
for the current byte sizes.

Packs that were considered but **not** used, because they are not verifiably
CC0, include typical Quaternius packs under the Quaternius Asset License (QAL).
Do not add QAL-only models to this folder.

## Nico-provided street character and props

The playable character body (`public/characters/street-body.glb`, root
`StreetBody`) and the city props in `public/street-props/` were provided by
Nico Chikuji for Boing Pets / The Yard. They are not Kenney CC0 assets.

Shipped singles, already pivoted to a y=0 base and compressed with
gltf-transform (meshopt + WebP, textures capped at 1024): Fat Caps, Tagged
Hydrant, Sticker Box, Wheatpaste, Pigeon Drum, Corner Store, Night Cart, Site
Fence, Wood Crate, Tagged Cone, and Walk-Up. The AlleyKit (a1) and BlockKit
(a2) bundles were skipped because they duplicate those singles. See
`scripts/optimize-street-props.mjs` and `public/street-props/manifest.json`
for byte sizes.
