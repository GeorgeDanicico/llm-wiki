import assert from "node:assert/strict";
import { test } from "node:test";

import { localDay, localIso } from "./schedule.js";
import { STORAGE_KEY, V1_KEY, baselinePages, createStore, emptyDoc, mergeRows, migrateV1 } from "./store.js";

// In-memory stand-in for localStorage.
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

// Storage that throws on every call, like a browser with storage blocked.
const blockedStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("SecurityError");
  },
};

const review = (id, at, knew = 1) => ({ id, card: "REL-CA-002", at, day: at.slice(0, 10), mode: "daily", knew, box: null });

test("merge: the newer `at` wins", () => {
  const doc = emptyDoc();
  mergeRows(doc, "reviews", [review("s1:REL-CA-002", "2026-10-21T10:00:00.000+00:00", 0)]);
  const result = mergeRows(doc, "reviews", [review("s1:REL-CA-002", "2026-10-21T10:00:05.000+00:00", 1)]);
  assert.equal(result.changed, 1);
  assert.equal(doc.reviews["s1:REL-CA-002"].knew, 1);
  // An older row never overwrites a newer one.
  mergeRows(doc, "reviews", [review("s1:REL-CA-002", "2026-10-21T09:00:00.000+00:00", 0)]);
  assert.equal(doc.reviews["s1:REL-CA-002"].knew, 1);
});

test("merge: timestamps are compared as instants, across offsets", () => {
  const doc = emptyDoc();
  mergeRows(doc, "reviews", [review("s1:REL-CA-002", "2026-10-21T12:00:00.000+03:00", 0)]); // 09:00Z
  mergeRows(doc, "reviews", [review("s1:REL-CA-002", "2026-10-21T10:00:00.000+00:00", 1)]); // 10:00Z
  assert.equal(doc.reviews["s1:REL-CA-002"].knew, 1);
});

test("merge: a tie keeps the existing row", () => {
  const doc = emptyDoc();
  const at = "2026-10-21T10:00:00.000+00:00";
  mergeRows(doc, "reviews", [review("s1:REL-CA-002", at, 0)]);
  const result = mergeRows(doc, "reviews", [review("s1:REL-CA-002", at, 1)]);
  assert.equal(result.changed, 0);
  assert.equal(doc.reviews["s1:REL-CA-002"].knew, 0);
});

test("merge: malformed rows are counted and skipped", () => {
  const doc = emptyDoc();
  const result = mergeRows(doc, "reviews", [
    { id: "x", card: "not an id", at: "2026-10-21T10:00:00Z", day: "2026-10-21", mode: "daily", knew: 1 },
    { id: "y", card: "REL-CA-002", at: "yesterday", day: "2026-10-21", mode: "daily", knew: 1 },
    { id: "z", card: "REL-CA-002", at: "2026-10-21T10:00:00Z", day: "2026-10-21", mode: "baseline", box: 9 },
  ]);
  assert.deepEqual(result, { changed: 0, invalid: 3 });
  const settings = mergeRows(doc, "settings", [{ key: "unknown", value: "1", at: "2026-10-21T10:00:00Z" }]);
  assert.equal(settings.invalid, 1);
});

test("v1 migration turns progress into baselines and topics into a setting", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const last = "2026-10-04T18:30:00.000Z";
  const rows = migrateV1(
    {
      progress: { "REL-CA-002": { box: 2, reviews: 3, last }, "DATA-OL-001": { box: 9, reviews: 1 } },
      topics: ["reliability", "java"],
      order: "weakest",
    },
    now
  );
  assert.deepEqual(rows.reviews[0], {
    id: "baseline:REL-CA-002",
    card: "REL-CA-002",
    at: localIso(new Date(last)),
    day: localDay(new Date(last)),
    mode: "baseline",
    knew: null,
    box: 2,
  });
  // Out-of-range boxes are clamped; a missing `last` falls back to now.
  assert.equal(rows.reviews[1].box, 5);
  assert.equal(rows.reviews[1].day, localDay(now));
  assert.deepEqual(
    rows.settings.map(({ key, value }) => [key, JSON.parse(value)]),
    [["practiceTopics", ["reliability", "java"]], ["practiceOrder", "weakest"]]
  );
});

test("the store migrates v1 data on first load and keeps the v1 key", () => {
  const v1 = JSON.stringify({ progress: { "REL-CA-002": { box: 3, reviews: 4, last: "2026-10-04T18:30:00.000Z" } }, topics: ["reliability"], order: "shuffle" });
  const storage = memoryStorage({ [V1_KEY]: v1 });
  const store = createStore({ storage, now: () => new Date("2026-10-21T12:00:00Z") });
  assert.equal(store.migrated, true);
  assert.equal(store.reviews().length, 1);
  assert.equal(store.reviews()[0].box, 3);
  assert.deepEqual(store.setting("practiceTopics"), ["reliability"]);
  assert.equal(storage.getItem(V1_KEY), v1);
  assert.ok(storage.getItem(STORAGE_KEY));
  // Migrated rows wait in the outbox for the progress server.
  assert.deepEqual(store.outboxRows().reviews.map((row) => row.id), ["baseline:REL-CA-002"]);

  // The next load reads v2 and does not migrate again.
  const again = createStore({ storage });
  assert.equal(again.migrated, false);
  assert.equal(again.reviews().length, 1);
});

test("regrading within a session replaces the row", () => {
  let clock = Date.parse("2026-10-21T10:00:00Z");
  const store = createStore({ storage: memoryStorage(), now: () => new Date((clock += 1000)) });
  store.addReview({ sessionId: "abc", card: "REL-CA-002", mode: "daily", knew: false });
  store.addReview({ sessionId: "abc", card: "REL-CA-002", mode: "daily", knew: true });
  store.addReview({ sessionId: "def", card: "REL-CA-002", mode: "practice", knew: true });
  assert.equal(store.reviews().length, 2);
  assert.equal(store.reviews().find((row) => row.id === "abc:REL-CA-002").knew, 1);
});

test("settings round-trip as JSON text with defaults and limits", () => {
  const store = createStore({ storage: memoryStorage() });
  assert.equal(store.setting("dailySize"), 12);
  store.setSetting("dailySize", 20);
  store.setSetting("dailyGoal", 5000);
  assert.equal(store.setting("dailySize"), 20);
  assert.equal(store.setting("dailyGoal"), 200);
  assert.equal(typeof store.outboxRows().settings[0].value, "string");
});

test("export and import merge with the merge rule", () => {
  const source = createStore({ storage: memoryStorage(), now: () => new Date("2026-10-21T10:00:00Z") });
  source.addReview({ sessionId: "abc", card: "REL-CA-002", mode: "daily", knew: true });
  const file = JSON.parse(JSON.stringify(source.exportData()));

  const target = createStore({ storage: memoryStorage(), now: () => new Date("2026-10-21T11:00:00Z") });
  assert.deepEqual(target.importData(file), { changed: 1, invalid: 0 });
  // Importing the same file again changes nothing.
  assert.deepEqual(target.importData(file), { changed: 0, invalid: 0 });
  assert.equal(target.reviews()[0].knew, 1);
});

test("acknowledge clears sent rows unless they changed in flight", () => {
  let clock = Date.parse("2026-10-21T10:00:00Z");
  const store = createStore({ storage: memoryStorage(), now: () => new Date((clock += 1000)) });
  store.addReview({ sessionId: "a", card: "REL-CA-001", mode: "daily", knew: true });
  store.addReview({ sessionId: "a", card: "REL-CA-002", mode: "daily", knew: true });
  const sent = store.outboxRows();
  store.addReview({ sessionId: "a", card: "REL-CA-002", mode: "daily", knew: false });
  store.acknowledge(sent, 7);
  assert.deepEqual(store.outboxRows().reviews.map((row) => row.card), ["REL-CA-002"]);
  assert.equal(store.cursor, 7);
});

test("the store still works for the session when storage is blocked", () => {
  const store = createStore({ storage: blockedStorage });
  assert.equal(store.persistent, false);
  store.addReview({ sessionId: "a", card: "REL-CA-001", mode: "daily", knew: true });
  assert.equal(store.reviews().length, 1);
  assert.equal(store.persistent, false);
});

test("reset empties progress without bringing back v1 data", () => {
  const storage = memoryStorage({ [V1_KEY]: JSON.stringify({ progress: { "REL-CA-002": { box: 1, last: "2026-10-04T18:30:00.000Z" } } }) });
  createStore({ storage }).reset();
  assert.equal(createStore({ storage }).reviews().length, 0);
});

// --- Pages learned from baselines --------------------------------------------------

const PAGES = { "REL-CA-002": "wiki/reliability/cache-aside.md", "REL-CA-003": "wiki/reliability/cache-aside.md", "DATA-OL-001": "wiki/data-access/optimistic-locking.md" };
const pageOf = (id) => PAGES[id] ?? null;

test("v1 migration marks the pages of migrated cards as learned", () => {
  const v1 = JSON.stringify({
    progress: {
      "REL-CA-002": { box: 3, reviews: 4, last: "2026-10-04T18:30:00.000Z" },
      "REL-CA-003": { box: 1, reviews: 1, last: "2026-10-02T08:00:00.000Z" },
      "UNKNOWN-001": { box: 1, reviews: 1, last: "2026-10-02T08:00:00.000Z" },
    },
  });
  const storage = memoryStorage({ [V1_KEY]: v1 });
  const store = createStore({ storage, now: () => new Date("2026-10-21T12:00:00Z"), pageOf });
  assert.equal(store.baselinePagesLearned, 1);
  const learned = store.page("wiki/reliability/cache-aside.md");
  assert.equal(learned.learned, 1);
  // The earliest baseline of the page's cards dates the record.
  assert.equal(learned.at, localIso(new Date("2026-10-02T08:00:00.000Z")));
  assert.deepEqual(store.outboxRows().pages.map((row) => row.path), ["wiki/reliability/cache-aside.md"]);
});

test("stores migrated before the learn panel get their pages once, on load", () => {
  const doc = emptyDoc();
  mergeRows(doc, "reviews", migrateV1({ progress: { "DATA-OL-001": { box: 2, last: "2026-10-03T08:00:00.000Z" } } }).reviews);
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(doc) });
  const store = createStore({ storage, pageOf });
  assert.equal(store.baselinePagesLearned, 1);
  assert.equal(store.page("wiki/data-access/optimistic-locking.md").learned, 1);

  // Idempotent: the next load finds the record and adds nothing.
  assert.equal(createStore({ storage, pageOf }).baselinePagesLearned, 0);
  // A page the user marked as not learned stays that way.
  store.setPage("wiki/data-access/optimistic-locking.md", false);
  const again = createStore({ storage, pageOf });
  assert.equal(again.baselinePagesLearned, 0);
  assert.equal(again.page("wiki/data-access/optimistic-locking.md").learned, 0);
});

test("baselinePages ignores other modes, unknown cards, and pages with records", () => {
  const doc = emptyDoc();
  mergeRows(doc, "reviews", [
    { id: "s:REL-CA-002", card: "REL-CA-002", at: "2026-10-01T08:00:00.000+00:00", day: "2026-10-01", mode: "daily", knew: 1 },
    { id: "baseline:UNKNOWN-001", card: "UNKNOWN-001", at: "2026-10-01T08:00:00.000+00:00", day: "2026-10-01", mode: "baseline", box: 1 },
    { id: "baseline:DATA-OL-001", card: "DATA-OL-001", at: "2026-10-01T08:00:00.000+00:00", day: "2026-10-01", mode: "baseline", box: 1 },
  ]);
  mergeRows(doc, "pages", [{ path: "wiki/data-access/optimistic-locking.md", learned: 0, at: "2026-10-05T08:00:00.000+00:00" }]);
  assert.deepEqual(baselinePages(doc, pageOf), []);
});

test("importing v1 data marks its pages learned", () => {
  const store = createStore({ storage: memoryStorage(), pageOf });
  store.importData({ progress: { "REL-CA-002": { box: 2, last: "2026-10-04T18:30:00.000Z" } } });
  assert.equal(store.page("wiki/reliability/cache-aside.md").learned, 1);
});

test("onlyLearnedPages defaults to on and only accepts booleans", () => {
  const store = createStore({ storage: memoryStorage() });
  assert.equal(store.setting("onlyLearnedPages"), true);
  store.setSetting("onlyLearnedPages", false);
  assert.equal(store.setting("onlyLearnedPages"), false);
  store.setSetting("onlyLearnedPages", "no");
  assert.equal(store.setting("onlyLearnedPages"), true);
});
