# Phase 4 — Sparkles testnet faucet

## Goal
Unlock premium cosmetics with Sparkles without real payments on testnet.

## Loop
1. Sign `sparkles_claim` once per UTC day → +10 Sparkles (`reason: sparkles_claim`)
2. Buy Sparkles-priced catalog items (`hat-stardust`, `frame-aurora`)
3. Debits sink to `boing-pets-sink` like Boinglets catalog buys

## Migration
`migrations/0010_sparkles_claim.sql` — expands `economy_challenges.kind`

## Not included
Stripe / real checkout, Sparkles marketplace listings, paid XP

## Next
Ethical paid Sparkles checkout when mainnet cosmetics go live.
