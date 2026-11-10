# Phase 6 — Mining

## Goal

Fifth activity loop: spend daily stamina to strike ore veins on a timing window; upgrade pickaxes for rarer ores.

## Loop

1. Sign `challenge` to raise the pick (server commits ore + strike timestamp)
2. Wait for the weak spot, then sign `confirm` inside the strike window
3. Hit → ore inventory + Boinglets + collection discovery + stamina cost
4. Miss → 1 stamina spent, no ore

## Stamina

10 points per UTC day (`mining_stamina`).

## Pickaxe tiers

| Tier | Source                     | Unlocks       |
| ---- | -------------------------- | ------------- |
| 1    | Default (wood)             | Pebble, Spark |
| 2    | Market `tool-pick-iron`    | + Crystal     |
| 3    | Market `tool-pick-crystal` | Best rolls    |

## Migration

`migrations/0015_mining.sql`

## On-chain items

Optional: mined ore can be withdrawn to the player's wallet as Boing reference multi-token items (`ore-pebble` #1, `ore-spark` #2, `ore-crystal` #3). See `docs/ONCHAIN-ITEMS.md`.

## World hook

Starter Town `station-mine` → `/mining.html`
