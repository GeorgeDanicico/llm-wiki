// Boot: load the cards, open (and if needed migrate) progress, and route.
//
// Cards come from cards.json, generated from learning/questions/ by
// scripts/build_flashcards.py. Progress is an append-only review log in this
// browser (js/lib/store.js); everything else is derived from it.

import { $, isTyping } from "./dom.js";
import { localDay } from "./lib/schedule.js";
import { createStore } from "./lib/store.js";
import { parseRoute, sectionOf, startRouter } from "./router.js";
import { renderCardLink, renderPractice, renderPracticeSession } from "./views/practice.js";
import { runSession } from "./views/review.js";
import { openSearch } from "./views/search.js";
import { renderSettings } from "./views/settings.js";
import { renderDaily, renderToday } from "./views/today.js";

const VIEWS = {
  today: renderToday,
  daily: renderDaily,
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
  store: null,
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
  $("#storage-note").textContent = app.store.persistent
    ? "Progress is stored only in this browser."
    : "This browser is blocking storage, so progress lasts only until you close the tab.";
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
  try {
    const response = await fetch("cards.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
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
  app.store = createStore();
  $("#repo-link").href = data.repository;
  $("#generated").textContent = ` (updated ${new Date(data.generated).toLocaleDateString()})`;
  renderStorageNote();
  app.store.subscribe(renderStorageNote);

  setupEvents();
  startRouter(show);
}

init();
