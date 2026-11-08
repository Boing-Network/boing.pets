# Phase 6 — Gardening

## Goal
Third activity loop: plant → water → harvest on three garden slots.

## Loop
1. Sign `plant` with `{ slot, crop_id }`
2. Optional sign `water` to shorten grow time
3. Sign `harvest` when `now >= ready_at`
4. Awards crop inventory + Boinglets + collection discovery

## Migration
`migrations/0013_gardening.sql`

## World hook
Starter Town `station-garden` → `/#garden`
