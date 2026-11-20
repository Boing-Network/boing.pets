/**
 * Ecology / balance: run whole worlds for many sim days and require every
 * species to survive with populations inside sane bounds.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPECIES_CATALOG } from "@boing-pets/contract";
import { TERRITORY_CATALOG } from "../src/index";
import { runEcology } from "./ecology-run";

const DAYS = 150;
const CAPACITY = TERRITORY_CATALOG.reduce((sum, row) => sum + row.capacity, 0);
/** No species may hold more than this many living creatures. */
const SPECIES_MAX = 24;

for (const seed of [1, 7]) {
  test(`ecology seed ${seed}: all ${SPECIES_CATALOG.length} species survive ${DAYS} days within bounds`, () => {
    const run = runEcology(seed, DAYS);
    const founders = SPECIES_CATALOG.length * 2;
    for (const species of SPECIES_CATALOG) {
      const end = run.counts.get(species.id) ?? 0;
      assert.ok(end >= 2, `${species.slug} fell to ${end}`);
      assert.ok(
        (run.maxSeen.get(species.id) ?? 0) <= SPECIES_MAX,
        `${species.slug} peaked at ${run.maxSeen.get(species.id)}`,
      );
    }
    assert.ok(run.births >= founders, `only ${run.births} births`);
    assert.ok(run.total > founders, `total ${run.total}`);
    assert.ok(
      run.total <= CAPACITY,
      `total ${run.total} > capacity ${CAPACITY}`,
    );
    // Needs-driven deaths (thirst, hunger) mean the AI let a creature die of
    // neglect; a handful is tolerable, a die-off is not.
    const neglect = (run.deaths.THIRST ?? 0) + (run.deaths.STARVATION ?? 0);
    assert.ok(neglect <= 3, `neglect deaths ${JSON.stringify(run.deaths)}`);
  });
}
