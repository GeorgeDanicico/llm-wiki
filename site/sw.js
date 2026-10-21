// Service worker: the app works offline after the first visit.
//
//   - Install precaches every built file: the app shell (index.html, CSS, JS
//     modules, icons, manifest) and the data (cards.json, learn/**).
//   - The shell is served cache-first, so a page always runs one consistent
//     version. A new deploy changes BUILD.version, which installs a new worker;
//     the page then shows "Update available · Reload".
//   - cards.json and learn/** are network-first, falling back to the cache
//     when offline, so new questions and pages show up without an update.
//   - api/** is never cached or intercepted.
//
// Every path is relative to the worker's scope, so the same file works at the
// root of the VPS site and under /llm-wiki/ on GitHub Pages.

const BUILD = { version: "dev", files: [] }; // Filled in by scripts/build_flashcards.py.

const PREFIX = "llm-wiki-study-";
const CACHE = PREFIX + BUILD.version;
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL("./", SCOPE).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // "reload" skips the HTTP cache, so the precache matches this deploy.
      cache.addAll(BUILD.files.map((path) => new Request(new URL(path, SCOPE).href, { cache: "reload" })))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

// The page asks a waiting worker to take over when the user chooses Reload.
self.addEventListener("message", (event) => {
  if (event.data?.type === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const path = url.pathname.slice(SCOPE.pathname.length);
  if (path.startsWith("api/")) return;
  if (path === "cards.json" || path.startsWith("learn/")) {
    event.respondWith(networkFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(cacheFirst(INDEX, request));
  } else {
    event.respondWith(cacheFirst(request, request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  let response = null;
  try {
    response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
    if (response.status < 500) return response;
  } catch {
    // Offline: fall through to the cached copy.
  }
  return (await cache.match(request, { ignoreSearch: true })) ?? response ?? Response.error();
}

async function cacheFirst(key, request) {
  const cached = await caches.match(key, { cacheName: CACHE });
  return cached ?? fetch(request);
}
