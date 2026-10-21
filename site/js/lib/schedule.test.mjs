import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INTERVALS,
  activity,
  addDays,
  buildDeck,
  cardStates,
  dayCounts,
  deckProgress,
  localDay,
  localIso,
  metDays,
  streak,
  weekday,
} from "./schedule.js";

let counter = 0;
// A review row on `day`; the time of day orders rows within a day.
function row(card, day, mode, knew = 1, extra = {}) {
  counter += 1;
  return {
    id: `s${counter}:${card}`,
    card,
    at: `${day}T${String(8 + (counter % 12)).padStart(2, "0")}:00:00.${String(counter % 1000).padStart(3, "0")}+00:00`,
    day,
    mode,
    knew: mode === "baseline" ? null : knew,
    box: null,
    ...extra,
  };
}

const cards = (count, prefix = "T") =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${String(i + 1).padStart(3, "0")}`, topic: "t" }));

test("day helpers handle month ends, leap days, and offsets", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  assert.equal(weekday("2026-10-19"), 0); // Monday
  assert.equal(weekday("2026-10-25"), 6); // Sunday
  const date = new Date();
  assert.equal(localIso(date).slice(0, 10), localDay(date));
  assert.equal(Date.parse(localIso(date)), date.getTime());
});

test("due date is the last day plus the box interval, for every box", () => {
  for (let box = 0; box < INTERVALS.length; box++) {
    const rows = [];
    // Knowing a card `box + 1` times on consecutive days ends in box `box + 1`
    // (capped at 5); start from a baseline to reach each box directly instead.
    rows.push(row("A-001", "2026-10-01", "baseline", null, { box }));
    const state = cardStates(rows).get("A-001");
    assert.equal(state.box, box);
    assert.equal(state.due, addDays("2026-10-01", INTERVALS[box]));
  }
  const climbed = cardStates([
    row("A-001", "2026-10-01", "daily", 1),
    row("A-001", "2026-10-03", "daily", 1),
    row("A-001", "2026-10-07", "learn", 1),
  ]).get("A-001");
  assert.equal(climbed.box, 3);
  assert.equal(climbed.due, "2026-10-15");
  assert.equal(climbed.reviews, 3);
});

test("boxes are capped at 5", () => {
  const rows = Array.from({ length: 8 }, (_, i) => row("A-001", addDays("2026-01-01", i), "daily", 1));
  assert.equal(cardStates(rows).get("A-001").box, 5);
});

test("a miss resets the card to box 0", () => {
  const state = cardStates([
    row("A-001", "2026-10-01", "baseline", null, { box: 4 }),
    row("A-001", "2026-10-17", "daily", 0),
  ]).get("A-001");
  assert.equal(state.box, 0);
  assert.equal(state.due, "2026-10-18");
});

test("practice rows never change boxes or due dates", () => {
  const rows = [row("A-001", "2026-10-01", "daily", 1)];
  const before = cardStates(rows).get("A-001");
  rows.push(row("A-001", "2026-10-02", "practice", 0), row("A-001", "2026-10-02", "practice", 1));
  assert.deepEqual(cardStates(rows).get("A-001"), before);
  assert.equal(cardStates([row("B-001", "2026-10-02", "practice", 1)]).has("B-001"), false);
});

test("a baseline sets the box, and later reviews build on it", () => {
  const states = cardStates([
    row("A-001", "2026-10-01", "baseline", null, { box: 2 }),
    row("A-001", "2026-10-05", "daily", 1),
  ]);
  assert.equal(states.get("A-001").box, 3);
  assert.equal(states.get("A-001").due, "2026-10-13");
});

test("rows are replayed in time order, not array order", () => {
  const late = row("A-001", "2026-10-05", "daily", 1);
  const early = row("A-001", "2026-10-01", "daily", 0);
  assert.equal(cardStates([late, early]).get("A-001").box, 1);
});

test("the deck has due cards first, most overdue first, then capped new cards", () => {
  const deckCards = cards(30);
  const today = "2026-10-21";
  const reviews = [
    row("T-001", "2026-10-19", "daily", 1), // box 1, due 10-21
    row("T-002", "2026-10-10", "daily", 0), // box 0, due 10-11 (most overdue)
    row("T-003", "2026-10-20", "daily", 1), // box 1, due 10-22 (not due)
  ];
  const deck = buildDeck({ cards: deckCards, reviews, today, settings: { dailySize: 12, newPerDay: 4 } });
  assert.deepEqual(deck.cards.slice(0, 2).map((card) => card.id), ["T-002", "T-001"]);
  assert.equal(deck.due, 2);
  assert.equal(deck.new, 4);
  assert.equal(deck.cards.length, 6);
  assert.ok(!deck.cards.some((card) => card.id === "T-003"));

  const capped = buildDeck({ cards: deckCards, reviews, today, settings: { dailySize: 3, newPerDay: 4 } });
  assert.equal(capped.cards.length, 3);
  assert.equal(capped.due, 2);
});

test("the same inputs give the same deck, and different days give different decks", () => {
  const deckCards = cards(60);
  const settings = { dailySize: 12, newPerDay: 6 };
  const ids = (today, list = deckCards) => buildDeck({ cards: list, reviews: [], today, settings }).cards.map((c) => c.id);
  assert.deepEqual(ids("2026-10-21"), ids("2026-10-21"));
  // Card order in cards.json does not matter.
  assert.deepEqual(ids("2026-10-21"), ids("2026-10-21", [...deckCards].reverse()));
  assert.notDeepEqual(ids("2026-10-21"), ids("2026-10-22"));
});

test("recently added cards are preferred among new cards", () => {
  const deckCards = cards(20).map((card, i) => ({ ...card, added: i >= 17 ? "2026-10-19" : "2026-09-01" }));
  const deck = buildDeck({ cards: deckCards, reviews: [], today: "2026-10-21", settings: { newPerDay: 3 } });
  assert.deepEqual(deck.cards.map((card) => card.id).sort(), ["T-018", "T-019", "T-020"]);
});

test("canBeNew gates new cards but not due cards", () => {
  const reviews = [row("T-001", "2026-10-01", "daily", 1)];
  const deck = buildDeck({ cards: cards(5), reviews, today: "2026-10-21", canBeNew: () => false });
  assert.deepEqual(deck.cards.map((card) => card.id), ["T-001"]);
});

test("reviews made today do not change today's deck", () => {
  const deckCards = cards(20);
  const today = "2026-10-21";
  const reviews = [row("T-001", "2026-10-18", "daily", 0), row("T-002", "2026-10-19", "daily", 1)];
  const settings = { dailySize: 12, newPerDay: 4 };
  const before = buildDeck({ cards: deckCards, reviews, today, settings });
  const graded = [...reviews];
  for (const card of before.cards) graded.push(row(card.id, today, "daily", 1));
  graded.push(row("T-020", today, "practice", 0));
  const after = buildDeck({ cards: deckCards, reviews: graded, today, settings });
  assert.deepEqual(after, before);
  assert.equal(deckProgress(after.cards, graded, today).size, before.cards.length);
});

test("deckProgress only counts daily rows from that day for deck cards", () => {
  const deck = cards(3);
  const today = "2026-10-21";
  const progress = deckProgress(deck, [
    row("T-001", today, "daily", 1),
    row("T-002", today, "practice", 1),
    row("T-003", "2026-10-20", "daily", 1),
    row("T-009", today, "daily", 1),
  ], today);
  assert.deepEqual([...progress.keys()], ["T-001"]);
});

test("dayCounts counts every mode except baselines", () => {
  const counts = dayCounts([
    row("A-001", "2026-10-01", "baseline", null, { box: 2 }),
    row("A-001", "2026-10-02", "daily", 1),
    row("A-002", "2026-10-02", "practice", 0),
    row("A-003", "2026-10-02", "learn", 1),
  ]);
  assert.equal(counts.get("2026-10-01"), undefined);
  assert.equal(counts.get("2026-10-02"), 3);
});

// Reviews that meet the goal on `day` (practice only, so no deck is involved).
const goalReviews = (day, goal = 10) => Array.from({ length: goal }, (_, i) => row(`P-${String(i + 1).padStart(3, "0")}`, day, "practice", 1));

test("a fully graded deck meets the day even below the goal", () => {
  const deckCards = cards(3);
  const day = "2026-10-20";
  const reviews = deckCards.map((card) => row(card.id, day, "daily", 1));
  const met = metDays({ cards: deckCards, reviews, today: "2026-10-21", settings: { dailyGoal: 10, newPerDay: 4 } });
  assert.ok(met.has(day));
  const partial = metDays({ cards: deckCards, reviews: reviews.slice(0, 2), today: "2026-10-21", settings: { dailyGoal: 10 } });
  assert.ok(!partial.has(day));
});

test("the streak breaks on a missed day", () => {
  const reviews = [...goalReviews("2026-10-15"), ...goalReviews("2026-10-16"), ...goalReviews("2026-10-18"), ...goalReviews("2026-10-19"), ...goalReviews("2026-10-20"), ...goalReviews("2026-10-21")];
  const met = metDays({ cards: [], reviews, today: "2026-10-21", settings: { dailyGoal: 10 } });
  assert.deepEqual(streak(met, "2026-10-21"), { current: 4, best: 4, todayMet: true, atRisk: false });
});

test("an unmet today keeps yesterday's streak but marks it at risk", () => {
  const reviews = [...goalReviews("2026-10-19"), ...goalReviews("2026-10-20"), ...goalReviews("2026-10-21", 3)];
  const met = metDays({ cards: [], reviews, today: "2026-10-21", settings: { dailyGoal: 10 } });
  assert.deepEqual(streak(met, "2026-10-21"), { current: 2, best: 2, todayMet: false, atRisk: true });
  // Two days later the streak is gone.
  assert.equal(streak(met, "2026-10-23").current, 0);
  assert.equal(streak(met, "2026-10-23").atRisk, false);
});

test("the best streak is the longest run in the log", () => {
  const met = new Set(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-30", "2026-10-01", "2026-10-21"]);
  assert.deepEqual(streak(met, "2026-10-21"), { current: 1, best: 5, todayMet: true, atRisk: false });
  assert.deepEqual(streak(new Set(), "2026-10-21"), { current: 0, best: 0, todayMet: false, atRisk: false });
});

test("activity covers 12 whole weeks ending today", () => {
  const counts = new Map([["2026-10-21", 5]]);
  const days = activity(counts, "2026-10-21");
  assert.equal(days[0].day, "2026-08-03");
  assert.equal(weekday(days[0].day), 0);
  assert.equal(days.at(-1).day, "2026-10-21");
  assert.equal(days.at(-1).count, 5);
  assert.equal(days.length, 7 * 11 + 3);
});
