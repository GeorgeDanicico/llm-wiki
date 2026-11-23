// Retires the full study app's service worker on GitHub Pages.
//
// The public site has no service worker. Browsers that installed the full
// app's worker (site/sw.js) at this address keep serving its cached app until
// the worker is replaced, so this file takes its place: when the browser checks
// for an update it installs this worker, which deletes the app's caches,
// unregisters itself, and reloads open pages from the network.
//
// Keep this file published; removing it would strand browsers that have not
// visited since the switch.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("llm-wiki-study-")) await caches.delete(name);
      }
      await self.clients.claim();
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) {
        client.navigate(client.url).catch(() => {});
      }
    })()
  );
});
