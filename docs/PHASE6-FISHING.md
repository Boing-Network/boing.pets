# Phase 6 — First activity: fishing

## Goal

Ship the first of 25 activity loops: cast → wait → reel timing with soft rewards.

## Loop

1. Player signs a cast (`POST /api/fishing/challenge`)
2. Server commits fish id + `bite_at` + reel window into the challenge
3. Client waits, then reels (`POST /api/fishing/confirm` + signature)
4. Confirm inside the window awards inventory fish, Boinglets (`reason: fishing_reward`), and a collection discovery
5. Confirm outside the window = miss (no reward); before bite = 409

## Limits

- 3 successful catches / UTC day (`fishing_catches`)
- 8 cast challenges / minute / owner
- Requires a hatched pet

## Migration

`migrations/0008_fishing.sql`

## World hook

Starter Town `station-fish` (Pond Pier) → `/fishing.html`

## Still open

Rod tiers, beach zone mesh, sell fish on market, rare weight tables by season
