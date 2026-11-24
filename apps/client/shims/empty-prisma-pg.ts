/**
 * Browser worker must never open a Postgres connection. `@boing-pets/db`'s
 * barrel pulls in `@prisma/adapter-pg` → `pg` → `postgres-bytea`, which reads
 * Node's `Buffer` while its module loads. A production build tree-shakes that
 * away, but the dev server evaluates every module, so the worker died with
 * "Buffer is not defined" before it could start. Vite aliases the adapter
 * here; an accidental use fails clearly instead.
 */
export class PrismaPg {
  constructor() {
    throw new Error("Postgres is not available in the browser host worker");
  }
}
