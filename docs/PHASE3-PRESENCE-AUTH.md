# Phase 3 — Wallet-bound plaza presence

## Goal

Bind plaza avatars to wallets when Express is connected, and show profile display names above remotes.

## User stories

- As a connected player, I join the plaza as my wallet (not a random Guest-*).
- As a friend, I see your display name (or short wallet) above your capsule.
- As a guest without a wallet, I can still join anonymously.
- As the system, guests cannot spoof wallet-shaped ids without a signed token.

## Flow

1. Client restores Express via silent `boing_accounts` when possible (no Connect click).
2. Cached presence token in `sessionStorage` (same owner+zone, not near expiry) skips a new sign.
3. Otherwise (user gesture / Appear as wallet): `POST /api/world/presence/challenge` `{ owner, zone }`
4. Wallet signs `Boing Pets presence v1…`
5. `POST /api/world/presence/confirm` → `{ token, expires_at }` (15 min) — cached client-side
6. WebSocket `hello` includes `{ id: owner, token, name, color, x,y,z }`
7. `PlazaRoom` validates token in D1, forces `id = owner`, resolves `profiles.display_name` (else short wallet)
8. Reconnect with the same id replaces the older socket (no “Duplicate presence id”)
9. Leaving the page (`pagehide` / care-station navigation) closes the plaza socket first

## Migration

`migrations/0007_presence_tokens.sql` — `presence_challenges`, `presence_tokens`

## Still open

- Pet followers beside avatars
- Party invites
- AOI sharding for larger hubs
