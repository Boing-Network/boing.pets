/**
 * Creature activity lines for the inspector: what a creature found, crafted,
 * ate or used on its own ("Meadow ate a Rations Pack."). Pure.
 */
import {
  EventKind,
  type ItemEventPayload,
  type WorldEventView,
} from "@boing-pets/contract";

export type ActivityLine = { id: number; tick: number; text: string };

/** ITEM events for one creature, newest first, at most `limit`. */
export function creatureActivity(
  events: Iterable<WorldEventView>,
  creatureId: number,
  limit = 8,
): ActivityLine[] {
  const out: ActivityLine[] = [];
  for (const event of events) {
    if (event.kind !== EventKind.ITEM) continue;
    const payload = event.payload as ItemEventPayload | null;
    if (payload == null || payload.creatureId !== creatureId) continue;
    out.push({ id: event.id, tick: event.tick, text: event.summary });
  }
  out.sort((a, b) => b.tick - a.tick || b.id - a.id);
  return out.slice(0, limit);
}

/** "Day 12, 14:30" for a tick (10 sim minutes per tick by default). */
export function tickClock(tick: number, ticksPerDay = 144): string {
  const day = Math.floor(tick / ticksPerDay) + 1;
  const minutes = Math.floor(((tick % ticksPerDay) * 24 * 60) / ticksPerDay);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `Day ${day}, ${hh}:${mm}`;
}
