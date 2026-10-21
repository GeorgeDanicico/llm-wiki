// Service worker registration and the "Update available · Reload" prompt.
//
// sw.js precaches the app, so it works offline once loaded. Each deploy gives
// sw.js a new build version; the new worker installs in the background and
// waits, and the header offers a reload that switches to it.

import { $ } from "./dom.js";

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const prompt = $("#update-button");
  let reloading = false;
  let registration = null;

  const offer = () => {
    prompt.hidden = false;
  };

  prompt.addEventListener("click", () => {
    const waiting = registration?.waiting;
    reloading = true;
    if (waiting) waiting.postMessage({ type: "skip-waiting" });
    else location.reload();
  });

  // Fires when the waiting worker takes over; the first install also claims
  // the page, which must not reload it.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) location.reload();
  });

  navigator.serviceWorker
    .register("sw.js")
    .then((reg) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) offer();
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          // An installed worker with an existing controller is an update.
          if (worker.state === "installed" && navigator.serviceWorker.controller) offer();
        });
      });
      // Look for a new deploy whenever the app comes back to the foreground.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    })
    .catch((error) => console.warn("Service worker registration failed:", error));
}
