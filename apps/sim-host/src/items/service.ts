/**
 * M22 item service (host edge). Owns the off-chain inventory and the checks
 * around the two item influences; the kernel only ever sees their effects.
 *
 * - Only wallet accounts (`w:<hex>`) and the local single-player account can
 *   hold items. Guests cannot gather, craft, or use (anti-farming).
 * - GATHER_RESOURCE and USE_ITEM are influences, so they share the existing
 *   3-per-24h budget. Crafting is not an influence and costs no budget.
 * - LPIT reward consumables (Vitality, Calm, Rations) are mirrored into the
 *   inventory from their asset mint rows (`mint:<mintKey>` lots), whatever the
 *   on-chain status. Using one debits the lot; the LPIT token itself is not
 *   burned (see docs/DESIGN.md "Items"): usage is tracked in the DB.
 * - Relics are LPAR NFTs, never lots. Honoring one needs the account's wallet
 *   to hold it and is limited to once per 7 days per relic.
 */
import {
  GATHER_RULES,
  InfluenceKind,
  ItemCategory,
  isItemSlug,
  itemDef,
  type InfluenceSubmit,
  type InventoryView,
  type ItemSlug,
  type RelicHolding,
} from "@boing-pets/contract";
import { gatherYield, resourceStock } from "@boing-pets/sim";
import type { AssetMintLinkRow } from "../boing/asset-mint-link";
import { walletFromAccountId } from "../boing/influence-rewards";
import { AssetMintClass } from "../boing/taxonomy";
import { LOCAL_ACCOUNT_ID } from "../multiplayer/account";
import type { WorldRepository } from "../persist/repository";
import type { HostSession } from "../session";
import {
  balanceOf,
  craftableOutputs,
  inventoryEntries,
  nextLotId,
  planCraft,
  planDebit,
  spoilTick,
} from "./inventory";
import {
  ARTIFACT_RELIC_SLUG,
  RELIC_ARTIFACT_KIND,
  type RelicChain,
} from "./relics";
import {
  planItemEscrowReconcile,
  type ChainItemListing,
  type ItemListingStatus,
} from "./escrow-reconcile";
import type { InfluenceAccountRow, InventoryLotRow } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ItemCheck =
  { ok: true; submit: InfluenceSubmit } | { ok: false; detail: string };

export type CraftResult =
  { ok: true; lotId: number } | { ok: false; detail: string };

export function canHoldItems(accountId: string): boolean {
  return (
    accountId === LOCAL_ACCOUNT_ID || walletFromAccountId(accountId) != null
  );
}

function sameHex(a: string | null, b: string | null): boolean {
  return a != null && b != null && a.toLowerCase() === b.toLowerCase();
}

export type ItemService = ReturnType<typeof createItemService>;

export function createItemService(options: {
  repository: WorldRepository;
  /** Asset mint rows (LPIT rewards, LPAR relics). */
  assetLinks: () => Promise<readonly AssetMintLinkRow[]>;
  /** On-chain owner reads for relics; null trusts the mint recipient. */
  chain?: RelicChain | null;
}) {
  const repo = options.repository;
  const enabled =
    repo.readInventoryLots != null &&
    repo.readInfluenceAccounts != null &&
    repo.commitItems != null;

  // Every read-modify-write of the lots runs one at a time: lot ids come from
  // the current max, so two interleaved writers could pick the same id.
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = chain.then(run, run);
    chain = next.catch(() => undefined);
    return next;
  }

  async function lots(worldId: number): Promise<InventoryLotRow[]> {
    return repo.readInventoryLots ? repo.readInventoryLots(worldId) : [];
  }

  async function accounts(worldId: number): Promise<InfluenceAccountRow[]> {
    return repo.readInfluenceAccounts
      ? repo.readInfluenceAccounts(worldId)
      : [];
  }

  /** Relic artifacts currently held by the account's wallet. */
  async function relicsHeld(
    worldId: number,
    accountId: string,
  ): Promise<AssetMintLinkRow[]> {
    const wallet = walletFromAccountId(accountId);
    if (wallet == null) return [];
    const links = (await options.assetLinks()).filter(
      (row) =>
        row.worldId === worldId &&
        row.tokenClass === AssetMintClass.UNIQUE_LINEAGE_ARTIFACT &&
        row.artifactKind != null &&
        ARTIFACT_RELIC_SLUG[row.artifactKind] != null,
    );
    const held: AssetMintLinkRow[] = [];
    for (const link of links) {
      let owner = link.recipientHex;
      if (options.chain != null && link.status === "CONFIRMED") {
        try {
          owner = await options.chain.ownerOf(
            link.collectionHex,
            link.tokenIdHex,
          );
        } catch {
          // Fall back to the mint recipient when the RPC is unavailable.
        }
      }
      if (sameHex(owner, wallet)) held.push(link);
    }
    return held;
  }

  function lastRelicUseMs(
    rows: readonly InfluenceAccountRow[],
    slug: string,
    lineageId: number,
  ): number | null {
    let last: number | null = null;
    for (const row of rows) {
      if (row.kind !== InfluenceKind.USE_ITEM) continue;
      if (row.itemSlug !== slug || row.lineageId !== lineageId) continue;
      if (last == null || row.acceptedAtMs > last) last = row.acceptedAtMs;
    }
    return last;
  }

  /**
   * Mirror LPIT reward rows into inventory lots. Idempotent by
   * `mint:<mintKey>`; runs at boot and after a reward is queued.
   */
  async function syncRewardLotsNow(
    worldId: number,
    tick: number,
    nowMs: number,
  ): Promise<number> {
    if (!enabled || repo.commitItems == null) return 0;
    const current = await lots(worldId);
    const have = new Set(current.map((lot) => lot.sourceKey));
    const add: InventoryLotRow[] = [];
    let id = nextLotId(current);
    for (const link of await options.assetLinks()) {
      if (link.worldId !== worldId) continue;
      if (link.tokenClass !== AssetMintClass.COMPRESSED_ITEM) continue;
      if (link.itemSlug == null || !isItemSlug(link.itemSlug)) continue;
      if (link.recipientHex == null) continue;
      const sourceKey = `mint:${link.mintKey}`;
      if (have.has(sourceKey)) continue;
      const amount = Math.max(1, link.amount ?? 1);
      add.push({
        id,
        worldId,
        accountId: `w:${link.recipientHex.replace(/^0x/, "").toLowerCase()}`,
        sourceKey,
        itemSlug: link.itemSlug,
        amount,
        remaining: amount,
        gainedTick: tick,
        spoilsAtTick: null,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      });
      id += 1;
      have.add(sourceKey);
    }
    if (add.length > 0) {
      await repo.commitItems({
        upsertLots: add,
        insertInfluenceAccounts: [],
      });
    }
    return add.length;
  }

  const service = {
    enabled,

    /**
     * Mirror LPIT reward rows into inventory lots. Idempotent by
     * `mint:<mintKey>`; runs at boot and after a reward is queued.
     */
    syncRewardLots(worldId: number, tick: number, nowMs: number) {
      return serial(() => syncRewardLotsNow(worldId, tick, nowMs));
    },

    /**
     * Apply item-escrow listings, fills and cancels to the inventory (see
     * escrow-reconcile.ts). Idempotent; returns each listing's backing.
     */
    reconcileItemEscrow(input: {
      worldId: number;
      tick: number;
      escrowHex: string;
      listings: readonly ChainItemListing[];
      nowMs: number;
    }): Promise<Map<number, ItemListingStatus>> {
      return serial(async () => {
        if (!enabled || repo.commitItems == null) return new Map();
        const plan = planItemEscrowReconcile({
          lots: await lots(input.worldId),
          worldId: input.worldId,
          escrowHex: input.escrowHex,
          listings: input.listings,
          tick: input.tick,
          nowMs: input.nowMs,
        });
        if (plan.changed.length > 0) {
          await repo.commitItems({
            upsertLots: plan.changed,
            insertInfluenceAccounts: [],
          });
        }
        return plan.status;
      });
    },

    /** Usable (unused, unspoiled) units of one item for an account. */
    async usableUnits(
      worldId: number,
      accountId: string,
      slug: string,
      tick: number,
    ): Promise<number> {
      return balanceOf(await lots(worldId), accountId, slug, tick);
    },

    /**
     * Validate an item influence and fill host-granted fields (gather units).
     * Other kinds pass through untouched.
     */
    async prepare(
      session: HostSession,
      accountId: string,
      submit: InfluenceSubmit,
      nowMs: number,
    ): Promise<ItemCheck> {
      if (
        submit.kind !== InfluenceKind.GATHER_RESOURCE &&
        submit.kind !== InfluenceKind.USE_ITEM
      ) {
        return { ok: true, submit };
      }
      if (!enabled)
        return { ok: false, detail: "items are not available here" };
      if (!canHoldItems(accountId)) {
        return {
          ok: false,
          detail: "connect a wallet to gather and use items",
        };
      }
      const snapshot = session.snapshot;
      const tick = snapshot.world.lastTick + 1;
      const worldId = snapshot.world.id;

      if (submit.kind === InfluenceKind.GATHER_RESOURCE) {
        const territoryId = submit.payload.territoryId;
        const stock = resourceStock(snapshot, territoryId, tick);
        if (stock == null) return { ok: false, detail: "nothing grows there" };
        const units = gatherYield(
          snapshot,
          territoryId,
          snapshot.world.nextInfluenceId,
          tick,
        );
        if (units <= 0) {
          return {
            ok: false,
            detail: "this territory is picked clean; it regrows soon",
          };
        }
        return {
          ok: true,
          submit: {
            kind: InfluenceKind.GATHER_RESOURCE,
            payload: { territoryId, resource: stock.resource, units },
          },
        };
      }

      const { item, territoryId, lineageId } = submit.payload;
      const def = itemDef(item);
      if (def == null || def.effect == null) {
        return { ok: false, detail: "that item cannot be used" };
      }
      if (def.target === "TERRITORY") {
        if (!snapshot.territories.some((row) => row.id === territoryId)) {
          return { ok: false, detail: "choose a territory" };
        }
      } else if (!snapshot.lineages.some((row) => row.id === lineageId)) {
        return { ok: false, detail: "choose a lineage" };
      }
      const clean: InfluenceSubmit = {
        kind: InfluenceKind.USE_ITEM,
        payload:
          def.target === "TERRITORY"
            ? { item: def.slug, territoryId }
            : { item: def.slug, lineageId },
      };

      if (def.category === ItemCategory.RELIC) {
        // A relic honors its own lineage.
        const kind = RELIC_ARTIFACT_KIND[def.slug];
        const held = await relicsHeld(worldId, accountId);
        const mine = held.find(
          (row) => row.artifactKind === kind && row.lineageId === lineageId,
        );
        if (mine == null)
          return { ok: false, detail: "you do not hold that relic" };
        const last = lastRelicUseMs(
          await accounts(worldId),
          def.slug,
          lineageId ?? 0,
        );
        const cooldown = (def.useCooldownDays ?? 0) * DAY_MS;
        if (last != null && nowMs - last < cooldown) {
          return { ok: false, detail: "this relic was honored this week" };
        }
        return { ok: true, submit: clean };
      }

      const have = balanceOf(await lots(worldId), accountId, def.slug, tick);
      if (have < 1)
        return { ok: false, detail: `no ${def.displayName} in your bag` };
      return { ok: true, submit: clean };
    },

    /**
     * After the influence row is durable: record the account, credit a
     * gather, debit a used item. Idempotent by influence id.
     */
    async afterAcceptNow(
      session: HostSession,
      accountId: string,
      submit: InfluenceSubmit,
      influenceId: number,
      issuedAtTick: number,
      nowMs: number,
    ) {
      if (!enabled || repo.commitItems == null) return;
      const snapshot = session.snapshot;
      const worldId = snapshot.world.id;
      const payload = submit.payload as {
        lineageId?: number;
        territoryId?: number;
        item?: string;
        resource?: string;
        units?: number;
      };
      const account: InfluenceAccountRow = {
        influenceId,
        worldId,
        accountId,
        kind: submit.kind,
        lineageId: payload.lineageId ?? null,
        territoryId: payload.territoryId ?? null,
        itemSlug: payload.item ?? payload.resource ?? null,
        acceptedAtMs: nowMs,
      };
      const upsertLots: InventoryLotRow[] = [];
      const current = await lots(worldId);
      if (submit.kind === InfluenceKind.GATHER_RESOURCE) {
        const sourceKey = `gather:${influenceId}`;
        if (!current.some((lot) => lot.sourceKey === sourceKey)) {
          const units = submit.payload.units;
          upsertLots.push({
            id: nextLotId(current),
            worldId,
            accountId,
            sourceKey,
            itemSlug: submit.payload.resource,
            amount: units,
            remaining: units,
            gainedTick: issuedAtTick,
            spoilsAtTick: spoilTick(
              submit.payload.resource,
              issuedAtTick,
              snapshot.ruleset.ticksPerDay,
            ),
            createdAtMs: nowMs,
            updatedAtMs: nowMs,
          });
        }
      } else if (submit.kind === InfluenceKind.USE_ITEM) {
        const def = itemDef(submit.payload.item);
        const already = (await accounts(worldId)).some(
          (row) => row.influenceId === influenceId,
        );
        if (def != null && def.category !== ItemCategory.RELIC && !already) {
          const debit = planDebit(
            current,
            accountId,
            def.slug,
            1,
            issuedAtTick,
            nowMs,
          );
          if (debit != null) upsertLots.push(...debit);
        }
      }
      await repo.commitItems({
        upsertLots,
        insertInfluenceAccounts: [account],
      });
    },

    async craftNow(
      session: HostSession,
      accountId: string,
      output: string,
      nowMs: number,
    ): Promise<CraftResult> {
      if (!enabled || repo.commitItems == null) {
        return { ok: false, detail: "items are not available here" };
      }
      if (!canHoldItems(accountId)) {
        return { ok: false, detail: "connect a wallet to craft" };
      }
      if (!isItemSlug(output)) return { ok: false, detail: "unknown recipe" };
      const snapshot = session.snapshot;
      const current = await lots(snapshot.world.id);
      const changed = planCraft({
        lots: current,
        worldId: snapshot.world.id,
        accountId,
        output,
        tick: snapshot.world.lastTick,
        ticksPerDay: snapshot.ruleset.ticksPerDay,
        nowMs,
      });
      if (changed == null) return { ok: false, detail: "missing ingredients" };
      await repo.commitItems({
        upsertLots: changed,
        insertInfluenceAccounts: [],
      });
      const made = changed[changed.length - 1];
      return { ok: true, lotId: made?.id ?? 0 };
    },

    async inventory(
      session: HostSession,
      accountId: string,
      nowMs: number,
    ): Promise<InventoryView> {
      const snapshot = session.snapshot;
      const worldId = snapshot.world.id;
      const tick = snapshot.world.lastTick;
      const current = await lots(worldId);
      const history = await accounts(worldId);
      const relics: RelicHolding[] = [];
      for (const link of await relicsHeld(worldId, accountId)) {
        const slug = ARTIFACT_RELIC_SLUG[link.artifactKind ?? ""];
        if (slug == null || link.lineageId == null) continue;
        const last = lastRelicUseMs(history, slug, link.lineageId);
        const cooldown = (itemDef(slug)?.useCooldownDays ?? 0) * DAY_MS;
        relics.push({
          slug,
          lineageId: link.lineageId,
          tokenSerial: link.tokenSerial ?? 0,
          mintStatus: link.status,
          usableAtMs:
            last != null && nowMs - last < cooldown ? last + cooldown : null,
        });
      }
      const stocks: InventoryView["stocks"] = [];
      for (const territory of [...snapshot.territories].sort(
        (a, b) => a.id - b.id,
      )) {
        const stock = resourceStock(snapshot, territory.id, tick + 1);
        if (stock == null) continue;
        stocks.push({
          territoryId: territory.id,
          resource: stock.resource,
          free: stock.free,
          cap: GATHER_RULES.stockCap,
        });
      }
      return {
        accountId,
        tick,
        canHoldItems: enabled && canHoldItems(accountId),
        items: inventoryEntries(current, accountId, tick),
        relics,
        craftable: craftableOutputs(current, accountId, tick) as ItemSlug[],
        stocks,
      };
    },
  };

  const { afterAcceptNow, craftNow, ...rest } = service;
  return {
    ...rest,
    /**
     * After the influence row is durable: record the account, credit a
     * gather, debit a used item. Idempotent by influence id.
     */
    afterAccept: (...args: Parameters<typeof afterAcceptNow>) =>
      serial(() => afterAcceptNow(...args)),
    craft: (...args: Parameters<typeof craftNow>) =>
      serial(() => craftNow(...args)),
  };
}
