/**
 * Host side of creature autonomy (see packages/sim/src/kernel/autonomy.ts).
 * Pure: lots, events and decisions in, lot changes out.
 *
 * - Loot: each ITEM/loot event the kernel emitted becomes one lot keyed
 *   `loot:<eventId>`, credited to the creature's keeper (`w:<hex>` or the
 *   local account) or, for a creature nobody keeps, to its pouch
 *   (`pouch:<creatureId>`). The pouch travels with the creature: whoever
 *   adopts it later inherits what it carries, and it is used first.
 * - Bags: a creature may draw on its pouch, then its keeper's bag. Only
 *   live *unminted* units count: minted units exist as LPIT on chain and are
 *   the keeper's to trade, and listed units are already locked away in the
 *   escrow pseudo-account, so creatures never touch either.
 * - Apply: each planned craft or use, once its CREATURE_* influence row is
 *   durable, debits the bag (and adds the crafted lot), keyed by influence id
 *   so a replay never debits twice.
 */
import {
  AUTONOMY_RULES,
  EventKind,
  EventTemplate,
  InfluenceKind,
  isItemSlug,
  type ItemAutonomySettings,
  type ItemEventPayload,
  type WorldEventView,
} from "@boing-pets/contract";
import type { AutonomyBag, AutonomyIntent } from "@boing-pets/sim";
import {
  bagUnits,
  mergeLots,
  nextLotId,
  planCraft,
  planDebit,
  spoilTick,
} from "./inventory";
import type { InfluenceAccountRow, InventoryLotRow } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const POUCH = /^pouch:(\d+)$/;

/** The pseudo-account a creature nobody keeps carries its finds in. */
export function pouchAccount(creatureId: number): string {
  return `pouch:${creatureId}`;
}

export function pouchCreatureId(accountId: string): number | null {
  const match = POUCH.exec(accountId);
  return match == null ? null : Number(match[1]);
}

/** Keeper account for a creature, or null (its pouch holds what it finds). */
export type CreatureOwnerOf = (creatureId: number) => string | null;

function lootPayload(
  event: WorldEventView,
): Extract<ItemEventPayload, { template: "item.loot.v1" }> | null {
  if (event.kind !== EventKind.ITEM) return null;
  const payload = event.payload as ItemEventPayload | null;
  if (payload == null || payload.template !== EventTemplate.ITEM_LOOT) {
    return null;
  }
  if (!isItemSlug(payload.item)) return null;
  if (!Number.isSafeInteger(payload.units) || payload.units < 1) return null;
  return payload;
}

/** New lots for loot events not credited yet. Idempotent by event id. */
export function planLootCredits(input: {
  lots: readonly InventoryLotRow[];
  events: readonly WorldEventView[];
  worldId: number;
  ownerOf: CreatureOwnerOf;
  ticksPerDay: number;
  nowMs: number;
}): InventoryLotRow[] {
  const have = new Set(input.lots.map((lot) => lot.sourceKey));
  const out: InventoryLotRow[] = [];
  let id = nextLotId(input.lots);
  for (const event of [...input.events].sort((a, b) => a.id - b.id)) {
    const loot = lootPayload(event);
    if (loot == null) continue;
    const sourceKey = `loot:${event.id}`;
    if (have.has(sourceKey)) continue;
    have.add(sourceKey);
    out.push({
      id,
      worldId: input.worldId,
      accountId:
        input.ownerOf(loot.creatureId) ?? pouchAccount(loot.creatureId),
      sourceKey,
      itemSlug: loot.item,
      amount: loot.units,
      remaining: loot.units,
      gainedTick: event.tick,
      spoilsAtTick: spoilTick(loot.item, event.tick, input.ticksPerDay),
      minted: false,
      createdAtMs: input.nowMs,
      updatedAtMs: input.nowMs,
    });
    id += 1;
  }
  return out;
}

/** Creature uses each keeper paid for in the last 24 hours. */
export function usesLast24h(
  accounts: readonly InfluenceAccountRow[],
  nowMs: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of accounts) {
    if (row.kind !== InfluenceKind.CREATURE_USE_ITEM) continue;
    if (nowMs - row.acceptedAtMs >= DAY_MS) continue;
    out.set(row.accountId, (out.get(row.accountId) ?? 0) + 1);
  }
  return out;
}

/**
 * The bags each creature may draw on: its pouch (no daily cap), then its
 * keeper's bag (with the keeper's toggles and daily cap). Bags are shared
 * objects so the planner debits one keeper's bag across all their creatures.
 */
export function autonomyBags(input: {
  lots: readonly InventoryLotRow[];
  tick: number;
  ownerOf: CreatureOwnerOf;
  settingsOf: (accountId: string) => ItemAutonomySettings;
  usesToday: ReadonlyMap<string, number>;
  /** Whether this keeper account may hold items at all. */
  canHold: (accountId: string) => boolean;
}): (creatureId: number) => AutonomyBag[] {
  const cache = new Map<string, AutonomyBag>();
  const bag = (accountId: string, pouch: boolean): AutonomyBag => {
    const hit = cache.get(accountId);
    if (hit != null) return hit;
    const settings = pouch
      ? { autoCraft: true, autoUse: true }
      : input.settingsOf(accountId);
    const made: AutonomyBag = {
      accountId,
      units: bagUnits(input.lots, accountId, input.tick, "unminted"),
      autoCraft: settings.autoCraft,
      autoUse: settings.autoUse,
      usesLeft: pouch
        ? Number.POSITIVE_INFINITY
        : Math.max(
            0,
            AUTONOMY_RULES.maxUsesPerBagPerDay -
              (input.usesToday.get(accountId) ?? 0),
          ),
    };
    cache.set(accountId, made);
    return made;
  };
  return (creatureId) => {
    const out: AutonomyBag[] = [];
    const pouch = bag(pouchAccount(creatureId), true);
    if (pouch.units.size > 0) out.push(pouch);
    const owner = input.ownerOf(creatureId);
    if (owner != null && input.canHold(owner)) out.push(bag(owner, false));
    return out;
  };
}

/** One planned decision with the id of its durable CREATURE_* influence. */
export type AppliedIntent = AutonomyIntent & { influenceId: number };

/**
 * Debit (and for crafts, credit) the bags for decisions whose influence rows
 * are durable. Skips any influence id already accounted. Only unminted units
 * are ever taken. Returns the lot changes and the account rows to insert.
 */
export function planAutonomyInventory(input: {
  lots: readonly InventoryLotRow[];
  accounts: readonly InfluenceAccountRow[];
  intents: readonly AppliedIntent[];
  worldId: number;
  tick: number;
  ticksPerDay: number;
  lineageOf: (creatureId: number) => number | null;
  nowMs: number;
}): { upsertLots: InventoryLotRow[]; accounts: InfluenceAccountRow[] } {
  const done = new Set(input.accounts.map((row) => row.influenceId));
  let working: InventoryLotRow[] = [...input.lots];
  const changed = new Map<string, InventoryLotRow>();
  const rows: InfluenceAccountRow[] = [];
  const apply = (lots: readonly InventoryLotRow[]) => {
    working = mergeLots(working, lots);
    for (const lot of lots) changed.set(lot.sourceKey, lot);
  };
  for (const intent of input.intents) {
    if (done.has(intent.influenceId)) continue;
    done.add(intent.influenceId);
    if (intent.kind === "CRAFT") {
      const made = planCraft({
        lots: working,
        worldId: input.worldId,
        accountId: intent.accountId,
        output: intent.output,
        tick: input.tick,
        ticksPerDay: input.ticksPerDay,
        nowMs: input.nowMs,
        debit: { only: "unminted" },
        sourceKey: `acraft:${intent.influenceId}`,
      });
      if (made != null) apply(made);
    } else {
      const debit = planDebit(
        working,
        intent.accountId,
        intent.item,
        1,
        input.tick,
        input.nowMs,
        { only: "unminted" },
      );
      if (debit != null) apply(debit);
    }
    rows.push({
      influenceId: intent.influenceId,
      worldId: input.worldId,
      accountId: intent.accountId,
      kind:
        intent.kind === "CRAFT"
          ? InfluenceKind.CREATURE_CRAFT
          : InfluenceKind.CREATURE_USE_ITEM,
      lineageId: input.lineageOf(intent.creatureId),
      territoryId: intent.kind === "USE" ? intent.territoryId : null,
      itemSlug: intent.kind === "CRAFT" ? intent.output : intent.item,
      acceptedAtMs: input.nowMs,
    });
  }
  return { upsertLots: [...changed.values()], accounts: rows };
}
