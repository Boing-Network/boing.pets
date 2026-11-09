# Phase 2 — Starter Town (3D island)

## Goal

Ship a navigable low-poly Starter Town without rewriting the pasture care SPA.

## User stories

- As a player, I open `/world.html` and walk an avatar through Starter Town.
- As a player, I approach glowing care pads and open the existing care desk.
- As a mobile player, I move with a virtual joystick and tap Interact.
- As a developer, zone layout lives in config so landmarks/stations can expand later.
- As a player (2.5), I can optionally cloud-save my position with a wallet signature.

## Technical specification

- **Island architecture:** Vite MPA — `index.html` (vanilla care desk) + `world.html` (React + R3F).
- **Code split:** lazy `WorldApp` + manualChunks for `three` / `@react-three` / React.
- **Scene:** procedural buildings, trees, paths, emissive station pads; Comfortaa HUD overlay.
- **Perf:** no shadow maps; lower DPR + low-power GPU hint on mobile/coarse pointer / reduced motion.
- **Controls:** WASD/arrows + E; touch joystick + Interact button.
- **Persistence:** `localStorage` primary; signed D1 sync optional.
- **API:**
  - `GET /api/world/config`
  - `GET /api/world/position?owner=`
  - `POST /api/world/position/challenge`
  - `POST /api/world/position/confirm`

## Component breakdown

- `src/world/config/zones.ts` — zone schema + Starter Town data
- `src/world/WorldApp.tsx` — Canvas shell
- `src/world/scene/*` — town + player
- `src/world/hud/*` — HUD, joystick, cloud save
- `src/world/lib/positionApi.ts` — signed sync client
- `migrations/0003_world_positions.sql` — challenges + positions
- `worker/index.ts` — world routes

## Testing strategy

- Unit: zone bounds, care deep-links, API config + signed position sync.
- Manual: desktop/mobile town load; cloud save requires Express.

## Migration plan

- Additive D1 migration `0003`; pasture care schema untouched.
- Pasture remains default; world is opt-in via nav/CTA.

## Next milestone

**Phase 3 plaza presence** (Durable Object room stub) after 2.5 lands — GLB art kit can proceed in parallel.
