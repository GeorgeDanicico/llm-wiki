import assert from "node:assert/strict";
import { test } from "node:test";

import { cardStates, metDays, streak } from "./schedule.js";
import { TOKEN_KEY, createStore } from "./store.js";
import { BATCH_ROWS, DEBOUNCE_MS, RETRY_MAX_MS, RETRY_MIN_MS, createSync, serverAvailable, takeRows } from "./sync.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

// Timers that only fire when the test says so.
function fakeTimers() {
  let next = 1;
  const pending = new Map();
  return {
    pending,
    setTimeout(fn, delay) {
      const id = next++;
      pending.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    delays: () => [...pending.values()].map((timer) => timer.delay),
    // Fire the timers with this delay.
    async fire(delay) {
      for (const [id, timer] of [...pending]) {
        if (timer.delay !== delay) continue;
        pending.delete(id);
        await timer.fn();
      }
    },
  };
}

// An in-memory progress server with the real server's merge rule and cursor.
function fakeServer(tokens = { "good-token": "phone", "laptop-token": "laptop" }) {
  const keys = { reviews: "id", pages: "path", settings: "key" };
  const tables = { reviews: new Map(), pages: new Map(), settings: new Map() };
  let seq = 0;
  const requests = [];
  const server = {
    tables,
    requests,
    offline: false,
    status: null,
    async fetch(url, options) {
      if (server.offline) throw new TypeError("Failed to fetch");
      const body = JSON.parse(options.body);
      const token = options.headers.Authorization.replace(/^Bearer /, "");
      requests.push({ url, token, body });
      const respond = (status, payload) => ({ ok: status < 300, status, json: async () => payload, headers: { get: () => null } });
      if (server.status) return respond(server.status, { error: "forced" });
      const device = tokens[token];
      if (!device) return respond(401, { error: "missing or unknown device token" });
      for (const [table, key] of Object.entries(keys)) {
        for (const row of body[table] ?? []) {
          const existing = tables[table].get(row[key]);
          if (existing && Date.parse(row.at) <= Date.parse(existing.row.at)) continue;
          seq += 1;
          tables[table].set(row[key], { seq, row: table === "reviews" ? { ...row, device } : { ...row } });
        }
      }
      const result = { seq, more: false, device, reviews: [], pages: [], settings: [] };
      for (const table of Object.keys(keys)) {
        for (const entry of tables[table].values()) if (entry.seq > body.since) result[table].push(entry.row);
      }
      return respond(200, result);
    },
  };
  return server;
}

function setup({ server = fakeServer(), token = "good-token", clock = () => new Date("2026-10-21T10:00:00Z"), storage } = {}) {
  storage ??= memoryStorage(token ? { [TOKEN_KEY]: token } : {});
  const store = createStore({ storage, now: clock });
  const timers = fakeTimers();
  const sync = createSync({ store, fetch: (...args) => server.fetch(...args), storage, timers, isOnline: () => !server.offline, log: () => {} });
  return { server, store, sync, timers, storage };
}

const grade = (store, card, knew = true, sessionId = "s1") => store.addReview({ sessionId, card, mode: "daily", knew });

test("without a token, sync stays off and never calls fetch", async () => {
  const { server, store, sync } = setup({ token: null });
  grade(store, "REL-CA-002");
  sync.changed();
  await sync.syncNow();
  assert.equal(server.requests.length, 0);
  assert.equal(sync.status().state, "off");
  assert.equal(sync.connected, false);
});

test("a sync sends the outbox with the cursor, saves the new cursor, and empties the outbox", async () => {
  const { server, store, sync } = setup();
  grade(store, "REL-CA-002");
  store.setSetting("dailySize", 15);
  await sync.syncNow();
  assert.equal(server.requests.length, 1);
  const [{ body }] = server.requests;
  assert.equal(body.since, 0);
  assert.equal(body.reviews.length, 1);
  assert.equal(body.settings[0].value, "15");
  assert.equal(store.cursor, 2);
  assert.equal(store.pending, 0);
  assert.equal(sync.status().state, "idle");
  assert.equal(sync.status().device, "phone");
  await sync.syncNow();
  assert.equal(server.requests[1].body.since, 2);
  assert.equal(server.requests[1].body.reviews.length, 0);
});

test("a row changed while the request is in flight stays in the outbox", async () => {
  const storage = memoryStorage({ [TOKEN_KEY]: "good-token" });
  let tick = 0;
  const store = createStore({ storage, now: () => new Date(Date.UTC(2026, 9, 21, 10, 0, tick++)) });
  const server = fakeServer();
  const first = store.addReview({ sessionId: "s1", card: "REL-CA-002", mode: "daily", knew: false });
  const sync = createSync({
    store,
    storage,
    timers: fakeTimers(),
    isOnline: () => true,
    fetch: async (url, options) => {
      const response = await server.fetch(url, options);
      // Regrade the same row before the response arrives.
      if (server.requests.length === 1) store.addReview({ id: first.id, card: "REL-CA-002", mode: "daily", knew: true });
      return response;
    },
  });
  await sync.syncNow();
  assert.equal(store.pending, 1, "the regraded row waits for the next sync");
  assert.equal(store.reviews()[0].knew, 1, "the server's older copy does not overwrite the regrade");
  await sync.syncNow();
  assert.equal(store.pending, 0);
  assert.equal(server.tables.reviews.get(first.id).row.knew, 1);
});

test("network failures keep the outbox and retry with backoff", async () => {
  const { server, store, sync, timers } = setup();
  grade(store, "REL-CA-002");
  server.offline = true;
  // Reported as offline without a request while the browser says it is offline.
  await sync.syncNow();
  assert.equal(sync.status().state, "offline");
  server.offline = false;
  const realFetch = server.fetch;
  let failures = 0;
  server.fetch = async (...args) => {
    if (failures < 3) {
      failures += 1;
      throw new TypeError("Failed to fetch");
    }
    return realFetch(...args);
  };
  await sync.syncNow();
  assert.equal(sync.status().state, "offline");
  assert.deepEqual(timers.delays(), [RETRY_MIN_MS]);
  await timers.fire(RETRY_MIN_MS);
  assert.deepEqual(timers.delays(), [RETRY_MIN_MS * 2]);
  await timers.fire(RETRY_MIN_MS * 2);
  assert.deepEqual(timers.delays(), [RETRY_MIN_MS * 4]);
  assert.equal(store.pending, 1);
  await timers.fire(RETRY_MIN_MS * 4);
  assert.equal(store.pending, 0);
  assert.equal(sync.status().state, "idle");
  assert.deepEqual(timers.delays(), []);
});

test("backoff is capped at five minutes", async () => {
  const { server, store, sync, timers } = setup();
  grade(store, "REL-CA-002");
  server.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await sync.syncNow();
  for (let round = 0; round < 12; round += 1) await timers.fire(timers.delays()[0]);
  assert.deepEqual(timers.delays(), [RETRY_MAX_MS]);
});

test("a 401 disconnects the device until a new token is set", async () => {
  const { server, store, sync } = setup({ token: "revoked-token" });
  grade(store, "REL-CA-002");
  await sync.syncNow();
  assert.equal(sync.status().state, "unauthorized");
  assert.equal(server.requests.length, 1);
  sync.changed();
  await sync.syncNow();
  assert.equal(server.requests.length, 1, "no more requests after a 401");
  assert.equal(store.pending, 1);
  const result = await sync.connect("good-token");
  assert.deepEqual(result, { ok: true, device: "phone" });
  assert.equal(store.pending, 0);
  assert.equal(server.tables.reviews.size, 1);
});

test("a 400 keeps the rows in the outbox and does not retry on a timer", async () => {
  const { server, store, sync, timers } = setup();
  grade(store, "REL-CA-002");
  server.status = 400;
  await sync.syncNow();
  assert.equal(sync.status().state, "error");
  assert.equal(store.pending, 1);
  assert.deepEqual(timers.delays(), []);
  server.status = null;
  await sync.syncNow();
  assert.equal(store.pending, 0);
});

test("connecting tests the token, then uploads everything on the device with since = 0", async () => {
  const { server, store, sync, storage } = setup({ token: null });
  grade(store, "REL-CA-002");
  grade(store, "REL-CA-003");
  store.setPage("wiki/reliability/cache-aside.md", true);
  // Pretend an earlier connection had already sent these rows.
  store.acknowledge(store.outboxRows(), 7);
  assert.equal(store.pending, 0);

  const refused = await sync.connect("wrong-token");
  assert.equal(refused.ok, false);
  assert.equal(refused.kind, "unauthorized");
  assert.equal(storage.getItem(TOKEN_KEY), null);

  const result = await sync.connect("  good-token\n");
  assert.equal(result.ok, true);
  assert.equal(storage.getItem(TOKEN_KEY), "good-token");
  const upload = server.requests.at(-1).body;
  assert.equal(upload.since, 0);
  assert.equal(upload.reviews.length, 2);
  assert.equal(upload.pages.length, 1);
  assert.equal(store.pending, 0);

  sync.disconnect();
  assert.equal(storage.getItem(TOKEN_KEY), null);
  assert.equal(sync.status().state, "off");
  assert.equal(store.reviews().length, 2, "disconnecting keeps local progress");
});

test("large outboxes are sent in batches", async () => {
  const { server, store, sync } = setup();
  for (let index = 0; index < BATCH_ROWS + 5; index += 1) grade(store, "REL-CA-002", true, `s${index}`);
  await sync.syncNow();
  assert.equal(server.requests.length, 2);
  assert.equal(server.requests[0].body.reviews.length, BATCH_ROWS);
  assert.equal(server.requests[1].body.reviews.length, 5);
  assert.equal(store.pending, 0);
});

test("takeRows keeps the table shape and reports whether everything fit", () => {
  const rows = { reviews: [1, 2, 3], pages: [4], settings: [5] };
  assert.deepEqual(takeRows(rows, 4), { batch: { reviews: [1, 2, 3], pages: [4], settings: [] }, complete: false });
  assert.deepEqual(takeRows(rows, 5).complete, true);
});

test("local changes sync three seconds after the last one", async () => {
  const { server, store, sync, timers } = setup();
  sync.start({ win: null, doc: null });
  await sync.syncNow();
  const before = server.requests.length;
  grade(store, "REL-CA-002");
  grade(store, "REL-CA-003");
  assert.deepEqual(timers.delays(), [DEBOUNCE_MS]);
  assert.equal(server.requests.length, before);
  await timers.fire(DEBOUNCE_MS);
  assert.equal(server.requests.length, before + 1);
  assert.equal(store.pending, 0);
  // Merging the response does not schedule another sync.
  assert.deepEqual(timers.delays(), []);
});

test("only one sync runs at a time", async () => {
  const { server, store, sync } = setup();
  grade(store, "REL-CA-002");
  const first = sync.syncNow();
  const second = sync.syncNow();
  assert.equal(first, second);
  await first;
  // The second call ran once more after the first, not in parallel.
  assert.equal(server.requests.length, 2);
});

test("two devices converge on the same reviews, boxes, and streak", async () => {
  const server = fakeServer();
  const days = ["2026-10-19", "2026-10-20", "2026-10-21"];
  let phoneClock;
  let laptopClock;
  const phone = setup({ server, token: "good-token", clock: () => phoneClock });
  const laptop = setup({ server, token: "laptop-token", clock: () => laptopClock });
  for (const [index, day] of days.entries()) {
    // Midday UTC, so every device time zone sees the same local day.
    phoneClock = new Date(`${day}T11:00:00Z`);
    laptopClock = new Date(`${day}T13:00:00Z`);
    for (let card = 1; card <= 6; card += 1) grade(phone.store, `REL-CA-00${card}`, card % 2 === 0, `p${index}`);
    for (let card = 1; card <= 6; card += 1) grade(laptop.store, `DATA-OL-00${card}`, true, `l${index}`);
  }
  await laptop.sync.syncNow();
  // The phone goes offline, reviews, and reconnects later.
  server.offline = true;
  phoneClock = new Date("2026-10-21T12:00:00Z");
  grade(phone.store, "REL-CA-001", true, "p-offline");
  await phone.sync.syncNow();
  assert.equal(phone.sync.status().state, "offline");
  assert.equal(phone.store.pending, 19);
  server.offline = false;
  await phone.sync.syncNow();
  await laptop.sync.syncNow();

  const ids = (store) => store.reviews().map((row) => row.id).sort();
  assert.deepEqual(ids(phone.store), ids(laptop.store));
  assert.equal(phone.store.reviews().length, 37);
  const settings = { dailySize: 12, newPerDay: 4, dailyGoal: 10 };
  const derived = (store) => {
    const reviews = store.reviews();
    const states = Object.fromEntries([...cardStates(reviews)].map(([id, state]) => [id, state.box]));
    const met = metDays({ cards: [], reviews, today: "2026-10-21", settings, canBeNew: () => false });
    return { states, streak: streak(met, "2026-10-21") };
  };
  assert.deepEqual(derived(phone.store), derived(laptop.store));
  assert.equal(derived(phone.store).streak.current, 3);
});

test("serverAvailable is true only for a healthy progress server", async () => {
  const ok = async () => ({ ok: true, json: async () => ({ ok: true, schema: 1 }) });
  const missing = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const offline = async () => {
    throw new TypeError("Failed to fetch");
  };
  assert.equal(await serverAvailable(ok), true);
  assert.equal(await serverAvailable(missing), false);
  assert.equal(await serverAvailable(offline), false);
});
