# Deploy Boing Pets on Cloudflare Workers + D1

Target: **option A** — one `workers.dev` URL serves static UI + `/api`.

**Live preview:** https://boing-pets.nico-chikuji.workers.dev

## Status (2026-11-08)

- [x] Worker `boing-pets` deployed with static assets
- [x] `APP_ORIGIN` = `https://boing-pets.nico-chikuji.workers.dev`
- [x] D1 bound (reused empty remote DB id; local/CI name remains `pets`)
- [x] Migrations `0001`–`0016` applied remotely
- [x] Durable Object `PlazaRoom` bound

## Redeploy

```sh
npm run build
npx wrangler deploy
```

## Remote migrations

```sh
npx wrangler d1 migrations apply pets --remote
```

## Verify

```sh
curl -sS "https://boing-pets.nico-chikuji.workers.dev/api/pasture?offset=0"
```

Open the workers.dev URL in the browser (same origin as `APP_ORIGIN`), Connect Express, then hatch/care.

## Note on D1 name

Wrangler `database_name` is `pets` for local/CI. The remote UUID is a reused empty D1 whose dashboard label may still be `boing-wallet-db`. Optional cleanup later: create a dedicated `boing-pets` DB when the account has a free create slot.
