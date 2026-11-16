# Boing Pets — Character Roadmap

**Status:** living product roadmap (2026-11). Historical Phase 1–6 delivery notes live in `docs/PHASE*.md`. This file is the forward plan.

## Vision

Boing Pets is a **character-first** Boing-native world: hatch one permanent StreetBody, walk **The Yard**, skill up, dress up, trade cosmetics, dispatch idle runs, and hang out with other wanderers.

Inspiration stack (what we borrow, not what we copy):

| Reference | Borrow | Leave behind |
| --- | --- | --- |
| Neopets | Attachment, daily ritual, collections | Permanent loss, opaque economy |
| Habbo / Club Penguin | Social plaza, rooms, emotes | Paywalled social access |
| Animal Crossing | Expression, housing, seasons | Soft-lock busywork |
| Old School RuneScape | Clear skill XP curves, vault/bank friction | Grind-only identity |
| Axie / creature games | Hatch identity, vertical + horizontal growth | Combat power, breeding P2W |

**Product sentence:** *You are the character. The Yard is your block. Everything else is loot, look, and reason to come back.*

Player-facing language says **character**. Storage may still use `pets` / hatch rows. Copy tone is short and dry (see `docs/design/gathering-skills.md`). Avoid “buddy / little / pet” in new Yard surfaces unless a care ritual UI intentionally reuses legacy care wording.

---

## Doctrine (non-negotiable)

1. **Incremental** — ship loops on the live Worker + D1 trust model; no greenfield rewrite.
2. **Preserve data** — additive migrations; never break hatch ownership.
3. **One character / wallet** until multi-character is explicitly designed.
4. **No permanent death or deletion.**
5. **Cosmetics-only monetization** — no paid combat power, no paywalled care that blocks attachment.
6. **No cron** — timers derive from wall clock on read or from existing Durable Object presence.
7. **Gameplay > polish** — content and clarity before art passes; art still matters for stage/wardrobe.
8. **Scalability hooks early** — AOI, sinks, rate limits before viral load.

Complexity key: **S** small · **M** medium · **L** large · **XL** multi-quarter.

---

## Foundation already shipped

Do **not** rebuild these. Extend them.

| Pillar | What exists |
| --- | --- |
| **Identity** | One hatch per wallet; traits from wallet + hatch tx; StreetBody in The Yard |
| **Care** | Hello / play / groom / feed (optional for Yard skilling); vitals, streaks, achievements |
| **Progression XP** | Care XP, adventure XP, gather skill levels (OSRS curve, cap 50 + prestige) |
| **Growth stages** | `egg → elder` gates (`CharacterStage`); adventure success bonuses |
| **World** | The Yard 3D loop, Starter Town, station pads, streetwear city dressing |
| **Gathering** | Quarry / Line / Plot / Sweep loop, pack, Block Vault, optional mint |
| **Idle** | Dispatch adventures with style luck, Pop-Ups, operator tools |
| **Economy** | Inventory, craft, cook, market escrow, Boinglets, Sparkles faucet, on-chain item mint bank |
| **Social** | Friends, DMs, parties, plaza WebSocket presence (`PlazaRoom`) |
| **Mind** | Deterministic mood / memory / suggestions |
| **Content framework** | Quests, seasons, collections, titles (thin content, solid plumbing) |

Legacy Phase write-ups: `PHASE2.md` … `PHASE6-*.md`, `AUDIT.md`, `DEPLOY-WORKERS.md`.

---

## Target core loop

```
Hatch character
    → Walk The Yard (presence + stations)
        → Gather / craft / cook / market (session play)
        → Dispatch adventure (async play)
        → Quests & daily goals (direction)
        → Cosmetics / housing / titles (expression)
    → Meet others on the plaza
    → Come back tomorrow (streak, season, skill unlock)
```

Every new feature must strengthen at least one beat of that loop.

---

## Character-era pillars

| # | Pillar | Player promise |
| --- | --- | --- |
| 1 | **Character identity** | My hatch looks, levels, and stages like *mine*. |
| 2 | **Skilling** | Time in The Yard makes my character better at something legible. |
| 3 | **Direction** | Quests and seasons tell me what to do next. |
| 4 | **Expression** | Wardrobe, housing, and titles show who I am without power. |
| 5 | **Social block** | I see other characters, party up, and share the plaza. |
| 6 | **Fair economy** | Earn, craft, trade cosmetics; sinks beat faucets. |

---

## Horizons

Horizons replace the old Phase 1–6 numbering. Ship in order unless a dependency forces a skip. Each horizon lists **outcomes**, not calendar estimates.

### Horizon A — Character clarity

**Goal:** make the pet→character migration feel finished in product language and progression UI.

**Outcomes**

- Player-facing copy on Yard / gather / dispatch / HUD says **character** consistently.
- A **character sheet** (or equivalent HUD) shows: stage, personality, care XP → **character level**, gather skill levels, titles, equipped look.
- Care XP + adventure XP feed one **character level** curve (gather skills stay separate — do not mix quarry XP into character level).
- Level-up and stage-up toasts are unmistakable.
- Care remains optional for Yard skilling; rituals stay for players who want attachment loops.

**Primary surfaces:** `src/core.ts`, pasture HUD, quests/progress pages, gather/adventure reward breakdowns.

**Complexity:** **M**

**Exit check:** a new player can answer “what is my character’s level and stage?” without opening docs.

---

### Horizon B — Direction & quest depth

**Goal:** turn the existing quest plumbing into a real spine.

**Outcomes**

- Story / daily / weekly / seasonal quests that touch gather, craft, cook, market, dispatch — not only care predicates.
- Onboarding quest chain: hatch → first gather bank → first craft → first plaza chat or emote → first dispatch.
- Season track that awards **cosmetics / titles only** (battle-pass shape without power).
- Collection log goals that mirror Yard drops and streetwear sets.

**Primary surfaces:** `src/content/quests.ts`, `dailyQuests.ts`, `seasons.ts`, `collections.ts`, `worker/content.ts`.

**Complexity:** **M** (content) + **S** (claim predicates)

**Exit check:** a returning player always has a clear “do this next” chip in The Yard.

---

### Horizon C — Stage evolution & wardrobe

**Goal:** growth and fashion read as character fantasy, not spreadsheet fields.

**Outcomes**

- Distinct StreetBody / accessory presentation per **growth stage** (silhouette, scale, or kit — not a new species tree).
- Full wardrobe UX for hats, frames, held tools, streetwear pieces already in catalog.
- Optional late-stage **elder** cosmetics gated by stage + titles (cosmetic only).
- No Axie-style breeding or species morph unless a separate design doc overturns this.

**Primary surfaces:** `StreetBodyModel`, cosmetics equip APIs, `PastureCustomizeMenu`, stage helpers in `core` / adventures.

**Complexity:** **L** (art + pipeline) · systems **M**

**Exit check:** stage changes are visible from across The Yard; wardrobe is a first-class station.

---

### Horizon D — Economy & inventory maturity

**Goal:** make the bag and market feel like a character’s livelihood.

**Outcomes**

- Inventory sinks that matter: craft fees, listing fees, housing upkeep (cosmetic), vault/mint clarity.
- Wardrobe + bank UX that separates pack / inventory / minted listable stacks.
- Listing expiry / decay without cron abuse (lazy expiry on read is fine).
- Sparkles path beyond testnet faucet only when checkout is real; until then keep faucet labeled as testnet.

**Primary surfaces:** economy workers, market UI, vault mint, `docs/MARKET-AND-DROPS-PLAN.md`.

**Complexity:** **L**

**Exit check:** players understand what is banked vs mintable vs listable without support copy.

---

### Horizon E — Social density & presence scale

**Goal:** The Yard feels alive without rewriting WebSockets.

**Outcomes**

- Plaza party markers + shared activity bonuses (extend `PHASE3-PARTIES`).
- Grid AOI / interest management before raising the 32-player cap.
- Soft edge rate limits; clearer spectate vs walk states.
- Contests: async races, fashion scores, party sync games — **not** destructive PvP.

**Primary surfaces:** `worker/plaza.ts`, `usePlazaPresence`, party APIs, racing / emote systems.

**Complexity:** **XL** (scale) · contest content **M** each

**Exit check:** a busy plaza stays readable; parties are visible and rewarding.

---

### Horizon F — World expansion & long retention

**Goal:** years of content without new core engines.

**Outcomes**

- Zones that earn their keep (Beach / Forest / Mountains / City / Academy) with at least one unique loop each.
- Housing visitor ACLs + editor polish.
- Guilds / crews as social containers (cosmetics, chat, season boards).
- Passport quest hooks only after provenance + anti-Sybil review (docs already stubbed in README).
- Remaining mini-game backlog from the table below, prioritized by loop fit — not by novelty.

**Complexity:** **XL** ongoing

**Exit check:** a season can ship new goals without schema drama.

---

## Systems map (Copilot list, grounded)

External “start with XP / quests / inventory / evolution / websockets / battle” advice maps like this:

| System | Status | Roadmap home |
| --- | --- | --- |
| XP + levels | Partial — skill XP strong; character level UX weak | **Horizon A** |
| Quest system | Exists — thin content | **Horizon B** |
| Inventory / items | Mature | **Horizon D** polish |
| Pet / character evolution | Stages exist; visuals thin | **Horizon C** |
| Real-time pasture | Shipped (`PlazaRoom`) | **Horizon E** scale |
| Battle system | Intentionally absent | Soft **contests** in E/F; no combat power |

---

## Near-term build order

Concrete bets after this doc. Reorder only with a written reason.

1. **Character sheet + level curve** (Horizon A) — highest clarity per line of code.
2. **Onboarding + Yard quest pack** (Horizon B) — gives the sheet somewhere to point.
3. **Stage-readable StreetBody** (Horizon C spike) — proves evolution fantasy without breeding.
4. **Vault / mint / listable UX pass** (Horizon D) — locks the skilling economy story.
5. **Party markers on plaza** (Horizon E spike) — social proof with existing DO.
6. **First soft contest** (timed race board or fashion week) — competitive juice without combat.

---

## Mini-game backlog (keep; re-prioritize)

Original 25 concepts remain valid as a **design menu**. Prefer activities that feed gather skills, collections, parties, or wardrobe. Deprioritize anything that implies combat stats.

Shipped or replaced by gather loop: fishing, treasure, gardening, cooking, mining, racing (see Phase 6 docs). New work should prefer co-op, expression, or skill-adjacent loops (hide-and-seek, runway, photography, academy exams, co-op tug, etc.).

Full table preserved historically in git history of this file pre–character rewrite; do not resurrect combat-oriented entries without a design ADR.

---

## Explicitly deferred / out of scope

- Destructive PvP, card battles, or gear that changes win rate.
- Breeding / multi-character flocks.
- User-generated character names (moderation) until a names service exists.
- Pet NFTs as transferable assets; mainnet; Passport airdrop promises.
- Overnight AFK on gather nodes (Dispatch covers long absences).
- Hanging gather timers off `PlazaRoom`.

---

## How to use this doc

- New features cite a **Horizon** letter in the PR description.
- If a change fights doctrine, open a short ADR under `docs/design/` before coding.
- Phase docs stay as **archaeology** of how we got here; this file wins on conflicts about *what next*.
- Update the **Near-term build order** when a bet ships or is killed.
