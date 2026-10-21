// Scheduling, derived entirely from the review log (pure functions, no DOM).
// Boxes, due dates, the daily deck, streaks, and mastery are never stored, so
// changing INTERVALS later reschedules every card.

import { seededShuffle } from "./random.js";

export const INTERVALS = [1, 2, 4, 8, 16, 32];
export const MAX_BOX = INTERVALS.length - 1;
export const MASTERED_BOX = 3;
export const NEW_BADGE_DAYS = 7;
export const SECONDS_PER_CARD = 30;
export const ACTIVITY_WEEKS = 12;

// Practice rows never move a card between boxes.
const SCHEDULING_MODES = new Set(["baseline", "daily", "learn"]);

// --- Days and timestamps ------------------------------------------------------
// A "day" is a local YYYY-MM-DD string; arithmetic on it is done in UTC so
// daylight-saving changes never skip or repeat a day.

const pad = (value, width = 2) => String(value).padStart(width, "0");

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ISO 8601 with milliseconds and the device's UTC offset, such as
// 2026-10-21T14:03:05.120+03:00.
export function localIso(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  return (
    `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${sign}${hours}:${minutes}`
  );
}

function dayNumber(day) {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86400000;
}

export function addDays(day, count) {
  const date = new Date((dayNumber(day) + count) * 86400000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function daysBetween(from, to) {
  return dayNumber(to) - dayNumber(from);
}

// Monday = 0 … Sunday = 6.
export function weekday(day) {
  return (new Date(dayNumber(day) * 86400000).getUTCDay() + 6) % 7;
}

const timeOf = (row) => Date.parse(row.at) || 0;

// Rows in the order they happened; ties are broken by ID so every device agrees.
export function compareRows(a, b) {
  return timeOf(a) - timeOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// --- Boxes and due dates --------------------------------------------------------

const clampBox = (box) => Math.max(0, Math.min(MAX_BOX, Math.trunc(Number(box)) || 0));

// Card ID -> { box, last, due, reviews }. With `before`, only rows whose day is
// earlier than that day count (used for the daily deck).
export function cardStates(reviews, { before } = {}) {
  const rows = reviews
    .filter((row) => SCHEDULING_MODES.has(row.mode) && (!before || row.day < before))
    .sort(compareRows);
  const states = new Map();
  for (const row of rows) {
    const state = states.get(row.card) ?? { box: 0, last: null, reviews: 0 };
    if (row.mode === "baseline") {
      state.box = clampBox(row.box);
    } else {
      state.box = row.knew ? Math.min(MAX_BOX, state.box + 1) : 0;
      state.reviews += 1;
    }
    state.last = row.day;
    states.set(row.card, state);
  }
  for (const state of states.values()) state.due = addDays(state.last, INTERVALS[state.box]);
  return states;
}

export function isRecentlyAdded(card, today) {
  if (!card.added) return false;
  const age = daysBetween(card.added, today);
  return age >= 0 && age < NEW_BADGE_DAYS;
}

// --- Today's deck -------------------------------------------------------------

// The wiki page a card belongs to, such as "wiki/reliability/cache-aside.md".
export function pagePath(card) {
  return card?.pageSlug ? `wiki/${card.pageSlug}.md` : null;
}

// A `canBeNew(card, day)` gate: a card can be new on `day` only when its page
// was marked learned on or before that day. With `enabled` false (the
// onlyLearnedPages setting turned off), every card can be new.
export function learnedPageGate(pages, { enabled = true } = {}) {
  if (!enabled) return () => true;
  const learnedOn = new Map();
  for (const row of pages) {
    // `at` is local ISO 8601, so its first ten characters are the local day.
    if (row.learned === 1) learnedOn.set(row.path, row.at.slice(0, 10));
  }
  return (card, day) => {
    const on = learnedOn.get(pagePath(card));
    return on !== undefined && (!day || on <= day);
  };
}

// The deck depends only on rows from before `today` (and on which pages are
// learned), so it stays the same through the day and on every device.
// `canBeNew(card, today)` gates new cards; see learnedPageGate. By default every
// card can be new.
export function buildDeck({ cards, reviews, today, settings = {}, canBeNew = () => true }) {
  const { dailySize = 12, newPerDay = 4 } = settings;
  const states = cardStates(reviews, { before: today });
  // A card first graded while learning today has started its schedule; it is
  // not offered again as new on the same day.
  const learnedToday = new Set(
    reviews.filter((row) => row.mode === "learn" && row.day === today).map((row) => row.card)
  );
  const rank = new Map(
    seededShuffle(cards.map((card) => card.id).sort(), today).map((id, index) => [id, index])
  );
  const byRank = (a, b) => rank.get(a.id) - rank.get(b.id);

  // Most overdue first: the earliest due date.
  const due = cards
    .filter((card) => states.has(card.id) && states.get(card.id).due <= today)
    .sort((a, b) => states.get(a.id).due.localeCompare(states.get(b.id).due) || byRank(a, b));
  const fresh = cards
    .filter((card) => !states.has(card.id) && !learnedToday.has(card.id) && canBeNew(card, today))
    .sort((a, b) => isRecentlyAdded(b, today) - isRecentlyAdded(a, today) || byRank(a, b))
    .slice(0, Math.max(0, newPerDay));

  const deck = [...due, ...fresh].slice(0, Math.max(0, dailySize));
  const dueIds = new Set(due.map((card) => card.id));
  const dueCount = deck.filter((card) => dueIds.has(card.id)).length;
  return { cards: deck, due: dueCount, new: deck.length - dueCount };
}

// Card ID -> the latest daily row dated `day`, for the cards in `deck`.
export function deckProgress(deck, reviews, day) {
  const inDeck = new Set(deck.map((card) => card.id));
  const done = new Map();
  for (const row of reviews.filter((row) => row.mode === "daily" && row.day === day).sort(compareRows)) {
    if (inDeck.has(row.card)) done.set(row.card, row);
  }
  return done;
}

// --- Activity, goals, and streaks ---------------------------------------------

// Day -> number of reviews of any mode (baselines are imports, not reviews).
export function dayCounts(reviews) {
  const counts = new Map();
  for (const row of reviews) {
    if (row.mode !== "baseline") counts.set(row.day, (counts.get(row.day) ?? 0) + 1);
  }
  return counts;
}

// The set of days that met the goal: at least `dailyGoal` reviews, or that
// day's deck fully graded. Days after `today` are ignored.
export function metDays({ cards, reviews, today, settings = {}, canBeNew }) {
  const { dailyGoal = 10 } = settings;
  const met = new Set();
  const dailyDays = new Set(reviews.filter((row) => row.mode === "daily").map((row) => row.day));
  for (const [day, count] of dayCounts(reviews)) {
    if (day > today) continue;
    if (count >= dailyGoal) {
      met.add(day);
    } else if (dailyDays.has(day)) {
      const deck = buildDeck({ cards, reviews, today: day, settings, canBeNew }).cards;
      if (deck.length && deckProgress(deck, reviews, day).size === deck.length) met.add(day);
    }
  }
  return met;
}

// Consecutive met days ending today, or ending yesterday while today is not met
// yet ("at risk"); `best` is the longest run ever.
export function streak(met, today) {
  const todayMet = met.has(today);
  let current = 0;
  for (let day = todayMet ? today : addDays(today, -1); met.has(day); day = addDays(day, -1)) current += 1;

  let best = 0;
  let run = 0;
  let previous = null;
  for (const day of [...met].filter((day) => day <= today).sort()) {
    run = previous && daysBetween(previous, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { current, best, todayMet, atRisk: !todayMet && current > 0 };
}

export function mastery(cards, states) {
  const mastered = cards.filter((card) => (states.get(card.id)?.box ?? 0) >= MASTERED_BOX).length;
  return { mastered, total: cards.length };
}

// One entry per day from the Monday `weeks - 1` weeks ago through today.
export function activity(counts, today, weeks = ACTIVITY_WEEKS) {
  const start = addDays(today, -weekday(today) - 7 * (weeks - 1));
  const days = [];
  for (let day = start; day <= today; day = addDays(day, 1)) days.push({ day, count: counts.get(day) ?? 0 });
  return days;
}
