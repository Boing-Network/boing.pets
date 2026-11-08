# Phase 3 — Wallet-bound plaza presence

## Goal
Bind plaza avatars to wallets when Express is connected, and show profile display names above remotes.

## User stories
- As a connected player, I join the plaza as my wallet (not a random Guest-*).
- As a friend, I see your display name (or short wallet) above your capsule.
- As a guest without a wallet, I can still join anonymously.
- As the system, guests cannot spoof wallet-shaped ids without a signed token.

## Flow
1. Client `POST /api/world/presence/challenge` `{ owner, zone }`
2. Wallet signs `Boing Pets presence v1…`
3. `POST /api/world/presence/confirm` → `{ token, expires_at }` (15 min)
4. WebSocket `hello` includes `{ id: owner, token, name, color, x,y,z }`
5. `PlazaRoom` validates token in D1, forces `id = owner`, resolves `profiles.display_name` (else short wallet)

## Migration
`migrations/0007_presence_tokens.sql` — `presence_challenges`, `presence_tokens`

## Still open
- Pet followers beside avatars
- Party invites
- AOI sharding for larger hubs
