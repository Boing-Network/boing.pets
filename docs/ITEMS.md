# Boing Pets items and rarities

This is the catalog of stackable items after the rarity and resource expansion.
Pets stay unique NFTs and are never crafted or listed. Race ribbons (ids 50-52)
and the starter Wood Pick (id 60) stay reserved and off-chain.

Rarity is used in inventory badges, craft and kitchen copy, market filters, and
activity drop tables: **Common**, **Uncommon**, **Rare**, **Epic**, **Legendary**.
Legendary matches the existing care-drop "premium" pity and weekly cap
(Stardust Halo, Aurora Frame).

On-chain metadata JSON for **new** ids lives in `docs/metadata/items/`. Those
files are prepared only. Do **not** broadcast `boing items set-metadata`
transactions until Nico approves the new token ids and art.

## Item table

| Id  | Game id           | Name             | Category  | Rarity    | How to get it                         | On-chain | Sellable |
| --- | ----------------- | ---------------- | --------- | --------- | ------------------------------------- | -------- | -------- |
| 1   | ore-pebble        | Pasture Pebble   | Ores      | Common    | Mining                                | yes      | yes      |
| 2   | ore-spark         | Spark Ore        | Ores      | Uncommon  | Mining                                | yes      | yes      |
| 3   | ore-crystal       | Boing Crystal    | Ores      | Rare      | Mining (Iron Pick or better)          | yes      | yes      |
| 4   | ore-emberite      | Emberite         | Ores      | Rare      | Mining (Iron Pick or better)          | yes      | yes      |
| 5   | ore-aetherite     | Aetherite        | Ores      | Epic      | Mining (Crystal Pick or better)       | yes      | yes      |
| 10  | fish-ripple       | Ripple Minnow    | Fish      | Common    | Fishing                               | yes      | yes      |
| 11  | fish-boingfin     | Boingfin         | Fish      | Uncommon  | Fishing                               | yes      | yes      |
| 12  | fish-moonkoi      | Moon Koi         | Fish      | Rare      | Fishing                               | yes      | yes      |
| 13  | fish-copperfin    | Copperfin        | Fish      | Uncommon  | Fishing                               | yes      | yes      |
| 14  | fish-starfin      | Starfin          | Fish      | Epic      | Fishing                               | yes      | yes      |
| 20  | loot-pebble       | Lucky Pebble     | Loot      | Common    | Treasure dig                          | yes      | yes      |
| 21  | loot-map-scrap    | Map Scrap        | Loot      | Uncommon  | Treasure dig                          | yes      | yes      |
| 22  | loot-sun-shard    | Sun Shard        | Loot      | Rare      | Treasure dig                          | yes      | yes      |
| 23  | loot-wind-bell    | Wind Bell        | Loot      | Uncommon  | Treasure dig                          | yes      | yes      |
| 24  | loot-comet-bead   | Comet Bead       | Loot      | Epic      | Treasure dig                          | yes      | yes      |
| 30  | crop-sprout       | Bounce Sprout    | Crops     | Common    | Garden                                | yes      | yes      |
| 31  | crop-berry        | Pasture Berry    | Crops     | Uncommon  | Garden                                | yes      | yes      |
| 32  | crop-moonbloom    | Moonbloom        | Crops     | Rare      | Garden                                | yes      | yes      |
| 33  | crop-honeyroot    | Honeyroot        | Crops     | Uncommon  | Garden                                | yes      | yes      |
| 34  | crop-starglider   | Starglider Bloom | Crops     | Epic      | Garden                                | yes      | yes      |
| 40  | food-sprout-salad | Sprout Salad     | Food      | Common    | Kitchen                               | yes      | yes      |
| 41  | food-berry-glaze  | Berry Glaze Fish | Food      | Uncommon  | Kitchen                               | yes      | yes      |
| 42  | food-moon-feast   | Moon Feast       | Food      | Rare      | Kitchen                               | yes      | yes      |
| 43  | food-honey-tart   | Honeyroot Tart   | Food      | Uncommon  | Kitchen                               | yes      | yes      |
| 44  | food-starlit      | Starlit Broth    | Food      | Epic      | Kitchen                               | yes      | yes      |
| 50  | ribbon-gold       | Gold Ribbon      | Cosmetics | Rare      | Racing (reserved, off-chain)          | no       | no       |
| 51  | ribbon-silver     | Silver Ribbon    | Cosmetics | Uncommon  | Racing (reserved, off-chain)          | no       | no       |
| 52  | ribbon-bronze     | Bronze Ribbon    | Cosmetics | Common    | Racing (reserved, off-chain)          | no       | no       |
| 60  | tool-pick-wood    | Wood Pick        | Tools     | Common    | Starter tool (reserved, off-chain)    | no       | no       |
| 61  | tool-pick-iron    | Iron Pick        | Tools     | Uncommon  | Crafting Station or catalog           | yes      | yes      |
| 62  | tool-pick-crystal | Crystal Pick     | Tools     | Rare      | Crafting Station or catalog           | yes      | yes      |
| 63  | tool-pick-aether  | Aether Pick      | Tools     | Epic      | Crafting Station or catalog           | yes      | yes      |
| 70  | hat-ribbon        | Pasture Ribbon   | Cosmetics | Common    | Care drop or catalog                  | yes      | yes      |
| 71  | hat-antenna       | Glow Antenna     | Cosmetics | Uncommon  | Care drop or catalog                  | yes      | yes      |
| 72  | hat-stardust      | Stardust Halo    | Cosmetics | Legendary | Care drop or Sparkles catalog         | yes      | yes      |
| 73  | frame-gold        | Gold Card Frame  | Cosmetics | Rare      | Care drop or catalog                  | yes      | yes      |
| 74  | frame-aurora      | Aurora Frame     | Cosmetics | Legendary | Care drop or Sparkles catalog         | yes      | yes      |
| 75  | furn-cushion      | Bounce Cushion   | Furniture | Uncommon  | Care drop, craft, or catalog          | yes      | yes      |
| 76  | furn-lamp         | Meadow Lamp      | Furniture | Rare      | Care drop, craft, or catalog          | yes      | yes      |
| 77  | hat-leaf          | Leaf Cap         | Cosmetics | Uncommon  | Care drop, craft, or catalog          | yes      | yes      |
| 78  | furn-lantern      | Glow Lantern     | Furniture | Rare      | Care drop, craft, or catalog          | yes      | yes      |
| 79  | hat-comet         | Comet Pin        | Cosmetics | Epic      | Care drop, craft, or Sparkles catalog | yes      | yes      |
| -   | crop-forage       | Foraged Greens   | Crops     | Common    | Garden forage (off-chain craft input) | no       | no       |

Market exclusions are unchanged: pets, Wood Pick, ribbons 50-52, equipped or
placed items, and the 0.1 testnet BOING minimum.

## New crafting recipes

| Recipe                  | Inputs                                  | Output       |
| ----------------------- | --------------------------------------- | ------------ |
| Assemble a Glow Lantern | Sun Shard, Emberite, Honeyroot          | Glow Lantern |
| Weave a Leaf Cap        | Bounce Sprout x2, Honeyroot, Wind Bell  | Leaf Cap     |
| Forge an Aether Pick    | Crystal Pick, Aetherite x2, Comet Bead  | Aether Pick  |
| Set a Comet Pin         | Comet Bead, Aetherite, Starglider Bloom | Comet Pin    |

Existing iron/crystal picks, trail cushion, sun lamp, and ribbon hat recipes are unchanged.

## New kitchen recipes

| Recipe         | Inputs                    | Output         |
| -------------- | ------------------------- | -------------- |
| Honeyroot Tart | Honeyroot, Pasture Berry  | Honeyroot Tart |
| Starlit Broth  | Starglider Bloom, Starfin | Starlit Broth  |

## Activity drop-rate changes

Weights still sum to 100 inside each activity table. Rarer items have lower weight.
New resources were added in the unused id gaps; existing items stay at their ids.

- Mining (wood pick sees only common/uncommon): Pebble 46, Spark 24, Emberite 14 (tier 2+), Crystal 12 (tier 2+), Aetherite 4 (tier 3+). Aether Pick is tier 4.
- Fishing: Ripple 48, Boingfin 24, Copperfin 16, Moon Koi 9, Starfin 3.
- Treasure: Lucky Pebble 46, Map Scrap 24, Wind Bell 16, Sun Shard 10, Comet Bead 4.
- Care cosmetic table (still sums to 1000, 15% hit chance): Ribbon 340, Antenna 180, Leaf Cap 120, Cushion 100, Meadow Lamp 80, Glow Lantern 70, Gold Frame 50, Comet Pin 30, Stardust Halo 20, Aurora Frame 10. Legendary (formerly "premium") keeps the weekly cap and hard pity.

No D1 migration is required: inventory is already keyed by `item_id`, and rarity lives in code.
