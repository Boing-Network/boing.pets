/**
 * Goals: what counts, in what order, and how progress is stored.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_GOAL_FACTS,
  GOALS,
  factsFor,
  goalProgress,
  newlyReached,
  noteFact,
  parseGoalBook,
} from "../src/hud/goals";

test("a new player starts with nothing done and a first step", () => {
  const progress = goalProgress(EMPTY_GOAL_FACTS);
  assert.equal(progress.done, 0);
  assert.equal(progress.total, GOALS.length);
  assert.equal(progress.next?.id, "follow");
  assert.equal(new Set(GOALS.map((goal) => goal.id)).size, GOALS.length);
  for (const goal of GOALS) {
    assert.ok(goal.title.length > 0 && goal.hint.length > 0, goal.id);
  }
});

test("counters add up; the follow count is a high-water mark", () => {
  let facts = EMPTY_GOAL_FACTS;
  facts = noteFact(facts, "crafted");
  facts = noteFact(facts, "crafted");
  assert.equal(facts.crafted, 2);
  facts = noteFact(facts, "followed", 2);
  assert.equal(facts.followed, 2);
  const same = noteFact(facts, "followed", 1);
  assert.equal(same, facts, "unfollowing does not undo progress");
  assert.equal(noteFact(facts, "gave", 0), facts);
  assert.equal(noteFact(facts, "gave", -3), facts);
});

test("the next goal is the first one not reached, even out of order", () => {
  let facts = noteFact(EMPTY_GOAL_FACTS, "crafted");
  let progress = goalProgress(facts);
  assert.equal(progress.done, 1);
  assert.equal(progress.next?.id, "follow");

  facts = noteFact(facts, "followed", 1);
  facts = noteFact(facts, "bonds");
  progress = goalProgress(facts);
  assert.equal(progress.next?.id, "gather");
  assert.deepEqual(
    progress.rows.filter((row) => row.done).map((row) => row.goal.id),
    ["follow", "bonds", "craft"],
  );
});

test("reaching a goal is reported once, and all of them can be reached", () => {
  const before = noteFact(EMPTY_GOAL_FACTS, "followed", 2);
  const after = noteFact(before, "followed", 3);
  assert.deepEqual(
    newlyReached(before, after).map((goal) => goal.id),
    ["three"],
  );
  assert.deepEqual(newlyReached(after, after), []);

  let facts = EMPTY_GOAL_FACTS;
  for (const fact of Object.keys(EMPTY_GOAL_FACTS) as Array<
    keyof typeof EMPTY_GOAL_FACTS
  >) {
    facts = noteFact(facts, fact, 3);
  }
  const progress = goalProgress(facts);
  assert.equal(progress.done, progress.total);
  assert.equal(progress.next, null);
});

test("a stored book survives bad data", () => {
  assert.deepEqual(parseGoalBook(null), {});
  assert.deepEqual(parseGoalBook("{oops"), {});
  assert.deepEqual(parseGoalBook("[]"), {});
  const book = parseGoalBook(
    JSON.stringify({
      "1:1": { crafted: 2.9, gave: "x", followed: -4, extra: 9 },
      bad: 7,
    }),
  );
  assert.deepEqual(book["1:1"], { ...EMPTY_GOAL_FACTS, crafted: 2 });
  assert.equal(book.bad, undefined);
  assert.equal(factsFor(book, "missing"), EMPTY_GOAL_FACTS);
  assert.equal(factsFor(book, null), EMPTY_GOAL_FACTS);
});
