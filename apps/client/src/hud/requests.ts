/**
 * Territory requests: what each territory most needs from the Workshop right
 * now, worked out from how its creatures are doing. Pure, so it is tested
 * without rendering.
 *
 * A request is a pointer, not a contract: answering it is just using the
 * item there, and its reward is the item's own effect on the creatures.
 */
import {
  CreatureStatus,
  ItemSlug,
  itemDef,
  recipeFor,
  type InventoryEntry,
} from "@boing-pets/contract";

export type RequestKind = "sick" | "hungry" | "afraid" | "weary";

export const REQUEST_RULES = {
  /** A need at or past this counts a creature as struggling (0..1000). */
  needAtLeast: 650,
  /** A territory asks once this many of its creatures struggle... */
  minCreatures: 2,
  /** ...and they are at least this share of it, per cent. */
  minPercent: 25,
  /** At most this many requests are shown. */
  shown: 3,
} as const;

export type RequestCreature = {
  id: number;
  status: string;
  territoryId: number;
  sick?: boolean;
  needs: {
    hunger: number;
    thirst: number;
    discomfort: number;
    unsafety: number;
  };
};

export type RequestTerritory = {
  id: number;
  name: string;
  effects?: readonly { kind: string; amount: number }[];
};

export type TerritoryRequest = {
  territoryId: number;
  territoryName: string;
  kind: RequestKind;
  /** "Thicket is going hungry" */
  title: string;
  /** "5 of 12 creatures are hungry." */
  detail: string;
  /** What answers it; the first is the best fit. */
  wants: ItemSlug[];
  /** Creatures behind the request. */
  affected: number;
  population: number;
  /** For a request answered by giving to one creature: the worst off. */
  creatureId: number | null;
};

const KIND_ORDER: readonly RequestKind[] = [
  "sick",
  "hungry",
  "afraid",
  "weary",
];

const WANTS: Readonly<Record<RequestKind, ItemSlug[]>> = {
  sick: [ItemSlug.POTION_MENDING],
  hungry: [ItemSlug.SEED_BUNDLE, ItemSlug.RATIONS],
  afraid: [ItemSlug.POTION_CALM],
  weary: [ItemSlug.SALT_LICK],
};

function hasEffect(
  territory: RequestTerritory,
  kind: string,
  sign: 1 | -1,
): boolean {
  return (territory.effects ?? []).some(
    (effect) => effect.kind === kind && Math.sign(effect.amount) === sign,
  );
}

function enough(affected: number, population: number): boolean {
  return (
    affected >= REQUEST_RULES.minCreatures &&
    affected * 100 >= population * REQUEST_RULES.minPercent
  );
}

function plural(count: number): string {
  return count === 1 ? "creature is" : "creatures are";
}

/**
 * One request per territory at most (its most pressing), most pressing
 * territory first. A territory already being helped the same way (food laid
 * out, a calm in effect, a salt lick set) does not ask again.
 */
export function territoryRequests(
  territories: readonly RequestTerritory[],
  creatures: readonly RequestCreature[],
): TerritoryRequest[] {
  const at = REQUEST_RULES.needAtLeast;
  const out: TerritoryRequest[] = [];
  for (const territory of territories) {
    const here = creatures.filter(
      (row) =>
        row.status === CreatureStatus.ALIVE && row.territoryId === territory.id,
    );
    const population = here.length;
    if (population === 0) continue;
    const sick = here.filter((row) => row.sick === true);
    const hungry = here.filter((row) => row.needs.hunger >= at);
    const afraid = here.filter((row) => row.needs.unsafety >= at);
    const weary = here.filter(
      (row) => row.needs.thirst >= at || row.needs.discomfort >= at,
    );
    const candidates: Array<{
      kind: RequestKind;
      rows: RequestCreature[];
      title: string;
      word: string;
    }> = [];
    if (sick.length > 0) {
      candidates.push({
        kind: "sick",
        rows: sick,
        title: `Sickness in ${territory.name}`,
        word: "sick",
      });
    }
    if (enough(hungry.length, population) && !hasEffect(territory, "FOOD", 1)) {
      candidates.push({
        kind: "hungry",
        rows: hungry,
        title: `${territory.name} is going hungry`,
        word: "hungry",
      });
    }
    if (
      enough(afraid.length, population) &&
      !hasEffect(territory, "DANGER", -1)
    ) {
      candidates.push({
        kind: "afraid",
        rows: afraid,
        title: `${territory.name} is on edge`,
        word: "frightened",
      });
    }
    if (
      enough(weary.length, population) &&
      !hasEffect(territory, "COMFORT", 1)
    ) {
      candidates.push({
        kind: "weary",
        rows: weary,
        title: `${territory.name} is worn down`,
        word: "thirsty or restless",
      });
    }
    // Sickness first; otherwise whatever troubles the most creatures.
    candidates.sort(
      (a, b) =>
        Number(b.kind === "sick") - Number(a.kind === "sick") ||
        b.rows.length - a.rows.length ||
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
    );
    const top = candidates[0];
    if (top == null) continue;
    out.push({
      territoryId: territory.id,
      territoryName: territory.name,
      kind: top.kind,
      title: top.title,
      detail: `${top.rows.length} of ${population} ${plural(top.rows.length)} ${top.word}.`,
      wants: WANTS[top.kind],
      affected: top.rows.length,
      population,
      creatureId:
        top.kind === "sick"
          ? ([...top.rows].sort((a, b) => a.id - b.id)[0]?.id ?? null)
          : null,
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.kind === "sick") - Number(a.kind === "sick") ||
      b.affected * a.population - a.affected * b.population ||
      b.affected - a.affected ||
      a.territoryId - b.territoryId,
  );
}

export type RequestSupply = {
  /** The item to use: one in the bag, else the first that can be crafted. */
  item: ItemSlug;
  state: "have" | "craft" | "short";
  /** "In your bag", "You can craft a Seed bundle", "Needs 2 Clover..." */
  text: string;
};

function countsOf(items: readonly InventoryEntry[]): Map<string, number> {
  return new Map(items.map((entry) => [entry.slug, entry.count]));
}

function nameOf(slug: string): string {
  return itemDef(slug)?.displayName ?? slug;
}

function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

/** Whether the bag can answer a request, and with what. */
export function requestSupply(
  request: Pick<TerritoryRequest, "wants">,
  items: readonly InventoryEntry[],
): RequestSupply {
  const counts = countsOf(items);
  const first = request.wants[0] as ItemSlug;
  const held = request.wants.find((slug) => (counts.get(slug) ?? 0) > 0);
  if (held != null) {
    return {
      item: held,
      state: "have",
      text: `${nameOf(held)} is in your bag.`,
    };
  }
  const craftable = request.wants.find((slug) =>
    recipeFor(slug)?.inputs.every(
      (need) => (counts.get(need.slug) ?? 0) >= need.count,
    ),
  );
  if (craftable != null) {
    const name = nameOf(craftable);
    return {
      item: craftable,
      state: "craft",
      text: `You can craft ${article(name)} ${name}.`,
    };
  }
  const missing = (recipeFor(first)?.inputs ?? [])
    .filter((need) => (counts.get(need.slug) ?? 0) < need.count)
    .map(
      (need) =>
        `${need.count - (counts.get(need.slug) ?? 0)} ${nameOf(need.slug)}`,
    );
  const name = nameOf(first);
  return {
    item: first,
    state: "short",
    text:
      missing.length > 0
        ? `${article(name).replace(/^a/, "A")} ${name} needs ${missing.join(" and ")} more.`
        : `Needs ${article(name)} ${name}.`,
  };
}

/** Does using `item` in `territoryId` (or on `creatureId`) answer a request? */
export function answersRequest(
  requests: readonly TerritoryRequest[],
  use: { item: string; territoryId?: number; creatureTerritoryId?: number },
): boolean {
  return requests.some(
    (request) =>
      request.wants.includes(use.item as ItemSlug) &&
      (request.kind === "sick"
        ? request.territoryId === use.creatureTerritoryId
        : request.territoryId === use.territoryId),
  );
}
