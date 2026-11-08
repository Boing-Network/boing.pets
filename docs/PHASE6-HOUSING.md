# Phase 6 — Housing foundation

## Goal
Give every hatched wallet a 4×4 cottage plot where market furniture can be placed and picked up with signatures.

## Loop
1. Buy `furn-cushion` / `furn-lamp` from the cosmetics market
2. Open `#home` (or Starter Town Cottage Gate)
3. Select furniture → empty cell → sign `place` (inventory → placement)
4. Click filled cell → sign `pickup` (placement → inventory)
5. Toggle public/private with `set_visibility`

## APIs
- `GET /api/housing/plot?owner=&viewer=`
- `POST /api/housing/challenge` — `place` | `pickup` | `set_visibility`
- `POST /api/housing/confirm`

## Migration
`migrations/0009_housing.sql`

## Still open
3D house mesh, rotation, multi-room editor, visitor ACLs, housing upkeep sink
