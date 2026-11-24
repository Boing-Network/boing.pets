/**
 * M22 item service (host edge). Owns the off-chain inventory and the checks
 * around the two item influences; the kernel only ever sees their effects.
 *
 * - Only wallet accounts (`w:<hex>`) and the local single-player account can
 *   hold items. Guests cannot gather, craft, or use (anti-farming).
 * - GATHER_RESOURCE and USE_ITEM are influences (recorded and replayed) but
 *   are not rate limited. Crafting is not an influence.
 * - LPIT reward consumables (Vitality, Calm, Rations) are mirrored into the
 *   inventory from their asset mint rows (`mint:<mintKey>` lots), whatever the
 *   on-chain status. Using one debits the lot; the LPIT token itself is not
 *   burned (see docs/DESIGN.md "Items"): usage is tracked in the DB.
 * - Relics are LPAR NFTs, never lots. Honoring one needs the account's wallet
 *   to hold it and is limited to once per 7 days per relic.
 * - Creature autonomy (items/autonomy.ts): creatures loot, craft and use on
 *   their own. Loot lots are credited after the tick commits; crafts and uses
 *   are CREATURE_* influences that cost the keeper no budget and only ever
 *   take unminted, unlisted units.
 * - Mint on demand: items live off chain until the keeper mints them from
 *   the marketplace (`requestMint`); minted lots back item listings.
 */
import {
  AUTONOMY_RULES,
  CreatureStatus,
  DEFAULT_ITEM_AUTONOMY,
  GATHER_RULES,
  InfluenceKind,
  ItemCategory,
  MINT_RULES,
  isItemSlug,
  itemDef,
  lpitItemId,
  type InfluenceSubmit,
  type InventoryView,
  type ItemAutonomyCommand,
  type ItemAutonomySettings,
  type ItemSlug,
  type MarketMintInfo,
  type MarketMintRetryable,
  type RelicHolding,
  type SystemInfluence,
  type WorldEventView,
} from "@boing-pets/contract";
import {
  gatherYield,
  planCreatureAutonomy,
  resourceStock,
} from "@boing-pets/sim";
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
  type MintFilter,
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
import {
  autonomyBags,
  planAutonomyInventory,
  planLootCredits,
  usesLast24h,
  type AppliedIntent,
  type CreatureOwnerOf,
} from "./autonomy";
import type { CompressedItemMintJob } from "../boing/types";
import { weiToBoing } from "../market/mint-payment";
import type {
  InfluenceAccountRow,
  InventoryLotRow,
  ItemAutonomyRow,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ItemCheck =
  { ok: true; submit: InfluenceSubmit } | { ok: false; detail: string };

export type CraftResult =
  { ok: true; lotId: number } | { ok: false; detail: string };

export type MintRequestResult =
  | { ok: true; mintKey: string; qty: number; retried: boolean }
  | { ok: false; detail: string };

/**
 * Mint key prefix for mint-on-demand claims: `claim:<payment tx hex>`. The
 * claim lot is `mint:claim:<tx>`; both are unique per world, so one fee
 * payment backs at most one claim and one LPIT mint.
 */
export const CLAIM_MINT_PREFIX = "claim:";

/** `claim:<64 hex>` for a payment tx id (`0x` + 64 hex). */
export function claimMintKey(paymentTx: string): string {
  return `${CLAIM_MINT_PREFIX}${paymentTx.replace(/^0x/i, "").toLowerCase()}`;
}

/** The payment tx id behind a paid claim key, or null. */
export function claimPaymentTx(mintKey: string): string | null {
  if (!mintKey.startsWith(CLAIM_MINT_PREFIX)) return null;
  const hex = mintKey.slice(CLAIM_MINT_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(hex) ? `0x${hex}` : null;
}

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
  /**
   * Queue an LPIT mint through the operator's nonce queue (mint on demand).
   * Absent or disabled: minting is unavailable.
   */
  mint?: {
    enabled: boolean;
    queue: (job: CompressedItemMintJob) => Promise<void>;
    /** Player fee per request (base units) and where it goes. */
    feeWei?: bigint;
    payToHex?: string | null;
  } | null;
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

  async function autonomyRows(worldId: number): Promise<ItemAutonomyRow[]> {
    return repo.readItemAutonomy ? repo.readItemAutonomy(worldId) : [];
  }

  function settingsFrom(
    rows: readonly ItemAutonomyRow[],
    accountId: string,
  ): ItemAutonomySettings {
    const row = rows.find((r) => r.accountId === accountId);
    return row == null
      ? { ...DEFAULT_ITEM_AUTONOMY }
      : { autoCraft: row.autoCraft, autoUse: row.autoUse };
  }

  /** Recent mint-on-demand claims by one wallet (rate limit). */
  async function recentClaims(
    worldId: number,
    walletHex: string,
    nowMs: number,
  ): Promise<number> {
    let n = 0;
    for (const link of await options.assetLinks()) {
      if (link.worldId !== worldId) continue;
      if (link.tokenClass !== AssetMintClass.COMPRESSED_ITEM) continue;
      if (!link.mintKey.startsWith(CLAIM_MINT_PREFIX)) continue;
      if (!sameHex(link.recipientHex, walletHex)) continue;
      if (nowMs - link.createdAtMs < DAY_MS) n += 1;
    }
    return n;
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
        minted: true,
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

    /**
     * Usable (unused, unspoiled) units of one item for an account; `which`
     * narrows to minted (the market backing) or unminted units.
     */
    async usableUnits(
      worldId: number,
      accountId: string,
      slug: string,
      tick: number,
      which: MintFilter = "any",
    ): Promise<number> {
      return balanceOf(await lots(worldId), accountId, slug, tick, which);
    },

    /** Unminted units a wallet can mint, and units it is minting now. */
    async offchainUnits(
      worldId: number,
      walletHex: string,
      slug: string,
      tick: number,
    ): Promise<{ unminted: number; minting: number }> {
      const accountId = `w:${walletHex.replace(/^0x/i, "").toLowerCase()}`;
      const unminted = balanceOf(
        await lots(worldId),
        accountId,
        slug,
        tick,
        "unminted",
      );
      let minting = 0;
      for (const link of await options.assetLinks()) {
        if (link.worldId !== worldId) continue;
        if (link.tokenClass !== AssetMintClass.COMPRESSED_ITEM) continue;
        if (!link.mintKey.startsWith(CLAIM_MINT_PREFIX)) continue;
        if (link.itemSlug !== slug || !sameHex(link.recipientHex, walletHex)) {
          continue;
        }
        if (link.status !== "CONFIRMED") minting += link.amount ?? 0;
      }
      return { unminted, minting };
    },

    /** Mint-on-demand terms and this wallet's requests left today. */
    async mintInfo(
      worldId: number,
      walletHex: string | null,
      nowMs: number,
    ): Promise<MarketMintInfo> {
      const on = enabled && options.mint?.enabled === true;
      const feeWei = options.mint?.feeWei ?? BigInt(MINT_RULES.defaultFeeWei);
      const retryable: MarketMintRetryable[] = [];
      if (walletHex != null) {
        for (const link of await options.assetLinks()) {
          if (link.worldId !== worldId) continue;
          if (link.tokenClass !== AssetMintClass.COMPRESSED_ITEM) continue;
          if (link.status !== "FAILED") continue;
          const paymentTx = claimPaymentTx(link.mintKey);
          if (paymentTx == null || !sameHex(link.recipientHex, walletHex)) {
            continue;
          }
          retryable.push({
            paymentTx,
            itemSlug: link.itemSlug ?? "",
            qty: link.amount ?? 0,
            error: link.lastError ?? null,
          });
        }
      }
      return {
        enabled: on,
        minQty: MINT_RULES.minQty,
        maxQty: MINT_RULES.maxQty,
        maxRequestsPerDay: MINT_RULES.maxRequestsPerDay,
        requestsLeft:
          walletHex == null
            ? null
            : Math.max(
                0,
                MINT_RULES.maxRequestsPerDay -
                  (await recentClaims(worldId, walletHex, nowMs)),
              ),
        note: on
          ? `Items stay in your world bag until you mint them. Minting sends them to your wallet as LPIT tokens. Each mint request costs a ${weiToBoing(feeWei)} BOING fee (one transfer to the operator, which pays the mint gas); if the mint then fails you can retry it without paying again. Minted items can be listed but your creatures will no longer use them.`
          : "Minting is not enabled on this server.",
        feeWei: feeWei.toString(),
        feeBoing: weiToBoing(feeWei),
        payToHex: options.mint?.payToHex ?? null,
        retryable,
      };
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

      const { item, territoryId, lineageId, creatureId } = submit.payload;
      const def = itemDef(item);
      if (def == null || def.effect == null) {
        return { ok: false, detail: "that item cannot be used" };
      }
      if (def.target === "TERRITORY") {
        if (!snapshot.territories.some((row) => row.id === territoryId)) {
          return { ok: false, detail: "choose a territory" };
        }
      } else if (def.target === "CREATURE") {
        const creature = snapshot.creatures.find(
          (row) => row.id === creatureId,
        );
        if (creature == null || creature.status !== CreatureStatus.ALIVE) {
          return { ok: false, detail: "choose a living creature" };
        }
      } else if (!snapshot.lineages.some((row) => row.id === lineageId)) {
        return { ok: false, detail: "choose a lineage" };
      }
      const clean: InfluenceSubmit = {
        kind: InfluenceKind.USE_ITEM,
        payload:
          def.target === "TERRITORY"
            ? { item: def.slug, territoryId }
            : def.target === "CREATURE"
              ? { item: def.slug, creatureId }
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
            minted: false,
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
            // Burn off-chain units before ones that exist as LPIT.
            { prefer: "unminted" },
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

    /**
     * Credit loot events (after their tick is durable) to each creature's
     * keeper or pouch. Idempotent by `loot:<eventId>`. Returns lots added.
     */
    async creditLootNow(
      session: HostSession,
      events: readonly WorldEventView[],
      ownerOf: CreatureOwnerOf,
      nowMs: number,
    ): Promise<number> {
      if (!enabled || repo.commitItems == null || events.length === 0) {
        return 0;
      }
      const snapshot = session.snapshot;
      const add = planLootCredits({
        lots: await lots(snapshot.world.id),
        events,
        worldId: snapshot.world.id,
        ownerOf: (id) => {
          const owner = ownerOf(id);
          return owner != null && canHoldItems(owner) ? owner : null;
        },
        ticksPerDay: snapshot.ruleset.ticksPerDay,
        nowMs,
      });
      if (add.length > 0) {
        await repo.commitItems({
          upsertLots: add,
          insertInfluenceAccounts: [],
        });
      }
      return add.length;
    },

    /**
     * One creature autonomy pass: plan crafts and uses, persist them as
     * CREATURE_* influences (`persist`), then debit the bags keyed by those
     * influence ids. Runs inside the item lock, so no other inventory write
     * (gather, craft, escrow reconcile, mint) interleaves.
     */
    async runAutonomyNow(
      session: HostSession,
      deps: {
        ownerOf: CreatureOwnerOf;
        lastUseTick: Map<number, number>;
        persist: (
          records: readonly SystemInfluence[],
        ) => Promise<readonly { id: number }[]>;
        nowMs: number;
      },
    ): Promise<AppliedIntent[]> {
      if (!enabled || repo.commitItems == null) return [];
      const snapshot = session.snapshot;
      const worldId = snapshot.world.id;
      const tick = snapshot.world.lastTick;
      const current = await lots(worldId);
      const history = await accounts(worldId);
      const settings = await autonomyRows(worldId);
      const intents = planCreatureAutonomy({
        snapshot,
        tick,
        bagsFor: autonomyBags({
          lots: current,
          tick,
          ownerOf: deps.ownerOf,
          settingsOf: (accountId) => settingsFrom(settings, accountId),
          usesToday: usesLast24h(history, deps.nowMs),
          canHold: canHoldItems,
        }),
        lastUseTick: deps.lastUseTick,
        useCooldownTicks: AUTONOMY_RULES.useCooldownTicks,
        maxCraftsPerBag: AUTONOMY_RULES.maxCraftsPerBagPerPass,
      });
      if (intents.length === 0) return [];
      const records: SystemInfluence[] = intents.map((intent) =>
        intent.kind === "CRAFT"
          ? {
              kind: InfluenceKind.CREATURE_CRAFT,
              payload: { creatureId: intent.creatureId, output: intent.output },
            }
          : {
              kind: InfluenceKind.CREATURE_USE_ITEM,
              payload: {
                creatureId: intent.creatureId,
                item: intent.item,
                territoryId: intent.territoryId,
              },
            },
      );
      const ids = await deps.persist(records);
      if (ids.length !== intents.length) return [];
      const applied: AppliedIntent[] = intents.map((intent, i) => ({
        ...intent,
        influenceId: ids[i]!.id,
      }));
      const lineage = new Map(
        snapshot.creatures.map((row) => [row.id, row.lineageId]),
      );
      const plan = planAutonomyInventory({
        lots: current,
        accounts: history,
        intents: applied,
        worldId,
        tick,
        ticksPerDay: snapshot.ruleset.ticksPerDay,
        lineageOf: (id) => lineage.get(id) ?? null,
        nowMs: deps.nowMs,
      });
      await repo.commitItems({
        upsertLots: plan.upsertLots,
        insertInfluenceAccounts: plan.accounts,
      });
      for (const intent of applied) {
        if (intent.kind === "USE") {
          deps.lastUseTick.set(intent.creatureId, tick + 1);
        }
      }
      return applied;
    },

    async autonomySettings(
      worldId: number,
      accountId: string,
    ): Promise<ItemAutonomySettings> {
      return settingsFrom(await autonomyRows(worldId), accountId);
    },

    async setAutonomyNow(
      worldId: number,
      accountId: string,
      change: ItemAutonomyCommand,
      nowMs: number,
    ): Promise<{ ok: true } | { ok: false; detail: string }> {
      if (!enabled || repo.commitItems == null) {
        return { ok: false, detail: "items are not available here" };
      }
      if (!canHoldItems(accountId)) {
        return { ok: false, detail: "connect a wallet to keep a bag" };
      }
      const current = settingsFrom(await autonomyRows(worldId), accountId);
      const next: ItemAutonomySettings = {
        autoCraft:
          typeof change.autoCraft === "boolean"
            ? change.autoCraft
            : current.autoCraft,
        autoUse:
          typeof change.autoUse === "boolean"
            ? change.autoUse
            : current.autoUse,
      };
      await repo.commitItems({
        upsertLots: [],
        insertInfluenceAccounts: [],
        upsertAutonomy: [{ worldId, accountId, ...next, updatedAtMs: nowMs }],
      });
      return { ok: true };
    },

    /**
     * Mint on demand: move `qty` unminted units of `slug` from the wallet's
     * bag into a minted lot `mint:claim:<lotId>` and return the LPIT mint job
     * keyed `claim:<lotId>` (unique per world, so it can never mint twice).
     * The caller queues the job outside the lock.
     */
    async requestMintNow(input: {
      worldId: number;
      walletHex: string;
      slug: string;
      qty: number;
      /** Verified fee transfer (`0x` + 64 hex); keys the claim. */
      paymentTx: string;
      tick: number;
      nowMs: number;
    }): Promise<
      | { ok: true; job: CompressedItemMintJob; retried: boolean }
      | { ok: false; detail: string }
    > {
      if (!enabled || repo.commitItems == null) {
        return { ok: false, detail: "items are not available here" };
      }
      if (options.mint == null || !options.mint.enabled) {
        return { ok: false, detail: "minting is not enabled on this host" };
      }
      const def = itemDef(input.slug);
      const itemKindId = def == null ? null : lpitItemId(def.slug);
      if (def == null || itemKindId == null) {
        return { ok: false, detail: "that item cannot be minted" };
      }
      if (
        !Number.isSafeInteger(input.qty) ||
        input.qty < MINT_RULES.minQty ||
        input.qty > MINT_RULES.maxQty
      ) {
        return {
          ok: false,
          detail: `mint ${MINT_RULES.minQty}–${MINT_RULES.maxQty} at a time`,
        };
      }
      const wallet = `0x${input.walletHex.replace(/^0x/i, "").toLowerCase()}`;
      const accountId = `w:${wallet.slice(2)}`;
      if (!/^0x[0-9a-f]{64}$/i.test(input.paymentTx)) {
        return { ok: false, detail: "payment tx id" };
      }
      const mintKey = claimMintKey(input.paymentTx);
      const current = await lots(input.worldId);
      // Each payment counts once. Asking again with a payment that already
      // has a claim re-queues that claim's mint (no new units, no new fee).
      const prior = current.find((lot) => lot.sourceKey === `mint:${mintKey}`);
      if (prior != null) {
        if (prior.accountId !== accountId) {
          return { ok: false, detail: "that payment was already used" };
        }
        const priorKind = lpitItemId(prior.itemSlug as ItemSlug);
        if (priorKind == null) {
          return { ok: false, detail: "that payment was already used" };
        }
        return {
          ok: true,
          retried: true,
          job: {
            worldId: input.worldId,
            mintKey,
            itemKindId: priorKind,
            amount: prior.amount,
            itemSlug: prior.itemSlug,
            metadataHashHex: null,
            recipientHex: wallet,
          },
        };
      }
      if (
        (await recentClaims(input.worldId, wallet, input.nowMs)) >=
        MINT_RULES.maxRequestsPerDay
      ) {
        return {
          ok: false,
          detail: `${MINT_RULES.maxRequestsPerDay} mints per day; try again tomorrow`,
        };
      }
      const debit = planDebit(
        current,
        accountId,
        def.slug,
        input.qty,
        input.tick,
        input.nowMs,
        { only: "unminted" },
      );
      if (debit == null) {
        return { ok: false, detail: `not enough unminted ${def.displayName}` };
      }
      const id = nextLotId(current);
      const claimed: InventoryLotRow = {
        id,
        worldId: input.worldId,
        accountId,
        // syncRewardLots mirrors `mint:<mintKey>`; this lot is that mirror.
        sourceKey: `mint:${mintKey}`,
        itemSlug: def.slug,
        amount: input.qty,
        remaining: input.qty,
        gainedTick: input.tick,
        // On-chain units do not spoil.
        spoilsAtTick: null,
        minted: true,
        createdAtMs: input.nowMs,
        updatedAtMs: input.nowMs,
      };
      await repo.commitItems({
        upsertLots: [...debit, claimed],
        insertInfluenceAccounts: [],
      });
      return {
        ok: true,
        retried: false,
        job: {
          worldId: input.worldId,
          mintKey,
          itemKindId,
          amount: input.qty,
          itemSlug: def.slug,
          metadataHashHex: null,
          recipientHex: wallet,
        },
      };
    },

    /**
     * Off-chain-first rewards: an influence reward becomes an unminted lot
     * `reward:<mintKey>` instead of an LPIT mint. Idempotent.
     */
    async creditRewardLotsNow(
      worldId: number,
      jobs: readonly CompressedItemMintJob[],
      tick: number,
      nowMs: number,
    ): Promise<number> {
      if (!enabled || repo.commitItems == null || jobs.length === 0) return 0;
      const current = await lots(worldId);
      const have = new Set(current.map((lot) => lot.sourceKey));
      const add: InventoryLotRow[] = [];
      let id = nextLotId(current);
      for (const job of jobs) {
        if (job.recipientHex == null || !isItemSlug(job.itemSlug)) continue;
        const sourceKey = `reward:${job.mintKey}`;
        if (have.has(sourceKey)) continue;
        have.add(sourceKey);
        add.push({
          id,
          worldId,
          accountId: `w:${job.recipientHex.replace(/^0x/i, "").toLowerCase()}`,
          sourceKey,
          itemSlug: job.itemSlug,
          amount: job.amount,
          remaining: job.amount,
          gainedTick: tick,
          spoilsAtTick: null,
          minted: false,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        });
        id += 1;
      }
      if (add.length > 0) {
        await repo.commitItems({
          upsertLots: add,
          insertInfluenceAccounts: [],
        });
      }
      return add.length;
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
        autonomy: settingsFrom(await autonomyRows(worldId), accountId),
      };
    },
  };

  const {
    afterAcceptNow,
    craftNow,
    creditLootNow,
    runAutonomyNow,
    setAutonomyNow,
    requestMintNow,
    creditRewardLotsNow,
    ...rest
  } = service;
  return {
    ...rest,
    /** True when this host can mint on demand. */
    get mintEnabled() {
      return options.mint?.enabled === true;
    },
    creditLoot: (...args: Parameters<typeof creditLootNow>) =>
      serial(() => creditLootNow(...args)),
    runAutonomy: (...args: Parameters<typeof runAutonomyNow>) =>
      serial(() => runAutonomyNow(...args)),
    setAutonomy: (...args: Parameters<typeof setAutonomyNow>) =>
      serial(() => setAutonomyNow(...args)),
    creditRewardLots: (...args: Parameters<typeof creditRewardLotsNow>) =>
      serial(() => creditRewardLotsNow(...args)),
    /**
     * Mint on demand (see requestMintNow). The inventory move is under the
     * lock; the LPIT mint is queued after it, through the nonce queue.
     */
    async requestMint(
      input: Parameters<typeof requestMintNow>[0],
    ): Promise<MintRequestResult> {
      const result = await serial(() => requestMintNow(input));
      if (!result.ok) return result;
      const queue = options.mint?.queue;
      if (queue != null) {
        void queue(result.job).catch(() => {
          // Recorded on the asset link row; drain retries it.
        });
      }
      return {
        ok: true,
        mintKey: result.job.mintKey,
        qty: result.job.amount,
        retried: result.retried,
      };
    },
    /**
     * Re-queue a paid claim whose mint is not confirmed (FAILED or still
     * PENDING). No inventory moves and no new fee. The mint edge only
     * submits PENDING/FAILED rows and keys them on `claim:<tx>`, so this can
     * not mint twice.
     */
    async retryPaidMint(input: { worldId: number; paymentTx: string }): Promise<
      | {
          ok: true;
          mintKey: string;
          status: string;
          itemSlug: string;
          qty: number;
        }
      | { ok: false; detail: string }
    > {
      if (!/^0x[0-9a-f]{64}$/i.test(input.paymentTx)) {
        return { ok: false, detail: "payment tx id" };
      }
      const mintKey = claimMintKey(input.paymentTx);
      const link = (await options.assetLinks()).find(
        (row) =>
          row.worldId === input.worldId &&
          row.tokenClass === AssetMintClass.COMPRESSED_ITEM &&
          row.mintKey === mintKey,
      );
      if (link == null)
        return { ok: false, detail: "no mint for that payment" };
      const status = String(link.status);
      if (
        (status === "FAILED" || status === "PENDING") &&
        link.itemKindId != null &&
        link.amount != null &&
        options.mint?.queue != null &&
        options.mint.enabled
      ) {
        void options.mint
          .queue({
            worldId: input.worldId,
            mintKey,
            itemKindId: link.itemKindId,
            amount: link.amount,
            itemSlug: link.itemSlug ?? "",
            metadataHashHex: null,
            recipientHex: link.recipientHex ?? null,
          })
          .catch(() => {
            // Recorded on the asset link row.
          });
      }
      return {
        ok: true,
        mintKey,
        status,
        itemSlug: link.itemSlug ?? "",
        qty: link.amount ?? 0,
      };
    },
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
