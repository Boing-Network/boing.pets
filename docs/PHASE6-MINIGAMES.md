# Phase 6 — Interactive activity mini-games

## Pattern

Every activity (fishing, mining, racing, treasure, garden, cook) shares one loop:

1. **Start** — authenticated with the ~15-minute social/session Bearer token (no wallet transfer).
2. **Play** — client shows a mini-game whose secret parameters were issued by the server.
3. **Finish** — server validates inputs/timings within tolerance. A miss marks the attempt `failed` with **no signature and no ledger credit**.
4. **Claim** — only on success. Player signs a claim message with Express; inventory + Boinglets (plus party / variety / streak bonuses) apply then.

Daily cap: **3 attempts per activity per UTC day**. Unclaimed successes expire after ~10 minutes. Open attempts that time out count as failures.

Disabled activity buttons expose an accessible popover (hover, focus, tap) explaining the gate: connect wallet, hatch a pet, daily limit, in-progress attempt, or pending claim.

## Mechanics

| Activity | Mechanic                                                |
| -------- | ------------------------------------------------------- |
| Fishing  | Moving reel needle; click/press in the green zone       |
| Mining   | Key combo under a time limit (on-screen keys for touch) |
| Racing   | Rhythm taps on beat flashes                             |
| Treasure | Memorize a flashed tile, then dig                       |
| Garden   | Hold-to-water and release near the target duration      |
| Cook     | Tap ingredients in the secret recipe order              |

## Anti-cheat

- Secrets live in D1 (`activity_attempts.secret_json`); clients only receive playable public params.
- Reward identity stays hidden until claim (outcome secrecy).
- Attempts are bound to the social session owner — you cannot burn another wallet's attempts.
- Claim requires a wallet signature over a server-issued message.

## Migration

`0020_activity_attempts.sql` — apply remotely before deploy:

```bash
npx wrangler d1 migrations apply boing-pets --remote
npm run build
npx wrangler deploy
```
