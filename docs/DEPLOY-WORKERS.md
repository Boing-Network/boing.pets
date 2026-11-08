# Deploy Boing Pets on Cloudflare Workers + D1

Target: **option A** — one `workers.dev` URL serves static UI + `/api`.

**Live preview:** https://boing-pets.nico-chikuji.workers.dev

## Status (2026-11-08)

- [x] Worker `boing-pets` deployed with static assets
- [x] `APP_ORIGIN` = `https://boing-pets.nico-chikuji.workers.dev`
- [x] D1 bound (reused empty `boing-wallet-db` — account was at free-plan create limit)
- [x] Migrations `0001`–`0016` applied remotely
- [x] Durable Object `PlazaRoom` bound

## Redeploy

```sh
npm run build
npx wrangler deploy
```

## Remote migrations

```sh
npx wrangler d1 migrations apply boing-wallet-db --remote
```

## Verify

```sh
curl -sS "https://boing-pets.nico-chikuji.workers.dev/api/pasture?offset=0"
```

Open the workers.dev URL in the browser (same origin as `APP_ORIGIN`), Connect Express, then hatch/care.

## Note on D1 name

Cloudflare still labels the database `boing-wallet-db`. When a free D1 create slot is available, you can create `boing-pets`, migrate data, and rebind — optional cleanup only.
