// Progress records, merging, and persistence in localStorage.
//
// The document holds three record types (reviews, pages, settings), each keyed
// by its primary key, plus an outbox of changed keys and a sync cursor for the
// progress server. Rows have the same fields as the server's SQLite tables;
// setting values are JSON text, as on the server.
//
// Merge rule for every type: the row with the newer `at` wins; ties keep the
// existing row. Local writes always replace, because they are the newest
// action on this device.

import { MAX_BOX, localDay, localIso } from "./schedule.js";

export const STORAGE_KEY = "llm-wiki-study:v2";
export const V1_KEY = "llm-wiki-flashcards:v1";
// Reserved for the device token (sync); kept apart so export never includes it.
export const TOKEN_KEY = "llm-wiki-study:token";

export const MODES = ["daily", "learn", "practice", "baseline"];
export const TABLES = { reviews: "id", pages: "path", settings: "key" };

export const DEFAULT_SETTINGS = {
  dailySize: 12,
  newPerDay: 4,
  dailyGoal: 10,
  // null means every topic.
  practiceTopics: null,
  practiceOrder: "shuffle",
  // New cards in the daily deck come only from pages marked as learned.
  onlyLearnedPages: true,
};

// Inclusive bounds for the numeric settings.
export const SETTING_LIMITS = {
  dailySize: [1, 100],
  newPerDay: [0, 50],
  dailyGoal: [1, 200],
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}$/;

export function emptyDoc() {
  return { version: 2, reviews: {}, pages: {}, settings: {}, outbox: [], cursor: 0 };
}

function validTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

// A clean copy of a row with only known fields, or null when it is malformed.
export function normalizeRow(table, row) {
  if (!row || typeof row !== "object" || !validTime(row.at)) return null;
  if (table === "reviews") {
    const { id, card, at, day, mode } = row;
    if (typeof id !== "string" || !id || id.length > 120) return null;
    if (typeof card !== "string" || !CARD_RE.test(card)) return null;
    if (typeof day !== "string" || !DAY_RE.test(day) || !MODES.includes(mode)) return null;
    const clean = { id, card, at, day, mode, knew: null, box: null };
    if (mode === "baseline") {
      if (!Number.isInteger(row.box) || row.box < 0 || row.box > MAX_BOX) return null;
      clean.box = row.box;
    } else {
      if (row.knew !== 0 && row.knew !== 1) return null;
      clean.knew = row.knew;
    }
    if (typeof row.device === "string") clean.device = row.device;
    return clean;
  }
  if (table === "pages") {
    const { path, learned, at } = row;
    if (typeof path !== "string" || !path.startsWith("wiki/") || !path.endsWith(".md")) return null;
    if (learned !== 0 && learned !== 1) return null;
    return { path, learned, at };
  }
  if (table === "settings") {
    const { key, value, at } = row;
    if (!Object.hasOwn(DEFAULT_SETTINGS, key) || typeof value !== "string") return null;
    try {
      JSON.parse(value);
    } catch {
      return null;
    }
    return { key, value, at };
  }
  return null;
}

export function isNewer(incoming, existing) {
  return Date.parse(incoming.at) > Date.parse(existing.at);
}

// Rows may arrive as an array or as an object keyed by primary key.
function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function queue(doc, table, key) {
  const entry = `${table}:${key}`;
  if (!doc.outbox.includes(entry)) doc.outbox.push(entry);
}

// Merge rows into `doc` with the merge rule. With `queue`, changed rows are
// added to the outbox (imports and migration); rows pulled from the server are
// merged without it.
export function mergeRows(doc, table, rows, { queue: enqueue = false } = {}) {
  const keyField = TABLES[table];
  let changed = 0;
  let invalid = 0;
  for (const raw of rowsOf(rows)) {
    const row = normalizeRow(table, raw);
    if (!row) {
      invalid += 1;
      continue;
    }
    const key = row[keyField];
    const existing = doc[table][key];
    if (existing && !isNewer(row, existing)) continue;
    doc[table][key] = row;
    changed += 1;
    if (enqueue) queue(doc, table, key);
  }
  return { changed, invalid };
}

export function mergeDoc(doc, data, options) {
  const result = { changed: 0, invalid: 0 };
  for (const table of Object.keys(TABLES)) {
    const { changed, invalid } = mergeRows(doc, table, data?.[table], options);
    result.changed += changed;
    result.invalid += invalid;
  }
  return result;
}

// Convert the v1 flashcards format, {progress: {<id>: {box, reviews, last}},
// topics, order}, into rows: one baseline review per card plus settings.
// Pages are derived afterwards by baselinePages, which needs the cards.
export function migrateV1(v1, now = new Date()) {
  const reviews = [];
  for (const [card, entry] of Object.entries(v1?.progress ?? {})) {
    const when = new Date(entry?.last);
    const date = Number.isNaN(when.getTime()) ? now : when;
    reviews.push({
      id: `baseline:${card}`,
      card,
      at: localIso(date),
      day: localDay(date),
      mode: "baseline",
      knew: null,
      box: Math.max(0, Math.min(MAX_BOX, Math.trunc(Number(entry?.box)) || 0)),
    });
  }
  const at = localIso(now);
  const settings = [];
  if (Array.isArray(v1?.topics) && v1.topics.length) {
    const topics = v1.topics.filter((slug) => typeof slug === "string");
    settings.push({ key: "practiceTopics", value: JSON.stringify(topics), at });
  }
  if (v1?.order === "weakest") settings.push({ key: "practiceOrder", value: JSON.stringify("weakest"), at });
  return { reviews, pages: [], settings };
}

// Pages to mark learned because their cards have baseline rows (progress
// carried over from the v1 flashcards), so that progress keeps feeding the
// daily deck. `pageOf(cardId)` returns a page path or null. A page that already
// has a record, learned or not, is left alone, so this runs once per page. The
// row's `at` is the page's earliest baseline, so every device derives the same
// row.
export function baselinePages(doc, pageOf) {
  const earliest = new Map();
  for (const row of Object.values(doc.reviews)) {
    if (row.mode !== "baseline") continue;
    const path = pageOf(row.card);
    if (!path || doc.pages[path]) continue;
    const current = earliest.get(path);
    if (!current || isNewer(current, row)) earliest.set(path, row);
  }
  return [...earliest].map(([path, row]) => ({ path, learned: 1, at: row.at }));
}

// --- Storage (best effort: private windows may block it) ------------------------

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJson(storage, key) {
  try {
    const text = storage?.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// Create the store. `storage` and `now` are injectable for tests. `pageOf`
// maps a card ID to its wiki page path; when given, pages of cards with
// baseline rows are marked learned on load and after an import.
export function createStore({ storage = defaultStorage(), now = () => new Date(), pageOf = null } = {}) {
  let doc = emptyDoc();
  let persistent = Boolean(storage);
  let migrated = false;
  const listeners = new Set();

  function save() {
    try {
      if (!storage) throw new Error("No storage");
      storage.setItem(STORAGE_KEY, JSON.stringify(doc));
      persistent = true;
    } catch {
      // Progress lasts for this session only.
      persistent = false;
    }
    for (const listener of listeners) listener();
  }

  function put(table, row) {
    const key = row[TABLES[table]];
    doc[table][key] = row;
    queue(doc, table, key);
    save();
    return row;
  }

  try {
    // Probing access also detects storage that throws on every call.
    storage?.getItem(STORAGE_KEY);
  } catch {
    persistent = false;
  }

  const saved = readJson(storage, STORAGE_KEY);
  if (saved) {
    mergeDoc(doc, saved);
    doc.outbox = Array.isArray(saved.outbox) ? saved.outbox.filter((entry) => typeof entry === "string") : [];
    doc.cursor = Number.isInteger(saved.cursor) ? saved.cursor : 0;
  } else {
    const v1 = readJson(storage, V1_KEY);
    if (v1) {
      // The v1 key is kept so the old version can still be restored.
      mergeDoc(doc, migrateV1(v1, now()), { queue: true });
      migrated = true;
      save();
    }
  }

  // Returns the number of pages marked learned.
  function learnBaselinePages() {
    if (!pageOf) return 0;
    const rows = baselinePages(doc, pageOf);
    if (!rows.length) return 0;
    mergeRows(doc, "pages", rows, { queue: true });
    save();
    return rows.length;
  }
  const baselinePagesLearned = learnBaselinePages();

  return {
    get persistent() {
      return persistent;
    },
    // Pages marked learned on load because their cards had baseline rows.
    get baselinePagesLearned() {
      return baselinePagesLearned;
    },
    get migrated() {
      return migrated;
    },
    get cursor() {
      return doc.cursor;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    reviews() {
      return Object.values(doc.reviews);
    },

    // Record one grading. Passing the `id` of an earlier row regrades it;
    // otherwise the row is `<sessionId>:<card>`, so regrading within a session
    // replaces the row.
    addReview({ id, sessionId, card, mode, knew }) {
      const date = now();
      return put("reviews", {
        id: id ?? `${sessionId}:${card}`,
        card,
        at: localIso(date),
        day: localDay(date),
        mode,
        knew: knew ? 1 : 0,
        box: null,
      });
    },

    page(path) {
      return doc.pages[path] ?? null;
    },
    pages() {
      return Object.values(doc.pages);
    },
    setPage(path, learned) {
      return put("pages", { path, learned: learned ? 1 : 0, at: localIso(now()) });
    },

    setting(key) {
      const fallback = DEFAULT_SETTINGS[key];
      const row = doc.settings[key];
      if (!row) return fallback;
      let value;
      try {
        value = JSON.parse(row.value);
      } catch {
        return fallback;
      }
      if (SETTING_LIMITS[key]) {
        const [min, max] = SETTING_LIMITS[key];
        return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
      }
      if (key === "practiceTopics") return Array.isArray(value) ? value : fallback;
      if (key === "practiceOrder") return value === "weakest" ? "weakest" : "shuffle";
      if (key === "onlyLearnedPages") return typeof value === "boolean" ? value : fallback;
      return value;
    },
    settings() {
      return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key) => [key, this.setting(key)]));
    },
    setSetting(key, value) {
      return put("settings", { key, value: JSON.stringify(value), at: localIso(now()) });
    },

    // Rows waiting to be sent to the server, grouped by table.
    outboxRows() {
      const rows = { reviews: [], pages: [], settings: [] };
      for (const entry of doc.outbox) {
        const split = entry.indexOf(":");
        const table = entry.slice(0, split);
        const row = doc[table]?.[entry.slice(split + 1)];
        if (row) rows[table].push(row);
      }
      return rows;
    },
    // Remove sent rows from the outbox unless they changed while in flight.
    acknowledge(sent, cursor) {
      for (const table of Object.keys(TABLES)) {
        for (const row of sent[table] ?? []) {
          const key = row[TABLES[table]];
          if (doc[table][key]?.at === row.at) doc.outbox = doc.outbox.filter((entry) => entry !== `${table}:${key}`);
        }
      }
      if (Number.isInteger(cursor)) doc.cursor = cursor;
      save();
    },
    // Merge rows pulled from the server (not queued for sending back).
    mergeRemote(data) {
      const result = mergeDoc(doc, data);
      if (result.changed) save();
      return result;
    },

    exportData() {
      return {
        format: "llm-wiki-study",
        version: 2,
        exported: localIso(now()),
        reviews: Object.values(doc.reviews),
        pages: Object.values(doc.pages),
        settings: Object.values(doc.settings),
      };
    },
    // Merge an exported file (or a v1 flashcards document) with the merge rule.
    importData(data) {
      const rows = data && typeof data === "object" && "progress" in data ? migrateV1(data, now()) : data;
      const result = mergeDoc(doc, rows, { queue: true });
      save();
      learnBaselinePages();
      return result;
    },

    reset() {
      doc = emptyDoc();
      save();
    },
  };
}
