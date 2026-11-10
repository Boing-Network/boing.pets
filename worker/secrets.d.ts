// Optional on-chain items config (not in wrangler.jsonc, so `wrangler types` does not own it).
// MULTI_TOKEN_CONTRACT: plain var. MULTI_TOKEN_ADMIN_SECRET_KEY: `wrangler secret put` only.
interface Env {
  MULTI_TOKEN_CONTRACT?: string;
  MULTI_TOKEN_ADMIN_SECRET_KEY?: string;
}
