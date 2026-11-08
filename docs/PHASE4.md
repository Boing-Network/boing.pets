# Phase 4 — Player economy foundation

## Goal
Introduce a cosmetics-only Boinglets ledger and marketplace without pay-to-win or rewriting care proofs.

## User stories
- As a player, I claim care-earned Boinglets into a spendable ledger balance.
- As a player, I buy cosmetic catalog items (skins/furniture/frames).
- As a player, I can list owned cosmetics and buy others’ listings (5% sink fee).

## Technical specification
- Currencies: `boinglets` (soft) · `sparkles` (premium reserved)
- Double-entry-ish `ledger` deltas; inventory stacks; open/sold/cancelled listings
- Signed challenge/confirm for claim, catalog buy, list, buy listing, cancel
- Catalog is code-defined cosmetics only (`src/economy.ts`)
- Anti-inflation: catalog spend + 5% market fee → `boing-pets-sink`

## APIs
- `GET /api/economy/catalog`
- `GET /api/economy/balance?owner=`
- `GET /api/marketplace`
- `POST /api/economy/challenge`
- `POST /api/economy/confirm`

## Migration
`migrations/0004_economy.sql`

## UI
Pasture `#market` panel: claim, catalog buy, browse listings.

## Next
Premium Sparkles checkout (ethical cosmetics), trade escrow UX polish. Housing furniture placement shipped in Phase 6 foundation.
