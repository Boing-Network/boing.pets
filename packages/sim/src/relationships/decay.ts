import type { Ruleset } from "@boing-pets/contract";
import { clamp, divRound } from "../math";
import type { RelationshipRow, WorldSnapshot } from "../types";

const SCORE_LO = -1000;
const SCORE_HI = 1000;
const COMPONENT_LO = 0;
const COMPONENT_HI = 1000;

/**
 * Passive daily decay for one quiet pair. Does not touch interactionCount or
 * lastInteractionTick. Score moves 10% toward 0 via signed divRound.
 */
export function applyRelationshipDecay(
  row: RelationshipRow,
  rules: Ruleset,
): void {
  row.friendship = clamp(
    row.friendship - rules.friendshipDecay,
    COMPONENT_LO,
    COMPONENT_HI,
  );
  row.romance = clamp(
    row.romance - rules.romanceDecay,
    COMPONENT_LO,
    COMPONENT_HI,
  );
  row.conflict = clamp(
    row.conflict - rules.conflictDecay,
    COMPONENT_LO,
    COMPONENT_HI,
  );
  row.avoidance = clamp(
    row.avoidance - rules.avoidanceDecay,
    COMPONENT_LO,
    COMPONENT_HI,
  );
  row.trust = clamp(row.trust - rules.trustDecay, COMPONENT_LO, COMPONENT_HI);
  row.cooperation = clamp(
    row.cooperation - rules.cooperationDecay,
    COMPONENT_LO,
    COMPONENT_HI,
  );
  row.score = clamp(
    row.score - divRound(row.score, rules.scoreDecayDen),
    SCORE_LO,
    SCORE_HI,
  );
}

/**
 * Phase 5: when `tick % relationshipDecayIntervalTicks == 0`, decay every hot
 * pair (ascending id) that has been quiet for at least one full interval.
 */
export function decayQuietRelationships(
  snapshot: WorldSnapshot,
  tick: number,
): void {
  const rules = snapshot.ruleset;
  const interval = rules.relationshipDecayIntervalTicks;
  if (interval <= 0) throw new Error("relationshipDecayIntervalTicks");
  if (tick % interval !== 0) return;

  const ordered = [...snapshot.relationships].sort((a, b) => a.id - b.id);
  for (const row of ordered) {
    if (tick - row.lastInteractionTick >= interval) {
      applyRelationshipDecay(row, rules);
    }
  }
}
