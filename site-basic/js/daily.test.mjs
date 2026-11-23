import { test } from "node:test";
import assert from "node:assert/strict";

import { dailyCard, dayKey, dayNumber, randomCard } from "./daily.js";

const deck = (count) => Array.from({ length: count }, (_, i) => ({ id: `T-${String(i).padStart(3, "0")}` }));

// The key for `offset` days after 2026-11-23, in UTC so the test is timezone-independent.
const keyAfter = (offset) => new Date(Date.UTC(2026, 10, 23 + offset)).toISOString().slice(0, 10);

test("dayKey uses the local calendar date", () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(dayKey(new Date(2026, 11, 31, 0, 0)), "2026-12-31");
});

test("dayNumber counts days from the epoch", () => {
  assert.equal(dayNumber("1970-01-01"), 0);
  assert.equal(dayNumber("1970-01-02"), 1);
  assert.equal(dayNumber("2026-11-24") - dayNumber("2026-11-23"), 1);
});

test("everyone gets the same question on the same day, whatever the card order", () => {
  const cards = deck(30);
  const first = dailyCard(cards, "2026-11-23");
  assert.equal(dailyCard(cards, "2026-11-23"), first);
  assert.equal(dailyCard([...cards].reverse(), "2026-11-23").id, first.id);
});

test("no question repeats within a cycle of as many days as questions", () => {
  const cards = deck(30);
  const start = dayNumber("2026-11-23");
  // Align to the start of a cycle.
  const offset = Math.ceil(start / cards.length) * cards.length - start;
  const ids = new Set();
  for (let day = 0; day < cards.length; day++) ids.add(dailyCard(cards, keyAfter(offset + day)).id);
  assert.equal(ids.size, cards.length);
});

test("the question changes from day to day", () => {
  const cards = deck(30);
  let changes = 0;
  for (let day = 0; day < 60; day++) {
    if (dailyCard(cards, keyAfter(day)).id !== dailyCard(cards, keyAfter(day + 1)).id) changes++;
  }
  assert.ok(changes >= 58, `only ${changes} changes in 60 days`);
});

test("dailyCard handles empty and single-card decks", () => {
  assert.equal(dailyCard([], "2026-11-23"), null);
  assert.equal(dailyCard(deck(1), "2026-11-23").id, "T-000");
});

test("randomCard avoids the current card when it can", () => {
  const cards = deck(2);
  for (let i = 0; i < 20; i++) assert.equal(randomCard(cards, "T-000").id, "T-001");
  assert.equal(randomCard(deck(1), "T-000").id, "T-000");
  assert.equal(randomCard([], null), null);
  assert.equal(randomCard(deck(5), null, () => 0.99).id, "T-004");
});
