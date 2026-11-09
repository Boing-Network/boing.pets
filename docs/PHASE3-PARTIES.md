# Phase 3 — Party invites foundation

## Goal

Let friends form a party of up to 4 with signed create / invite / accept / leave.

## Rules

- Friends only for invites
- Leader invites; max 4 members
- One party membership per wallet
- Leader leave promotes oldest remaining member (or disbands)

## APIs

- `GET /api/social/party?owner=`
- `GET /api/social/party/invites?owner=`
- Social challenge kinds: `party_create`, `party_invite`, `party_accept`, `party_decline`, `party_leave`

## Migration

`migrations/0012_parties.sql`

## Party activity bonuses (migration 0019)

Server-authoritative extras when party members do activities:

| Rule             | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Per extra member | +10% Boinglets (size-1)                                                |
| Cap              | +30%                                                                   |
| Together window  | +5% if a mate logged the same activity within 15 minutes               |
| Daily bonus cap  | 50 Boinglets / UTC day (`reason=party_bonus`)                          |
| Anti-farm        | Friendship age ≥ 12h with a mate; pet age ≥ 24h **or** ≥ 3 care events |

Eligible activities: fishing, mining, racing, treasure, garden harvest, cook.

`GET /api/social/party` also returns `bonusPercent` / `togetherBonusPercent` for UI badges.

## Variety day + streak milestones

- **Variety day:** 3+ distinct activity kinds in one UTC day → +10 Boinglets once (`reason=variety_day`).
- **Streak Sparkles:** check-in streak days 3 and 7 grant 3 and 7 Sparkles once (`reason=streak_milestone_N`).

## Migration

`migrations/0012_parties.sql` · `migrations/0019_party_bonuses.sql`

## Still open

Plaza party markers, party chat, dedicated party quests
