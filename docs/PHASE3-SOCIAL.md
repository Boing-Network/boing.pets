# Phase 3 backlog — Friends & DMs

## Goal

Ship wallet-bound friends, display names, and signed direct messages on the pasture SPA without rewriting plaza presence.

## User stories

- As a player, I set a display name (2–24 chars) with a free signature.
- As a player, I send/accept/decline/remove friend requests by wallet.
- As a player, I DM friends only (280 chars, signed).

## Technical specification

- Signed challenge/confirm mirror of economy/care (`Boing Pets social v1` message)
- Canonical friendship rows: lexicographic `(owner_a < owner_b)`
- Rate limit: 12 social challenges / minute / owner
- Target must already have a pet before a friend request

## Migration

`migrations/0006_social.sql` — `social_challenges`, `profiles`, `friend_requests`, `friendships`, `messages`

## APIs

- `GET /api/social/profile?owner=`
- `GET /api/social/friends?owner=`
- `GET /api/social/requests?owner=`
- `GET /api/social/messages?owner=&with=`
- `POST /api/social/challenge` — kinds: `set_profile`, `friend_request`, `friend_accept`, `friend_decline`, `friend_remove`, `send_message`
- `POST /api/social/confirm` — Ed25519 over Blake3(message)

## UI

Pasture `#social` panel: profile name, requests, friends list, DM thread.

## Still open

- Surface display names in plaza presence
- Parties / invites
- Wallet-bound presence tokens
- Read receipts UX

## Auth for private reads (2026-11-09)

Private GETs require a signed social session (same pattern as plaza presence tokens):

1. `POST /api/social/session/challenge` `{ owner }`
2. Wallet signs `Boing Pets social session v1…`
3. `POST /api/social/session/confirm` → `{ token, expires_at }` (~15 min; cached in `sessionStorage`)
4. Send `Authorization: Bearer <token>` on `/api/social/friends`, `/requests`, `/messages`, `/party`, `/party/invites`

`GET /api/social/profile` remains public. Migration: `0017_security_hardening.sql`.
