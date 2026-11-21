/**
 * Browser-durable WorldRepository. Same commit semantics as MemoryWorldRepository,
 * with a pluggable string store (IndexedDB in the browser worker, Map in tests).
 *
 * Electron / Postgres still use PrismaWorldRepository. This path exists so the
 * static Vite client can keep a living world across refresh without inventing a
 * second simulation.
 */
import type { AssetMintLinkRow } from "../boing/asset-mint-link";
import type { CreatureNftLinkRow } from "../boing/nft-link";
import type { ItemChange } from "../items/types";
import type {
  CommitBatch,
  DurableTables,
  PersistedHostClock,
  WorldRepository,
} from "./repository";
import { MemoryWorldRepository } from "./memory-repository";

export type BrowserStringStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};

/**
 * v2 = world schema 2 (creature positions + saved clock scale). v1 saves are
 * read once, upgraded in RAM, and written under v2; the v1 value is left in
 * place as a rollback backup.
 */
export const BROWSER_WORLD_STORAGE_KEY = "boing-pets:durable-tables:v2";
export const LEGACY_BROWSER_WORLD_STORAGE_KEYS = [
  "boing-pets:durable-tables:v1",
] as const;
/** M22 item side tables live under their own key; world tables are untouched. */
export const BROWSER_ITEMS_STORAGE_KEY = "boing-pets:items:v1";
/** IndexedDB database version. v2 marks the schema-2 storage key. */
export const BROWSER_IDB_VERSION = 2;

/** In-memory string store for unit tests. */
export function createMemoryStringStore(
  initial: Record<string, string> = {},
): BrowserStringStore {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    async get(key) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    async set(key, value) {
      map.set(key, value);
    },
  };
}

type IdbRequest<T> = {
  result: T;
  error: Error | null;
  onsuccess: ((this: IdbRequest<T>, ev: Event) => void) | null;
  onerror: ((this: IdbRequest<T>, ev: Event) => void) | null;
};

type IdbTransaction = {
  objectStore(name: string): {
    get(key: string): IdbRequest<unknown>;
    put(value: string, key: string): IdbRequest<unknown>;
  };
  oncomplete: ((this: IdbTransaction, ev: Event) => void) | null;
  onerror: ((this: IdbTransaction, ev: Event) => void) | null;
  onabort: ((this: IdbTransaction, ev: Event) => void) | null;
  error: Error | null;
};

type IdbDatabase = {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(store: string, mode: "readonly" | "readwrite"): IdbTransaction;
};

type IdbOpenRequest = IdbRequest<IdbDatabase> & {
  onupgradeneeded: ((this: IdbOpenRequest, ev: Event) => void) | null;
};

type IdbFactory = {
  open(name: string, version?: number): IdbOpenRequest;
};

/**
 * IndexedDB string store. Available in window and dedicated workers.
 * One object store, string keys / string values.
 */
export function createIndexedDbStringStore(options?: {
  dbName?: string;
  storeName?: string;
}): BrowserStringStore {
  const dbName = options?.dbName ?? "boing-pets";
  const storeName = options?.storeName ?? "kv";
  let dbPromise: Promise<IdbDatabase> | null = null;

  function factory(): IdbFactory {
    const idb = (globalThis as { indexedDB?: IdbFactory }).indexedDB;
    if (idb == null) {
      throw new Error("indexedDB unavailable");
    }
    return idb;
  }

  function openDb(): Promise<IdbDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = factory().open(dbName, BROWSER_IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB"));
    });
    return dbPromise;
  }

  return {
    async get(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => {
          const value = req.result;
          resolve(typeof value === "string" ? value : null);
        };
        req.onerror = () => reject(req.error ?? new Error("indexedDB get"));
      });
    },
    async set(key, value) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("indexedDB set"));
        tx.onabort = () => reject(tx.error ?? new Error("indexedDB abort"));
      });
    },
  };
}

export type BrowserWorldRepositoryOptions = {
  store?: BrowserStringStore;
  storageKey?: string;
  /** Keys to fall back to (oldest last) when `storageKey` is empty. */
  legacyStorageKeys?: readonly string[];
};

/**
 * Fill fields that older JSON saves predate. Creature positions default to 0
 * and the world keeps its stored schemaVersion, so load re-places them.
 */
export function normalizeBrowserTables(tables: DurableTables): DurableTables {
  if (!Array.isArray(tables.creatureNftLinks)) tables.creatureNftLinks = [];
  if (!Array.isArray(tables.assetMintLinks)) tables.assetMintLinks = [];
  if (
    tables.influenceAcceptedByAccount == null ||
    typeof tables.influenceAcceptedByAccount !== "object" ||
    Array.isArray(tables.influenceAcceptedByAccount)
  ) {
    tables.influenceAcceptedByAccount = {
      local: Array.isArray(tables.influenceAcceptedAtMs)
        ? [...tables.influenceAcceptedAtMs]
        : [],
    };
  }
  if (!Array.isArray(tables.influenceAcceptedAtMs)) {
    tables.influenceAcceptedAtMs = [
      ...(tables.influenceAcceptedByAccount.local ?? []),
    ];
  }
  for (const creature of tables.creatures) {
    creature.spotX ??= 0;
    creature.spotZ ??= 0;
    creature.fromSpotX ??= 0;
    creature.fromSpotZ ??= 0;
  }
  tables.hostClock ??= null;
  return tables;
}

/**
 * Wraps MemoryWorldRepository and flushes the full DurableTables JSON after
 * every successful insert/commit. Hydrate once before the first read.
 */
export class BrowserWorldRepository implements WorldRepository {
  readonly #memory = new MemoryWorldRepository();
  readonly #store: BrowserStringStore;
  readonly #storageKey: string;
  readonly #legacyKeys: readonly string[];
  #ready: Promise<void>;
  #hydrated = false;

  constructor(options: BrowserWorldRepositoryOptions = {}) {
    this.#store = options.store ?? createIndexedDbStringStore();
    this.#storageKey = options.storageKey ?? BROWSER_WORLD_STORAGE_KEY;
    this.#legacyKeys =
      options.legacyStorageKeys ??
      (options.storageKey == null ? LEGACY_BROWSER_WORLD_STORAGE_KEYS : []);
    this.#ready = this.#hydrate();
  }

  async #hydrate(): Promise<void> {
    if (this.#hydrated) return;
    let raw = await this.#store.get(this.#storageKey);
    let migrated = false;
    if (raw == null) {
      for (const key of this.#legacyKeys) {
        raw = await this.#store.get(key);
        if (raw != null) {
          migrated = true;
          break;
        }
      }
    }
    if (raw != null) {
      const tables = normalizeBrowserTables(JSON.parse(raw) as DurableTables);
      await this.#memory.insertWorld(tables);
      // Write the current key now; the legacy value stays as a backup.
      if (migrated) await this.#persist();
    }
    const items = await this.#store.get(this.#itemsKey());
    if (items != null) this.#memory.importItems(JSON.parse(items));
    this.#hydrated = true;
  }

  #itemsKey(): string {
    return this.#storageKey === BROWSER_WORLD_STORAGE_KEY
      ? BROWSER_ITEMS_STORAGE_KEY
      : `${this.#storageKey}:items`;
  }

  async readInventoryLots(worldId: number) {
    await this.#ready;
    return this.#memory.readInventoryLots(worldId);
  }

  async readInfluenceAccounts(worldId: number) {
    await this.#ready;
    return this.#memory.readInfluenceAccounts(worldId);
  }

  async commitItems(change: ItemChange) {
    await this.#ready;
    await this.#memory.commitItems(change);
    await this.#store.set(
      this.#itemsKey(),
      JSON.stringify(this.#memory.exportItems()),
    );
  }

  async #persist(): Promise<void> {
    const tables = await this.#memory.readTables();
    if (tables == null) return;
    await this.#store.set(this.#storageKey, JSON.stringify(tables));
  }

  async readTables(): Promise<DurableTables | null> {
    await this.#ready;
    return this.#memory.readTables();
  }

  async insertWorld(tables: DurableTables): Promise<void> {
    await this.#ready;
    await this.#memory.insertWorld(tables);
    await this.#persist();
  }

  async commit(batch: CommitBatch): Promise<void> {
    await this.#ready;
    await this.#memory.commit(batch);
    await this.#persist();
  }

  async readHostClock(): Promise<PersistedHostClock | null> {
    await this.#ready;
    return this.#memory.readHostClock();
  }

  async writeHostClock(clock: PersistedHostClock): Promise<void> {
    await this.#ready;
    await this.#memory.writeHostClock(clock);
    await this.#persist();
  }

  async readCreatureNftLinks() {
    await this.#ready;
    return this.#memory.readCreatureNftLinks();
  }

  async upsertCreatureNftLink(row: CreatureNftLinkRow) {
    await this.#ready;
    await this.#memory.upsertCreatureNftLink(row);
    await this.#persist();
  }

  async readAssetMintLinks() {
    await this.#ready;
    return this.#memory.readAssetMintLinks();
  }

  async upsertAssetMintLink(row: AssetMintLinkRow) {
    await this.#ready;
    await this.#memory.upsertAssetMintLink(row);
    await this.#persist();
  }
}
