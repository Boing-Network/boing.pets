import { itemDef, type TerritoryView } from "@boing-pets/contract";

const EFFECT_LABEL: Record<string, (amount: number) => string> = {
  FOOD: (amount) => `food ${amount >= 0 ? "+" : ""}${amount}`,
  DANGER: (amount) => `danger ${amount >= 0 ? "+" : ""}${amount}`,
  COMFORT: () => "salt lick",
  HARVEST: (amount) => `gathered ${amount}`,
};

/**
 * One short line under a territory name: active effects with days left, then
 * the gatherable stock. Empty when there is nothing to show.
 */
export function territoryOverlayLine(
  territory: TerritoryView | undefined,
  tick: number,
  ticksPerDay = 144,
): string {
  if (!territory) return "";
  const parts: string[] = [];
  for (const effect of territory.effects ?? []) {
    const label = EFFECT_LABEL[effect.kind]?.(effect.amount) ?? effect.kind;
    const days = Math.max(1, Math.ceil((effect.endTick - tick) / ticksPerDay));
    parts.push(`${label} · ${days}d`);
  }
  if (territory.resource) {
    const name =
      itemDef(territory.resource.slug)?.displayName ?? territory.resource.slug;
    parts.push(`${name} ${territory.resource.free}/${territory.resource.cap}`);
  }
  return parts.join("   ");
}
