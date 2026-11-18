/**
 * Maps sim goal/action into a presentation behavior. Pure and view-only.
 */
import { Action, Goal } from "@boing-pets/contract";

export type BehaviorId =
  | "forage"
  | "drink"
  | "rest"
  | "sleep"
  | "social"
  | "court"
  | "guard"
  | "nurse"
  | "travel"
  | "wander"
  | "approach"
  | "idle";

export type Locomotion = "trot" | "walk" | "fly" | "hover";

export function behaviorFor(goal: Goal, action: Action | null): BehaviorId {
  switch (action) {
    case Action.FORAGE:
    case Action.CONTEST:
    case Action.COOPERATE_FORAGE:
      return "forage";
    case Action.DRINK:
      return "drink";
    case Action.REST:
      return goal === Goal.SEEK_SHELTER ? "sleep" : "rest";
    case Action.RELOCATE:
      return "travel";
    case Action.APPROACH:
      return "approach";
    case Action.WANDER:
      return "wander";
    case Action.COURT:
      return "court";
    case Action.GUARD:
      return "guard";
    case Action.NURSE:
      return "nurse";
    case null:
      break;
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
    }
  }

  switch (goal) {
    case Goal.FIND_FOOD:
      return "forage";
    case Goal.DRINK_WATER:
      return "drink";
    case Goal.SEEK_SHELTER:
      return "sleep";
    case Goal.SOCIALIZE:
      return "social";
    case Goal.EXPLORE:
      return "wander";
    case Goal.FIND_MATE:
      return "court";
    case Goal.PROTECT_OFFSPRING:
      return "guard";
    case Goal.IDLE:
      return "idle";
    default: {
      const _exhaustive: never = goal;
      void _exhaustive;
      return "idle";
    }
  }
}

export function locomotionForSpecies(speciesId: number): Locomotion {
  // pebblehare → lantern moth presentation flies; others walk/trot.
  if (speciesId === 3) return "fly";
  if (speciesId === 1) return "trot";
  return "walk";
}
