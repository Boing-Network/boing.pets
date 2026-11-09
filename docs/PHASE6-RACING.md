# Phase 6 — Pet Racing

## Goal

Sixth activity loop: line up for a heat, wait for the starting flash, finish in the timing window for place ribbons.

## Loop

1. Sign `challenge` to line up (server commits track + `go_at`)
2. Wait for the flash, then sign `confirm` inside the finish window
3. Reaction timing → 1st / 2nd / 3rd ribbon + Boinglets + collection discovery
4. Miss → no heat spent; line up again

## Caps

3 finishes per UTC day (`race_heats`).

## Places

| Place | Reaction from go | Ribbon | Boinglets |
| ----- | ---------------- | ------ | --------- |
| 1st   | ≤ 500ms          | Gold   | 22        |
| 2nd   | ≤ 1200ms         | Silver | 12        |
| 3rd   | rest of window   | Bronze | 6         |

## Migration

`migrations/0016_racing.sql`

## World hook

Starter Town `station-race` → `/racing.html`
