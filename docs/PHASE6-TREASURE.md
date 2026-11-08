# Phase 6 — Treasure dig

## Goal
Second activity loop: read a clue, pick a dig tile, sign the confirm.

## Loop
1. `POST /api/treasure/challenge` commits spot + loot server-side (spot never returned)
2. Client shows clue + 3×3 grid
3. `POST /api/treasure/confirm` `{ id, signature, guess }`
4. Hit → inventory loot + Boinglets + collection; miss → empty dirt
5. Both hit and miss consume 1 of 3 daily digs

## Migration
`migrations/0011_treasure.sql`

## World hook
Starter Town `station-dig` → `/treasure.html`
