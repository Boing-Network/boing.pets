# Deploy Boing Pets on Cloudflare Workers + D1

Target: **option A** — one `workers.dev` URL serves static UI + `/api`.

**Live preview:** https://boing-pets.nico-chikuji.workers.dev

## Status (2026-11-08)

- [x] Worker `boing-pets` deployed with static assets
- [x] `APP_ORIGIN` = `https://boing-pets.nico-chikuji.workers.dev`
- [x] D1 database **`boing-pets`** (`838d9755-4d84-41f5-af04-3aef48efa2a4`)
- [x] Migrations `0001`–`0016` present on remote (imported from prior DB)
- [ ] Migration `0017_security_hardening.sql` (social sessions, IP rate buckets, `account_balances`) — apply with remote migrations after pull
- [x] Durable Object `PlazaRoom` bound

## Redeploy

```sh
npm run build
npx wrangler deploy
```

## Remote migrations

```sh
npx wrangler d1 migrations apply boing-pets --remote
```

## Verify

```sh
curl -sS "https://boing-pets.nico-chikuji.workers.dev/api/pasture?offset=0"
```

Open the workers.dev URL in the browser (same origin as `APP_ORIGIN`), Connect Express, then hatch/care.

## D1 naming history

Cloudflare D1 cannot rename in place. The first deploy reused empty `boing-wallet-db`; data was exported and imported into a new **`boing-pets`** database, then the old DB was deleted.

## After security hardening (0017)

```sh
npm run build
npx wrangler d1 migrations apply boing-pets --remote
npx wrangler deploy
```

Local:

```sh
npm run db:local
```
