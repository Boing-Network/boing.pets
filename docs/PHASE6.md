# Phase 6 — Full virtual world content framework

## Goal
Config-driven quests, seasons, collections, and expansion zone stubs so content can ship for years without rewriting core systems.

## Shipped
- Quest defs (story/daily/weekly/seasonal/pet) + signed claim → Boinglets + titles
- Seasonal events config (`seasons.ts`) incl. always-on Testnet Festival
- Collection log defs + persisted unlocks
- Expansion zone stubs: Forest, Beach, Mountains, City, Academy
- Pasture Quests UI panel
- Migration `0005_content_framework.sql`
- Fishing v1 activity loop (`0008`, `PHASE6-FISHING.md`)

## APIs
- `GET /api/content/quests?owner=`
- `GET /api/content/seasons`
- `GET /api/content/collections?owner=`
- `POST /api/content/quest/challenge`
- `POST /api/content/quest/confirm`
- `GET /api/fishing/status?owner=`
- `POST /api/fishing/challenge`
- `POST /api/fishing/confirm`

## Still open (content production)
- Full zone meshes / LOD kits
- Housing editor + visitor ACLs
- Avatar cosmetic wardrobe UI
- Battle pass season track
- Remaining mini-game implementations (design backlog remains in ROADMAP)

## Doctrine
Gameplay loops and data model first; art polish and LLM flavor later.
