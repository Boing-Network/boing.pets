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

## Next
Friends/DM/parties, wallet presence tokens, AOI sharding for City District.
