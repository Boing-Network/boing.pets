# Public pasture activity areas

Daily activities still use the same APIs, signatures, transaction flows, daily caps, drop tables, and pity as the original desk pages. The public pasture now hosts a themed area for each one so players can walk up and play without leaving the meadow.

This is a presentation change only. Server rules, RNG, and drop tables were not modified. No D1 migration is required.

## Areas

All interact radii are **3.4**. Collision and presence clamping go through `obstaclesForZone` / `clampPresencePosition` on both the client and `PlazaRoom`.

| Activity       | Area                                | Landmark         | Coordinates | Deep link | Fallback page    | Endpoints                                                                                |
| -------------- | ----------------------------------- | ---------------- | ----------- | --------- | ---------------- | ---------------------------------------------------------------------------------------- |
| Mining         | Crystal Quarry                      | `crystal-quarry` | (-30, 6)    | `/#mine`  | `/mining.html`   | `/api/activity/attempts/status`, `/api/activity/attempt/start`, `/finish`, `/claim`      |
| Fishing        | Pond Pier (Lily Pond shore)         | `pond-pier`      | (27, -16)   | `/#fish`  | `/fishing.html`  | same attempt APIs (`activity=fishing`)                                                   |
| Treasure       | Treasure Dig                        | `treasure-dig`   | (8, -28)    | `/#dig`   | `/treasure.html` | same attempt APIs (`activity=treasure`)                                                  |
| Garden / crops | Garden Beds                         | `garden-beds`    | (12, 28)    | `/#crops` | `/garden.html`   | attempt APIs plus `/api/garden/status`, `/challenge`, `/confirm` (plant, water, harvest) |
| Cooking        | Pasture Kitchen (by the Snack Barn) | `kitchen-hut`    | (-22, 26)   | `/#cook`  | `/kitchen.html`  | attempt APIs plus `/api/cook/status`, `/challenge`, `/confirm` (cook, serve)             |
| Racing         | Race Track                          | `race-gate`      | (-12, -32)  | `/#race`  | `/racing.html`   | same attempt APIs (`activity=racing`)                                                    |

Play attempts are capped at **3 per UTC day** (`ACTIVITY_ATTEMPT_DAILY_CAP`). Successes are claimed with an Express signature. Misses spend an attempt but never require a signature. Garden and kitchen also keep their signed plot / recipe flows.

Existing desks stay in place and must be kept clear:

- Crafting Station (-16, 12)
- Market Stall (16, 12)
- Customization Station (16, -8)
- Old Oak (-18, -20)

The Pond Pier reuses the Lily Pond. The kitchen sits beside the Snack Barn, outside the west paddock. Garden beds sit west of the existing garden rails and wildflowers.

## Shared UI

Fallback pages and in-pasture overlays render the same markup from `src/ui/activityPanels.ts` and call the same refresh / play helpers in `activitiesPage.ts`, `lifestylePage.ts`, and `playActivity.ts`. Do not fork those helpers when tweaking an activity.

Mini-games are compact DOM stages (timing bar, key combo, rhythm pad, tile grid, hold-to-water, ingredient order). They run inside the station overlay at a slightly larger size. None need a full-screen canvas or a navigation away from the pasture.

## Navigation

The Activities dropdown still points at the fallback desk pages (`/fishing.html`, and so on), matching the Craft and Market pattern. Pasture deep links (`/#mine`, `/#fish`, `/#dig`, `/#crops`, `/#cook`, `/#race`) walk the player to the area and open the overlay when they arrive. Desk pages mention the intended pasture spot. Legacy hashes such as `#fishing` still redirect to the desk pages.

Housing (`/home.html`) stays a desk-only plot and is not a pasture area.

## Stations in Starter Town

Starter Town portal pads for these activities now deep-link into the public pasture (`/#fish`, and so on) instead of opening the desk page first.
