/**
 * Goals: a short path through what a player can do, so a first session has a
 * next step and later ones have something to aim for. Pure; the store is
 * `state/goalStore.ts`.
 *
 * Goals are a guide kept in this browser, per world. They grant nothing.
 */

/** Counters the goals are judged from. All only ever go up. */
export type GoalFacts = {
  /** Most creatures followed at once. */
  followed: number;
  /** Looked at the bonds of a followed creature. */
  bonds: number;
  gathered: number;
  crafted: number;
  /** Items given to a creature. */
  gave: number;
  /** Items given to a creature that was wounded, sick or starving. */
  helped: number;
  named: number;
  /** Births to a followed creature. */
  young: number;
  /** Territory requests answered with the item asked for. */
  answered: number;
};

export type GoalFact = keyof GoalFacts;

export const EMPTY_GOAL_FACTS: GoalFacts = {
  followed: 0,
  bonds: 0,
  gathered: 0,
  crafted: 0,
  gave: 0,
  helped: 0,
  named: 0,
  young: 0,
  answered: 0,
};

export type Goal = {
  id: string;
  title: string;
  /** How to do it, shown while it is the next goal. */
  hint: string;
  done: (facts: GoalFacts) => boolean;
};

/** In the order a new player meets them. */
export const GOALS: readonly Goal[] = [
  {
    id: "follow",
    title: "Follow a creature",
    hint: "Pick a creature and press the star beside its name.",
    done: (f) => f.followed >= 1,
  },
  {
    id: "bonds",
    title: "See who it is close to",
    hint: "Open one of your creatures and look at its Bonds tab.",
    done: (f) => f.bonds >= 1,
  },
  {
    id: "gather",
    title: "Gather materials",
    hint: "Open the Workshop and gather from a territory.",
    done: (f) => f.gathered >= 1,
  },
  {
    id: "craft",
    title: "Craft something",
    hint: "In the Workshop, craft a recipe you have the materials for.",
    done: (f) => f.crafted >= 1,
  },
  {
    id: "give",
    title: "Give an item to a creature",
    hint: "In the Workshop's bag, give a potion, stew or tonic to a creature.",
    done: (f) => f.gave >= 1,
  },
  {
    id: "help",
    title: "Help a creature in need",
    hint: "Give a Mending Potion or Hearty Stew to a creature with a red dot.",
    done: (f) => f.helped >= 1,
  },
  {
    id: "answer",
    title: "Answer a territory request",
    hint: "Requests in the Inspector show what a territory needs. Use that item there.",
    done: (f) => f.answered >= 1,
  },
  {
    id: "name",
    title: "Name a creature",
    hint: "Open a creature and press Rename beside its name.",
    done: (f) => f.named >= 1,
  },
  {
    id: "young",
    title: "See one of yours have young",
    hint: "Keep following: a creature with a mate will have young in time.",
    done: (f) => f.young >= 1,
  },
  {
    id: "three",
    title: "Follow three creatures",
    hint: "Follow a mate, a child or a neighbour of one of yours.",
    done: (f) => f.followed >= 3,
  },
];

export type GoalBook = Record<string, GoalFacts>;

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** Stored JSON back to a book; anything malformed counts as zero. */
export function parseGoalBook(raw: string | null | undefined): GoalBook {
  if (raw == null) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {};
  }
  const book: GoalBook = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const row = value as Record<string, unknown>;
    const facts = { ...EMPTY_GOAL_FACTS };
    for (const fact of Object.keys(facts) as GoalFact[]) {
      facts[fact] = count(row[fact]);
    }
    book[key] = facts;
  }
  return book;
}

export function factsFor(book: GoalBook, key: string | null): GoalFacts {
  return (key != null ? book[key] : undefined) ?? EMPTY_GOAL_FACTS;
}

/**
 * Add to a counter, or raise `followed` to a new high. Returns the same
 * object when nothing changed, so callers can skip the save.
 */
export function noteFact(
  facts: GoalFacts,
  fact: GoalFact,
  amount = 1,
): GoalFacts {
  const next =
    fact === "followed"
      ? Math.max(facts.followed, amount)
      : facts[fact] + Math.max(0, amount);
  return next === facts[fact] ? facts : { ...facts, [fact]: next };
}

export type GoalProgress = {
  done: number;
  total: number;
  /** The first goal not yet reached, or null when all are. */
  next: Goal | null;
  rows: Array<{ goal: Goal; done: boolean }>;
};

export function goalProgress(facts: GoalFacts): GoalProgress {
  const rows = GOALS.map((goal) => ({ goal, done: goal.done(facts) }));
  return {
    done: rows.filter((row) => row.done).length,
    total: rows.length,
    next: rows.find((row) => !row.done)?.goal ?? null,
    rows,
  };
}

/** Goals reached by going from `before` to `after`. */
export function newlyReached(before: GoalFacts, after: GoalFacts): Goal[] {
  return GOALS.filter((goal) => !goal.done(before) && goal.done(after));
}
