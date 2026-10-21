// Boot: load the cards and the Learn index, open (and if needed migrate)
// progress, and route.
//
// Cards come from cards.json, generated from learning/questions/ by
// scripts/build_flashcards.py, which also writes learn/index.json and one
// rendered fragment per wiki page under learn/. Progress is an append-only review log in this
// browser (js/lib/store.js); everything else is derived from it. With a device
// token, js/lib/sync.js keeps it in step with the progress server; without
// one (as on GitHub Pages) progress stays in this browser.

import { $, isTyping } from "./dom.js";
import { indexLearn } from "./lib/learn.js";
import { learnedPageGate, localDay, pagePath } from "./lib/schedule.js";
import { createStore } from "./lib/store.js";
import { createSync } from "./lib/sync.js";
import { registerServiceWorker } from "./pwa.js";
import { parseRoute, sectionOf, startRouter } from "./router.js";
import { renderLearn, renderLearnTopic } from "./views/learn.js";
import { renderCardLink, renderPractice, renderPracticeSession } from "./views/practice.js";
import { renderReader } from "./views/reader.js";
import { runSession } from "./views/review.js";
import { openSearch } from "./views/search.js";
import { renderSettings } from "./views/settings.js";
import { renderSyncStatus } from "./views/sync.js";
import { renderDaily, renderToday } from "./views/today.js";

const VIEWS = {
  today: renderToday,
  daily: renderDaily,
  learn: renderLearn,
  "learn-topic": renderLearnTopic,
  reader: renderReader,
  practice: renderPractice,
  "practice-session": renderPracticeSession,
  card: renderCardLink,
  settings: renderSettings,
};

// The active view's controller ({onKey, destroy}) when it has one.
let active = null;
let route = null;
let shownOnce = false;

// Shared with every view.
const app = {
  cards: [],
  topics: [],
  cardById: new Map(),
  // The Learn index (js/lib/learn.js indexLearn), or null when it failed to load.
  learn: null,
  store: null,
  // Sync with the progress server (js/lib/sync.js); off without a device token.
  sync: null,
  view: $("#view"),
  today: () => localDay(),
  topicName: (slug) => app.topics.find((topic) => topic.slug === slug)?.name ?? slug,
  navigate(hash) {
    if (location.hash === hash) show(parseRoute(hash));
    else location.hash = hash;
  },
  // Replace the current route without a history entry (after rendering ends).
  redirect(hash) {
    queueMicrotask(() => {
      history.replaceState(null, "", hash);
      show(parseRoute(hash));
    });
  },
  refresh: () => show(route),
  // The canBeNew(card, day) gate for the daily deck: new cards come only from
  // learned pages unless the onlyLearnedPages setting is off.
  newCardGate: () => learnedPageGate(app.store.pages(), { enabled: app.store.setting("onlyLearnedPages") }),
  // Start a session in place, such as reviewing the cards just missed.
  run(options) {
    stop();
    active = runSession(app, options);
  },
};

function stop() {
  active?.destroy?.();
  active = null;
  document.body.classList.remove("focus");
}

function show(next) {
  // A view may handle a route change itself, such as the reader moving to
  // another section of the same page.
  if (next !== route && active?.reroute?.(next)) {
    route = next;
    return;
  }
  // A refresh re-renders the same route and leaves focus to the view.
  const moved = next !== route;
  route = next;
  stop();
  for (const tab of document.querySelectorAll("[data-tab]")) {
    if (tab.dataset.tab === sectionOf(route)) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  active = VIEWS[route.name](app, route) ?? null;
  if (!document.body.classList.contains("focus")) {
    window.scrollTo(0, 0);
    // Move focus to the new view's heading after navigation, as a page load would.
    if (shownOnce && moved) app.view.querySelector("h2[tabindex]")?.focus({ preventScroll: true });
  }
  shownOnce = true;
}

function renderStorageNote() {
  const connected = app.sync?.connected && app.sync.status().state !== "unauthorized";
  $("#storage-note").textContent = !app.store.persistent
    ? "This browser is blocking storage, so progress lasts only until you close the tab" +
      (connected ? " unless it has synced." : ".")
    : connected
      ? "Progress is saved in this browser and synced to your study server."
      : "Progress is stored only in this browser.";
}

function setupEvents() {
  $("#open-search").addEventListener("click", () => openSearch(app));
  // Browsers may close a dialog on Escape before the keydown reaches us; that
  // Escape must not also leave the review.
  let dialogCancelled = false;
  document.addEventListener(
    "cancel",
    () => {
      dialogCancelled = true;
      setTimeout(() => (dialogCancelled = false));
    },
    true
  );
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    if (document.querySelector("dialog[open]") || isTyping(event.target)) return;
    if (event.key === "Escape" && dialogCancelled) return;
    if (active?.onKey?.(event)) return;
    if (event.key === "/") {
      event.preventDefault();
      openSearch(app);
    }
  });
  // Coming back to the tab, possibly on a new day: refresh Today's numbers.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && route?.name === "today") app.refresh();
  });
}

async function init() {
  let data;
  // The Learn index is optional: without it Learn shows an error and Today
  // offers no next page, but reviewing still works.
  const learnIndex = loadJson("learn/index.json").catch((error) => {
    console.error(error);
    return null;
  });
  try {
    data = await loadJson("cards.json");
  } catch (error) {
    app.view.innerHTML =
      "<p class='message'>Could not load <code>cards.json</code>. Build the site with " +
      "<code>python3 scripts/build_flashcards.py</code> and serve <code>_site/</code> over HTTP.</p>";
    console.error(error);
    return;
  }

  app.cards = data.cards;
  app.topics = data.topics;
  app.cardById = new Map(app.cards.map((card) => [card.id, card]));
  const learnData = await learnIndex;
  app.learn = learnData ? indexLearn(learnData) : null;
  // Pages of cards carried over from the old flashcards count as learned.
  app.store = createStore({ pageOf: (id) => pagePath(app.cardById.get(id)) });
  $("#repo-link").href = data.repository;
  $("#generated").textContent = ` (updated ${new Date(data.generated).toLocaleDateString()})`;
  app.sync = createSync({ store: app.store });
  renderStorageNote();
  app.store.subscribe(renderStorageNote);
  app.sync.subscribe(renderStorageNote);
  renderSyncStatus(app);
  // Rows pulled from another device change what the overview pages show.
  // Running reviews and the reader are left alone.
  let received = 0;
  app.sync.subscribe((status) => {
    if (status.received === received) return;
    received = status.received;
    if (!["today", "learn", "learn-topic", "practice"].includes(route?.name)) return;
    const y = window.scrollY;
    app.refresh();
    window.scrollTo(0, y);
  });

  setupEvents();
  startRouter(show);
  app.sync.start();
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

registerServiceWorker();
init();
