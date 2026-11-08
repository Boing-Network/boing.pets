# Phase 2 — Starter Town (3D island)

## Goal
Ship a navigable low-poly Starter Town without rewriting the pasture care SPA.

## User stories
- As a player, I open `/world.html` and walk an avatar through Starter Town.
- As a player, I approach glowing care pads and open the existing care desk.
- As a mobile player, I move with a virtual joystick and tap Interact.
- As a developer, zone layout lives in config so landmarks/stations can expand later.

## Technical specification
- **Island architecture:** Vite MPA — `index.html` (vanilla care desk) + `world.html` (React + R3F).
- **Scene:** procedural buildings, trees, paths, emissive station pads; Comfortaa HUD overlay.
- **Controls:** WASD/arrows + E; touch joystick + Interact button.
- **Persistence:** `localStorage` position key `boing-pets-world-position-v1`.
- **API:** `GET /api/world/config` returns `WORLD_CONFIG` (same module as client).

## Component breakdown
- `src/world/config/zones.ts` — zone schema + Starter Town data
- `src/world/WorldApp.tsx` — Canvas shell
- `src/world/scene/StarterTown.tsx` — landmarks / paths / pads
- `src/world/scene/Player.tsx` — movement, AOI stations, camera follow
- `src/world/hud/*` — HUD + joystick
- `worker/index.ts` — world config route

## Testing strategy
- Unit: zone bounds, care deep-links, API config shape.
- Manual: desktop 60 FPS target empty town; mobile joystick usability.
- Future: Playwright load + move + interact.

## Migration plan
- No D1 schema change in this spike (server position save deferred).
- Pasture remains default; world is opt-in via nav/CTA.
- Backward compatible: Phase 1 care APIs untouched.

## Next milestone
Phase 2 hardening (GLB kit + signed position) **or** Phase 3 presence spike in plaza — prefer art/perf hardening if town feel is weak; otherwise thin Durable Object presence.
