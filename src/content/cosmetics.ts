import { CATALOG, catalogItem, type CatalogItem } from "../economy";

export const COSMETIC_SLOTS = ["hat", "accessory", "trail"] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export type EquippedCosmetics = Partial<Record<CosmeticSlot, string>>;

export const COSMETIC_SLOT_LABELS: Record<CosmeticSlot, string> = {
  hat: "Hat",
  accessory: "Accessory",
  trail: "Trail / tool",
};

export function isCosmeticSlot(value: unknown): value is CosmeticSlot {
  return (
    typeof value === "string" &&
    (COSMETIC_SLOTS as readonly string[]).includes(value)
  );
}

/** Map a catalog cosmetic to a pet equipment slot. Furniture is not wearable. */
export function slotForCosmetic(itemId: string): CosmeticSlot | null {
  const item = catalogItem(itemId);
  if (!item) return null;
  if (item.kind === "furniture") return null;
  if (item.kind === "pet_skin" || item.id.startsWith("hat-")) return "hat";
  if (item.kind === "profile" || item.id.startsWith("frame-"))
    return "accessory";
  if (item.kind === "tool") return "trail";
  return null;
}

export function equippableCatalogItems(): CatalogItem[] {
  return CATALOG.filter((item) => slotForCosmetic(item.id) !== null);
}

export function sanitizeEquipped(raw: unknown): EquippedCosmetics | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: EquippedCosmetics = {};
  const rec = raw as Record<string, unknown>;
  for (const slot of COSMETIC_SLOTS) {
    const id = rec[slot];
    if (typeof id !== "string" || id.length < 2 || id.length > 64) continue;
    if (slotForCosmetic(id) !== slot) continue;
    out[slot] = id;
  }
  return Object.keys(out).length ? out : undefined;
}

export class EquipError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Validate an equip/unequip request.
 * `itemId` null or empty unequips the slot.
 */
export function validateEquip(input: {
  slot: unknown;
  itemId: unknown;
  ownedIds: string[];
}): { slot: CosmeticSlot; itemId: string | null } {
  if (!isCosmeticSlot(input.slot))
    throw new EquipError(400, "Unknown cosmetic slot");
  const slot = input.slot;
  if (
    input.itemId === null ||
    input.itemId === "" ||
    input.itemId === undefined
  )
    return { slot, itemId: null };
  if (typeof input.itemId !== "string")
    throw new EquipError(400, "Invalid cosmetic item");
  const itemId = input.itemId;
  const expected = slotForCosmetic(itemId);
  if (expected !== slot)
    throw new EquipError(400, "That item cannot be equipped in this slot");
  if (!input.ownedIds.includes(itemId))
    throw new EquipError(403, "You do not own that cosmetic");
  return { slot, itemId };
}
