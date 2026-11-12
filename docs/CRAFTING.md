# Crafting table

Players combine activity resources (ores, loot, crops) into existing catalog items at the **Crafting Station** in the public pasture. A `/craft` page is a fallback desk only.

## Recipes

| Recipe                | Inputs                                                            | Output                               |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| Forge an Iron Pick    | 3 Pasture Pebble, 1 Spark Ore                                     | 1 Iron Pick (`tool-pick-iron`)       |
| Crystal-tip a Pick    | 1 Iron Pick, 2 Boing Crystal, 1 Spark Ore                         | 1 Crystal Pick (`tool-pick-crystal`) |
| Stuff a Trail Cushion | 2 Bounce Sprout, 1 Foraged Greens (`crop-forage`), 1 Lucky Pebble | 1 Bounce Cushion (`furn-cushion`)    |
| Assemble a Sun Lamp   | 1 Sun Shard, 1 Spark Ore, 1 Pasture Berry                         | 1 Meadow Lamp (`furn-lamp`)          |
| Weave a Ribbon Hat    | 2 Map Scrap, 1 Pasture Berry                                      | 1 Pasture Ribbon (`hat-ribbon`)      |

No new on-chain item ids. Pets, the Wood Pick, race ribbons, and Kitchen food cannot be crafted. Cooked snacks stay in the Kitchen and still use `COOK_DAILY_CAP`.

`crop-forage` is an existing off-chain activity item (not on the 24-item on-chain map). It is only used as an input.

## Inventory

Crafting is server-authoritative:

1. `POST /api/craft/challenge` checks hatch, daily cap (10 / UTC day), and current stacks, then issues a signed challenge.
2. `POST /api/craft/confirm` verifies the signature, re-checks inputs and the cap, then atomically consumes inputs, grants the output, writes `craft_log`, and records `inventory_acquisitions` with source `craft` (so the 24h market hold still applies).
3. Withdraw remains optional and unchanged.

Local migration `0027_crafting_table.sql` adds `craft_challenges` and `craft_log`. Do not apply it remotely until a deploy is approved.

## Pasture stations

- Crafting Station landmark/station at `(-16, 12)`, interact radius `3.4`.
- Market Stall at `(16, 12)`, same radius, reuses `/api/marketplace` and `/api/economy/*`.
- Collision uses shared `obstaclesForZone` / `clampPresencePosition`.
- Closing the overlay (Esc or Close) returns the player to the pasture without a route change.

## Expansion recipes

New Crafting Station recipes that mix earlier resources with the rarity expansion
(see `docs/ITEMS.md` for the full item table):

- Assemble a Glow Lantern: Sun Shard + Emberite + Honeyroot
- Weave a Leaf Cap: Bounce Sprout x2 + Honeyroot + Wind Bell
- Forge an Aether Pick: Crystal Pick + Aetherite x2 + Comet Bead
- Set a Comet Pin: Comet Bead + Aetherite + Starglider Bloom

Kitchen (not this table) also gained Honeyroot Tart and Starlit Broth.
