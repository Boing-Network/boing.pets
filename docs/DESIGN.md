# Boing Pets Universe — Game Design Pillars

Forward plan: [`docs/ROADMAP.md`](./ROADMAP.md) (character-era horizons). Phase 1 notes below remain valid for the care ritual math.

## Pillars (every feature must strengthen ≥1)

1. **Character identity** — one hatch per wallet; no permanent loss; expressive personality and readable stage/look. Player-facing copy says **character** (storage may still use `pets`).
2. **Progression** — character level, growth stages, gather skill curves, achievements, titles.
3. **Exploration** — The Yard first; discoverable zones beyond Starter Town.
4. **Socialization** — plaza presence, friends, parties, later guilds / co-op contests.
5. **Expression** — StreetBody wardrobe, housing, cosmetics-only battle-pass seasons.
6. **Economy** — marketplace with ethical, cosmetics-only monetization; clear bank / mint / listable rules.

## Phase 1 design (shipping now)

### Needs

| Need            | Decay                         | Restore                  |
| --------------- | ----------------------------- | ------------------------ |
| Hunger (Belly)  | −25/day since feed            | Feed                     |
| Happiness (Joy) | −20/day since any care        | Any care; Play strongest |
| Energy          | −15/day since play/care       | Play; mild from hello    |
| Hygiene         | −18/day since groom/hatch     | Groom                    |
| Health          | Composite of above (weighted) | Keep vitals high         |

### Personality (seeded, permanent)

Curious · Lazy · Adventurous · Friendly · Mischievous · Cozy · Peppy · Dreamy

### Growth stages

Egg (pre-hatch UI) · Baby (0–2d) · Child (2–7d + care) · Teen (7–21d + care) · Adult (21d+) · Elder (120d+).

Care-day thresholds gate Child/Teen so neglected characters stay Baby/Child visually longer (attachment pressure without death).

### Soft currency — Boinglets

Derived from verified events (no mutable balance races in Phase 1):

- Hatch 50 · Feed 12 · Hello 6 · Play 10 · Groom 10
- Streak bonus: +2 × current streak on each care confirm (shown in UI from state)

### Achievements (Phase 1 set)

- `first_bounce` — hatch
- `kind_hello` — first check-in
- `full_bowl` — first feed
- `playtime` — first play
- `fresh_coat` — first groom
- `streak_3` / `streak_7` — care streaks
- `balanced_day` — feed+hello+play+groom same UTC day

### Skill leanings (soft, derived)

Explorer / Athlete / Scholar / Performer / Collector counters increment from action types; UI shows top leaning. Full skill trees arrive Phase 5–6.

## World zones (Phase 2–6)

| Zone            | Fantasy                  | Hooks                      |
| --------------- | ------------------------ | -------------------------- |
| Starter Town    | Soft hills, pastel roofs | Onboarding, adoption plaza |
| Pet Center      | Clinic + nursery         | Hatch ritual staging       |
| Marketplace     | Stalls, boards           | Economy UI                 |
| Tutorial Meadow | Gentle path              | Tooltips, first quests     |
| Forest          | Dense low-poly trees     | Gathering, rares           |
| Beach           | Shore + pier             | Fishing, festivals         |
| Mountains       | Trails, overlooks        | Quests, collectibles       |
| City District   | Plazas, player shops     | Social + commerce          |
| Boing Academy   | Campus greens            | Training, exams            |

Each zone: unique palette, low-poly kit, portal hooks for expansion packs.

## Monetization ethics

Allowed: cosmetics, housing skins, character skins / wardrobe, battle pass cosmetics, convenience (slots, queue skips).
Forbidden: paid power, paid win trades, combat stats from gear, paywalled care that blocks attachment loops.

Soft contests (races, fashion scores, party sync games) are allowed. Destructive PvP and gear that changes win rate are not, unless a written ADR overturns this roadmap doctrine.
