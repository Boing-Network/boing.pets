import type { StepResult, WorldSnapshot } from "../types";

export function step(snapshot: WorldSnapshot): StepResult {
  throw new Error(
    `step is not implemented (lastTick ${snapshot.world.lastTick})`,
  );
}
