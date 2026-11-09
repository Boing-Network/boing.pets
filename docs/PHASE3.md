# Phase 3 — Plaza presence (MMO-lite spike)

## Goal

Let multiple guests see each other in Starter Town without rewriting care APIs.

## User stories

- As a guest, I join the plaza over WebSocket and see other avatars move.
- As a guest, I can leave/rejoin presence without leaving the 3D world.
- As the system, plazas cap at 32 connections and rate-limit move spam.

## Technical specification

- Cloudflare Durable Object `PlazaRoom` (SQLite-backed class, hibernation WebSockets)
- Route: `GET /api/world/presence?zone=starter-town` (Upgrade: websocket)
- Origin check against `APP_ORIGIN`
- Wire protocol in `src/world/lib/presenceProtocol.ts` (shared)
- Client hook `usePlazaPresence` + `RemotePlayers` capsules
- Guest identity for the spike (wallet-bound tokens deferred)

## Wrangler

- Binding `PLAZA` → class `PlazaRoom`
- Migration tag `v1-plaza` with `new_sqlite_classes: ["PlazaRoom"]`
- Still local-first / no auto-deploy

## Testing

- Protocol unit tests
- Manual: two browser sessions in `/world.html`
- `wrangler deploy --dry-run` includes DO class

## Friends & DMs (backlog shipped)

See `docs/PHASE3-SOCIAL.md` — migration `0006`, signed social challenge/confirm, pasture Friends panel.

## Wallet presence (shipped)

See `docs/PHASE3-PRESENCE-AUTH.md` — migration `0007`, signed presence tokens, display names on plaza capsules.

## Pet followers (shipped)

Wallet-bound plaza avatars load `GET /api/pet` traits and render a bobbing low-poly follower (`PetFollower`). Guests stay humanoid-only.

## Parties (foundation shipped)

See `docs/PHASE3-PARTIES.md` — migration `0012`, signed create/invite/accept/leave (max 4).

## Next

Plaza party markers, AOI sharding for City District.
