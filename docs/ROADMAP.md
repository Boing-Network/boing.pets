# Boing Pets Universe — Migration Roadmap

Vision: a persistent 3D online pet universe (Neopets × Club Penguin × Animal Crossing × Habbo × Pokémon care × Runescape progression × ethical cosmetic economy) **built on top of** the working testnet care MVP.

**Doctrine:** incremental delivery · preserve user data · migrations before schema breaks · gameplay > polish · scalability hooks early · no pay-to-win.

Complexity key: **S** small · **M** medium · **L** large · **XL** multi-quarter systems.

---

## Phase 1 — Enhanced Current Game (this PR)

**Goal:** deepen attachment & progression without changing deploy topology.

### User stories
- As a player, I see my pet’s **personality, growth stage, energy, hygiene, health, XP, and soft currency**.
- As a player, I can **Play** and **Groom** (free signatures, once/UTC day) in addition to hello/feed.
- As a player, I unlock **achievements** (first hatch care, 3/7-day streaks, full vitals day).
- As an operator, existing hatch/feed/check-in data remains valid after migration.

### Technical specification
- Extend `Action` with `play` | `groom` (signature-only, like check-in).
- Expand `state()` vitals; derive XP + Boinglets from event history.
- Deterministic personality from trait seed.
- Growth stage from age + care-day count.
- Achievements table; unlock on confirm when predicates match.
- Additive D1 migration recreating action CHECKs safely.

### Database changes
- Rebuild `challenges` / `events` action checks for `play`,`groom`.
- `achievements(owner, code, unlocked_at)`.
- `pet_memories` stub table (unused until Phase 5).

### API architecture
- Same four routes; challenge accepts new actions.
- Pet payloads gain `personality`, expanded `state`, `achievements[]`.

### UI
- Buddy card meters for Energy / Hygiene / Health.
- Stage + personality badges; Boinglets + XP.
- Play / Groom buttons.

### Component breakdown
- `core.ts` domain · Worker confirm/achievements · `main.ts` controls · CSS meters.

### Testing
- Unit: stages, personality, vitals, rewards.
- API: play/groom once/day; achievements unlock; legacy hatch/feed unchanged.

### Migration plan
1. Apply `0002_phase1_progression.sql` locally.
2. Deploy Worker after approved D1 id (no auto-deploy).
3. Old clients ignore new fields (backward compatible JSON).

### Dev tasks
- [x] Audit + roadmap docs
- [x] Domain expansion + migration + API + UI + tests

### Complexity
**M**

---

## Phase 2 — 3D Single Player World (in progress / spike shipped)

**Goal:** navigable low-poly Starter Town (adoption plaza + tutorial path) in-browser; pets remain 2D/SVG companions in UI overlay first.

### User stories
- Walk an avatar through Starter Town; enter Pet Center / Tutorial markers.
- Interact with care stations that deep-link to existing care desk.
- Mobile: virtual joystick + tap interact.

### Tech (shipped spike)
- Vite multi-page + React Three Fiber island at `/world.html` (pasture SPA unchanged).
- Procedural low-poly town (no heavy GLB pipeline yet); fog + soft follow camera.
- Config-driven zone layout in `src/world/config/zones.ts`.
- Local position save (`localStorage`); server position auth deferred.
- `GET /api/world/config` serves the same zone config.

### Still open for Phase 2 hardening
- GLB art kit + Draco/meshopt LOD
- Signed `PUT /api/world/position`
- Playwright movement smoke
- In-world care confirmations (wallet) without leaving the canvas

### Complexity
**L** (spike **M** delivered)

---

## Phase 3 — Multiplayer World

**Goal:** MMO-lite presence in public hubs (Starter Town plaza).

### User stories
- See other players’ avatars + pet followers (capped).
- Friend list, DM, party invite (text first).
- Profiles show streak, achievements, species.

### Tech
- Cloudflare Durable Objects room per zone shard OR Socket.io on Node for prototype.
- Interest management: grid AOI; max N entities/client.
- Auth: short-lived presence tokens minted after wallet challenge.

### DB
- `friends`, `messages`, `parties`, `profiles` (display name moderated later).

### Anti-abuse
- Edge rate limits; mute/block; message length caps.

### Complexity
**XL**

---

## Phase 4 — Player Economy

**Goal:** soft + premium currencies, marketplace for cosmetics/furniture/resources; secure trade escrow.

### User stories
- Earn Boinglets from quests/activities; buy cosmetics.
- List/buy on marketplace; peer trade with confirmations.
- Premium currency for cosmetics/convenience only (no power).

### Tech
- Ledger tables (double-entry); escrow state machine; idempotency keys.
- Move economy to Postgres when D1 write contention appears.
- Anti-inflation: sinks (repairs, fees, crafting burn), soft caps, decay on unused listings.

### Complexity
**XL**

---

## Phase 5 — AI-Driven Pets

**Goal:** personality engine with memory; pets suggest activities based on history.

### User stories
- Pet remembers favorite activities / friends / neglect.
- Behavior changes (wander bias, dialogue prompts) without breaking care math.

### Tech
- `pet_memories` writes on activities; embedding optional later.
- Behavior FSM on client; server validates memory writes.
- No unbounded LLM on request path — cached prompts / small models / batch.

### Complexity
**L**

---

## Phase 6 — Full Virtual World

**Goal:** Forest / Beach / Mountains / City / Academy zones; housing; quests; seasons; 25+ activities; guilds; collections.

### Systems checklist
- Zones with unique aesthetics + expansion hooks
- Housing 3D editor + visitor ACLs
- Avatar cosmetics economy
- Quest engine (story/daily/weekly/seasonal/pet-specific) — config-driven
- Seasonal event framework (JSON, no code deploys)
- Collection log, badges, titles
- Ethical battle pass / cosmetics monetization

### Complexity
**XL** (years of content; engine in Phase 4–5)

---

## Mini-game concepts (25) — design backlog for Phases 2–6

| # | Activity | Loop | Rewards | Progression |
|---|----------|------|---------|-------------|
| 1 | Fishing | Cast → wait → reel timing | Fish, Boinglets | Rod tiers, rare fish log |
| 2 | Treasure hunt | Clue → dig spots | Cosmetics, maps | Digging skill |
| 3 | Pet racing | Train → race heat | XP, ribbons | Speed skill tree |
| 4 | Obstacle course | Parkour timer | Athlete XP | Course stars |
| 5 | Gardening | Plant → water → harvest | Ingredients | Plot expansions |
| 6 | Cooking | Recipe minigame | Food items (care boost) | Cookbook |
| 7 | Mining | Tap veins / stamina | Ores | Pickaxe tiers |
| 8 | Talent contest | Emote / timing judging | Fame, titles | Stage outfits |
| 9 | Hide and seek | Hide or seek in hub | Party Boinglets | Seasonal maps |
| 10 | Bug catching | Sneak + net | Critters | Net upgrades |
| 11 | Photography | Frame subjects | Album badges | Rare shot list |
| 12 | Balloon bounce | Timing bounce height | Soft currency | Daily best |
| 13 | Memory match | Card pairs w/ pet theme | Scholar XP | Harder decks |
| 14 | Rhythm jam | Tap to beat | Performer XP | Song catalog |
| 15 | Pet grooming salon | Swipe clean / style | Hygiene + cosmetics | Style book |
| 16 | Cloud surfing | Endless glide | Explorer XP | Distance ranks |
| 17 | Shell sorting | Beach sort puzzle | Beach tokens | Combo multiplier |
| 18 | Crystal spelunk | Cave path choices | Gems | Depth unlocks |
| 19 | Market haggling | Price guess NPC | Discount coupons | Merchant rep |
| 20 | Rescue run | Find scruffy NPCs | Care items | Hero titles |
| 21 | Puzzle towers | Block / light puzzles | Scholar XP | Tower floors |
| 22 | Pet fashion runway | Outfit score | Cosmetics | Trend seasons |
| 23 | Co-op tug | Party sync pulls | Party loot | Duo ranks |
| 24 | Night firefly | Catch timed lights | Seasonal currency | Night events |
| 25 | Academy exams | Quiz + practical | Skill points | Degrees / titles |

---

## Economy sketch (Phase 4 detail)

**Currencies:** Boinglets (soft) · Sparkles (premium).

**Earn:** quests, activities, trading, care streaks (soft only).

**Sinks:** crafting fees, listing fees, housing upkeep (cosmetic), vanity gachas with pity (cosmetic).

**Anti-P2W:** no paid XP multipliers that affect competitive leaderboards; convenience = inventory expand / cosmetics preview queues.

---

## Next highest-value milestone after Phase 1

**Phase 1.5 / Phase 2 spike:** R3F Starter Town prototype behind a route flag, still calling Phase 1 care APIs — proves exploration pillar without multiplayer cost.
