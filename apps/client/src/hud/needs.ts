/**
 * Plain-language needs. The kernel tracks each need as 0–1000 (higher is
 * worse), which means nothing to a player at a glance. The inspection panel
 * shows a word and a meter, with the raw number kept as a tooltip.
 */
export type NeedName =
  | "hunger"
  | "thirst"
  | "fatigue"
  | "discomfort"
  | "unsafety"
  | "loneliness";

export type NeedLevel = {
  label: string;
  /** 0 fine · 1 noticeable · 2 pressing · 3 critical. */
  tone: 0 | 1 | 2 | 3;
  /** Meter fill, 0–100. */
  percent: number;
};

const WORDS: Record<NeedName, readonly [string, string, string, string]> = {
  hunger: ["well fed", "peckish", "hungry", "starving"],
  thirst: ["quenched", "dry", "thirsty", "parched"],
  fatigue: ["rested", "drowsy", "tired", "exhausted"],
  discomfort: ["comfortable", "uneasy", "uncomfortable", "suffering"],
  unsafety: ["safe", "wary", "frightened", "terrified"],
  loneliness: ["content", "restless", "lonely", "isolated"],
};

export function needLevel(name: NeedName, value: number): NeedLevel {
  const v = Math.max(0, Math.min(1000, Math.round(value)));
  const tone = v < 250 ? 0 : v < 500 ? 1 : v < 750 ? 2 : 3;
  return { label: WORDS[name][tone], tone, percent: Math.round(v / 10) };
}
