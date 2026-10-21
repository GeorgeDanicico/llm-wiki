// Sync with the progress server (server/progress_server.py).
//
// localStorage stays the working copy; the server holds the durable, shared
// copy. With no device token, sync is off and nothing here touches the
// network, so the GitHub Pages copy stays local-only.
//
// One sync is a single POST to api/sync: the rows in the store's outbox plus
// the stored cursor as `since`. The response holds every row changed since
// then and the new cursor. Sent rows leave the outbox unless they changed while
// the request was in flight; returned rows merge with the normal merge rule.
//
// Triggers: start, the tab becoming visible, the `online` event, 3 seconds
// after the last local change, and every 5 minutes while visible. One sync
// runs at a time; network failures retry with backoff (5 s doubling to 5 min).
// A 401 stops syncing until a new token is set.

import { TABLES, TOKEN_KEY } from "./store.js";

export const SYNC_URL = "api/sync";
export const HEALTH_URL = "api/health";
// Rows per request; the server accepts at most 5,000 and 1 MB.
export const BATCH_ROWS = 1000;
export const DEBOUNCE_MS = 3000;
export const INTERVAL_MS = 5 * 60 * 1000;
export const RETRY_MIN_MS = 5000;
export const RETRY_MAX_MS = 5 * 60 * 1000;
export const TIMEOUT_MS = 20000;
// Requests in one sync, in case the outbox keeps changing.
const MAX_ROUNDS = 50;
// Larger than any cursor: an empty request that returns no rows, used to test a token.
const TEST_CURSOR = Number.MAX_SAFE_INTEGER;

export class SyncError extends Error {
  constructor(kind, message, status = 0) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// The first `limit` outbox rows, keeping the per-table shape the server expects.
export function takeRows(rows, limit) {
  const batch = {};
  let left = limit;
  let total = 0;
  for (const table of Object.keys(TABLES)) {
    const all = rows[table] ?? [];
    batch[table] = all.slice(0, Math.max(0, left));
    left -= batch[table].length;
    total += all.length;
  }
  return { batch, complete: left >= 0 && total <= limit };
}

// POST one batch; resolve with the parsed response or reject with a SyncError
// whose kind is "offline", "unauthorized", "rejected" (400), or "server".
export async function postSync(fetchImpl, token, body, { url = SYNC_URL, timeout = TIMEOUT_MS, timers = globalThis } = {}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? timers.setTimeout(() => controller.abort(), timeout) : null;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
  } catch (error) {
    throw new SyncError("offline", error?.message || "Network error");
  } finally {
    if (timer != null) timers.clearTimeout(timer);
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const message = payload?.error || `HTTP ${response.status}`;
  if (response.status === 401) throw new SyncError("unauthorized", message, 401);
  if (response.status === 400 || response.status === 413) throw new SyncError("rejected", message, response.status);
  if (!response.ok) {
    const error = new SyncError("server", message, response.status);
    error.retryAfter = Number(response.headers?.get?.("Retry-After")) || 0;
    throw error;
  }
  if (!payload || !Number.isInteger(payload.seq)) throw new SyncError("server", "Unexpected response from the server", response.status);
  return payload;
}

// Whether this copy of the site has a progress server (the VPS does; GitHub
// Pages does not).
export async function serverAvailable(fetchImpl = globalThis.fetch?.bind(globalThis), url = HEALTH_URL) {
  try {
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.ok === true;
  } catch {
    return false;
  }
}

// Create the sync controller. Everything that touches the browser is
// injectable for tests: `fetch`, `storage`, `timers` ({setTimeout,
// clearTimeout}), `isOnline`, `isVisible`, and `now`.
export function createSync({
  store,
  fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = defaultStorage(),
  timers = globalThis,
  isOnline = () => globalThis.navigator?.onLine !== false,
  isVisible = () => globalThis.document?.visibilityState !== "hidden",
  now = () => new Date(),
  url = SYNC_URL,
  log = (...args) => console.warn(...args),
} = {}) {
  // Used when storage is blocked, so the token lasts for this session.
  let memoryToken = null;
  let running = null;
  let again = false;
  let applying = false;
  let debounceTimer = null;
  let retryTimer = null;
  let retryDelay = RETRY_MIN_MS;
  const listeners = new Set();
  const status = {
    // off | idle | syncing | offline | error | unauthorized
    state: "off",
    device: null,
    lastSynced: null,
    error: null,
    // Rows from the server that changed this device's data, since start.
    received: 0,
  };

  function readToken() {
    try {
      const value = storage?.getItem(TOKEN_KEY);
      if (value) return value;
    } catch {
      // Blocked storage: fall back to the session copy.
    }
    return memoryToken;
  }

  function writeToken(value) {
    memoryToken = value;
    try {
      if (value) storage?.setItem(TOKEN_KEY, value);
      else storage?.removeItem(TOKEN_KEY);
    } catch {
      // Kept in memory for this session only.
    }
  }

  function set(changes) {
    Object.assign(status, changes);
    for (const listener of listeners) listener(api.status());
  }

  function clearTimer(name) {
    if (name === "debounce" && debounceTimer != null) {
      timers.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (name === "retry" && retryTimer != null) {
      timers.clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function scheduleRetry(delay = retryDelay) {
    clearTimer("retry");
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      return api.syncNow();
    }, delay);
    retryDelay = Math.min(RETRY_MAX_MS, retryDelay * 2);
  }

  async function run() {
    const token = readToken();
    if (!token) {
      set({ state: "off" });
      return;
    }
    if (status.state === "unauthorized") return;
    if (!isOnline()) {
      set({ state: "offline" });
      return;
    }
    clearTimer("debounce");
    set({ state: "syncing", error: null });
    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const { batch, complete } = takeRows(store.outboxRows(), BATCH_ROWS);
        const response = await postSync(fetchImpl, token, { since: store.cursor, ...batch }, { url, timers });
        applying = true;
        try {
          store.acknowledge(batch, response.seq);
          status.received += store.mergeRemote(response).changed;
        } finally {
          applying = false;
        }
        if (typeof response.device === "string") status.device = response.device;
        if (complete && !response.more) break;
      }
      clearTimer("retry");
      retryDelay = RETRY_MIN_MS;
      set({ state: "idle", lastSynced: now(), error: null });
      // Rows graded while the request was in flight go out shortly.
      if (store.pending) schedule(DEBOUNCE_MS);
    } catch (error) {
      if (!(error instanceof SyncError)) throw error;
      if (error.kind === "unauthorized") {
        clearTimer("retry");
        clearTimer("debounce");
        set({ state: "unauthorized", error: error.message });
      } else if (error.kind === "rejected") {
        // Rows stay in the outbox for inspection; the next trigger tries again.
        log("Sync rejected by the server:", error.message);
        set({ state: "error", error: error.message });
      } else {
        set({ state: error.kind === "offline" ? "offline" : "error", error: error.message });
        scheduleRetry(error.retryAfter ? Math.min(RETRY_MAX_MS, error.retryAfter * 1000) : retryDelay);
      }
    }
  }

  function schedule(delay) {
    clearTimer("debounce");
    debounceTimer = timers.setTimeout(() => {
      debounceTimer = null;
      return api.syncNow();
    }, delay);
  }

  const api = {
    status() {
      return { ...status, pending: store.pending, connected: Boolean(readToken()) };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get connected() {
      return Boolean(readToken());
    },

    // Run a sync now, or once more after the one in progress.
    syncNow() {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        try {
          do {
            again = false;
            await run();
          } while (again && status.state === "idle");
        } finally {
          running = null;
        }
      })();
      return running;
    },

    // A local change: sync 3 seconds after the last one.
    changed() {
      if (applying || !readToken() || status.state === "unauthorized" || !store.pending) return;
      set({});
      schedule(DEBOUNCE_MS);
    },

    // Test a token with an empty request; when the server accepts it, keep it
    // and upload everything on this device (since = 0). Resolves with
    // {ok, device} or {ok: false, kind, message}.
    async connect(token) {
      const value = String(token ?? "").trim();
      if (!value) return { ok: false, kind: "rejected", message: "Paste the device token first." };
      try {
        const response = await postSync(
          fetchImpl,
          value,
          { since: TEST_CURSOR, reviews: [], pages: [], settings: [] },
          { url, timers }
        );
        if (running) await running;
        writeToken(value);
        store.queueAll();
        retryDelay = RETRY_MIN_MS;
        set({ state: "idle", device: response.device ?? null, error: null });
        await api.syncNow();
        return { ok: true, device: response.device ?? null };
      } catch (error) {
        if (!(error instanceof SyncError)) throw error;
        return { ok: false, kind: error.kind, message: error.message };
      }
    },

    // Forget the token. Local progress stays.
    disconnect() {
      writeToken(null);
      clearTimer("retry");
      clearTimer("debounce");
      set({ state: "off", device: null, error: null, lastSynced: null });
    },

    // Wire the triggers. `win` and `doc` default to the browser's.
    start({ win = globalThis.window, doc = globalThis.document } = {}) {
      store.subscribe(() => api.changed());
      win?.addEventListener?.("online", () => api.syncNow());
      win?.addEventListener?.("offline", () => {
        if (readToken() && status.state !== "unauthorized") set({ state: "offline" });
      });
      doc?.addEventListener?.("visibilitychange", () => {
        if (isVisible()) api.syncNow();
      });
      timers.setInterval?.(() => {
        if (isVisible()) api.syncNow();
      }, INTERVAL_MS);
      if (readToken()) set({ state: "idle" });
      return api.syncNow();
    },
  };
  return api;
}
