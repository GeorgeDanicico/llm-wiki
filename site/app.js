"use strict";

// Flashcards generated from learning/questions/. Cards come from cards.json;
// progress is a simple Leitner box per card ID, kept in this browser only.

const STORAGE_KEY = "llm-wiki-flashcards:v1";
const MAX_BOX = 5;
const MASTERED_BOX = 3;

const state = {
  cards: [],
  topics: [],
  selected: new Set(),
  order: "shuffle",
  progress: {},
  queue: [],
  // queue.length means the session summary is showing.
  position: 0,
  revealed: false,
  // Card ID -> "knew" | "missed" for this session; regrading replaces the verdict.
  results: new Map(),
  // Card ID -> progress entry from before this session, so regrading a card
  // within one session counts once.
  before: new Map(),
};

const $ = (selector) => document.querySelector(selector);

// --- Persistence (best effort: private windows may block storage) ----------

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ progress: state.progress, topics: [...state.selected], order: state.order })
    );
  } catch {
    // Progress simply won't persist.
  }
}

// --- Session ----------------------------------------------------------------

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function boxOf(card) {
  return state.progress[card.id]?.box ?? 0;
}

function startSession(cards) {
  let queue = shuffle(cards ?? state.cards.filter((card) => state.selected.has(card.topic)));
  if (!cards && state.order === "weakest") {
    // Lowest box first; within a box, the least recently reviewed first.
    const last = (card) => state.progress[card.id]?.last ?? "";
    queue = queue.sort((a, b) => boxOf(a) - boxOf(b) || last(a).localeCompare(last(b)));
  }
  state.queue = queue;
  state.results = new Map();
  state.before = new Map();
  goTo(0);
}

function goTo(position) {
  state.position = Math.max(0, Math.min(position, state.queue.length));
  render();
}

function grade(knew) {
  const card = state.queue[state.position];
  if (!card || !state.revealed) return;
  if (!state.before.has(card.id)) state.before.set(card.id, state.progress[card.id] ?? null);
  const before = state.before.get(card.id);
  state.progress[card.id] = {
    box: knew ? Math.min(MAX_BOX, (before?.box ?? 0) + 1) : 0,
    reviews: (before?.reviews ?? 0) + 1,
    last: new Date().toISOString(),
  };
  state.results.set(card.id, knew ? "knew" : "missed");
  save();
  goTo(state.position + 1);
}

function reveal() {
  if (state.revealed || !state.queue[state.position]) return;
  state.revealed = true;
  $("#stage .answer").hidden = false;
  $("#stage .grade").hidden = false;
  $("#stage .reveal").remove();
  // Focus the card, not a grade button, so a second Space can't grade by accident.
  $("#stage .card").focus({ preventScroll: true });
}

function countResults() {
  let knew = 0;
  for (const verdict of state.results.values()) if (verdict === "knew") knew += 1;
  return { knew, missed: state.results.size - knew, ungraded: state.queue.length - state.results.size };
}

// --- Rendering --------------------------------------------------------------

function render() {
  state.revealed = false;
  renderStats();
  renderNavigation();
  const card = state.queue[state.position];
  const stage = $("#stage");
  stage.replaceChildren(card ? cardView(card) : summaryView());
  if (card) history.replaceState(null, "", `#${card.id}`);
  if (!$("#browser").open) stage.querySelector(".reveal, .primary")?.focus({ preventScroll: true });
}

function topicName(slug) {
  return state.topics.find((topic) => topic.slug === slug)?.name ?? slug;
}

function cardView(card) {
  const view = $("#card-template").content.cloneNode(true);
  view.querySelector(".topic").textContent = topicName(card.topic);
  view.querySelector(".card-id").textContent = card.id;
  const box = boxOf(card);
  view.querySelector(".box").innerHTML =
    "<span class='on'>" + "●".repeat(box) + "</span>" + "○".repeat(MAX_BOX - box);
  const verdict = state.results.get(card.id);
  if (verdict) {
    const badge = view.querySelector(".verdict");
    badge.hidden = false;
    badge.className = `verdict ${verdict}`;
    badge.textContent = verdict === "knew" ? "✓ Knew it" : "✗ Missed it";
    view.querySelector(`.grade .${verdict}`).classList.add("chosen");
  }
  // Question and point HTML is escaped at build time (scripts/build_flashcards.py).
  view.querySelector(".question").innerHTML = card.question;
  const points = view.querySelector(".points");
  for (const point of card.points) {
    const item = document.createElement("li");
    item.innerHTML = point;
    points.append(item);
  }
  const source = view.querySelector(".source");
  source.href = card.source.url;
  source.textContent = `Read on the wiki: ${card.source.title} ↗`;
  view.querySelector(".reveal").addEventListener("click", reveal);
  view.querySelector(".missed").addEventListener("click", () => grade(false));
  view.querySelector(".knew").addEventListener("click", () => grade(true));
  return view;
}

function summaryView() {
  const view = document.createElement("div");
  view.className = "summary";
  const { knew, missed, ungraded } = countResults();

  const title = document.createElement("h2");
  const text = document.createElement("p");
  const actions = document.createElement("div");
  actions.className = "actions";

  if (state.selected.size === 0 && state.queue.length === 0) {
    title.textContent = "No topics selected";
    text.textContent = "Pick at least one topic above to start.";
  } else if (state.queue.length === 0) {
    title.textContent = "No cards";
    text.textContent = "The selected topics have no cards yet.";
  } else {
    const graded = knew + missed;
    title.textContent = ungraded ? "End of session" : "Session complete";
    text.textContent =
      `You knew ${knew} of ${graded} graded card${graded === 1 ? "" : "s"}` +
      (ungraded ? `; ${ungraded} not graded yet.` : ".");
    if (ungraded) {
      const first = state.queue.findIndex((card) => !state.results.has(card.id));
      actions.append(button("Go to first ungraded", "primary", () => goTo(first)));
    }
    if (missed) {
      const missedCards = state.queue.filter((card) => state.results.get(card.id) === "missed");
      actions.append(button(`Review ${missed} missed`, ungraded ? "secondary" : "primary", () => startSession(missedCards)));
    }
    actions.append(button("New session", ungraded || missed ? "secondary" : "primary", () => startSession()));
  }
  view.append(title, text, actions);
  return view;
}

function button(label, className, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

function renderStats() {
  const mastered = state.cards.filter((card) => boxOf(card) >= MASTERED_BOX).length;
  const seen = state.cards.filter((card) => state.progress[card.id]).length;
  $("#stats").textContent =
    `${state.cards.length} cards · ${seen} reviewed · ${mastered} known ${MASTERED_BOX}+ times in a row`;
}

function renderNavigation() {
  const total = state.queue.length;
  const { ungraded } = countResults();
  $("#progress-fill").style.width = total ? `${((total - ungraded) / total) * 100}%` : "0";
  $("#position-text").textContent = !total
    ? "No cards"
    : state.position < total
      ? `Card ${state.position + 1} of ${total}`
      : `Summary · ${total - ungraded} of ${total} graded`;
  $("#prev").disabled = state.position === 0;
  $("#next").disabled = state.position >= total;
  $("#open-list").disabled = !total;
}

function renderControls() {
  const chips = $("#topics");
  chips.replaceChildren(
    ...state.topics.map((topic) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.setAttribute("aria-pressed", String(state.selected.has(topic.slug)));
      chip.innerHTML = `<span></span><span class="count">${topic.count}</span>`;
      chip.firstChild.textContent = topic.name;
      chip.addEventListener("click", () => {
        if (state.selected.has(topic.slug)) state.selected.delete(topic.slug);
        else state.selected.add(topic.slug);
        chip.setAttribute("aria-pressed", String(state.selected.has(topic.slug)));
        save();
        startSession();
      });
      return chip;
    })
  );
  for (const option of document.querySelectorAll("[data-order]")) {
    option.setAttribute("aria-checked", String(option.dataset.order === state.order));
  }
}

// --- Browse dialog ------------------------------------------------------------

function plainText(html) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent;
}

function openList() {
  if (!state.queue.length) return;
  $("#search").value = "";
  renderList();
  $("#browser").showModal();
  $("#card-list [aria-current]")?.scrollIntoView({ block: "center" });
  $("#search").focus();
}

function renderList() {
  const filter = $("#search").value.trim().toLowerCase();
  const items = [];
  state.queue.forEach((card, index) => {
    const question = plainText(card.question);
    const topic = topicName(card.topic);
    if (filter && !`${card.id} ${topic} ${question}`.toLowerCase().includes(filter)) return;

    const verdict = state.results.get(card.id);
    const item = document.createElement("li");
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "entry";
    if (index === state.position) entry.setAttribute("aria-current", "true");
    entry.innerHTML =
      "<span class='number'></span><span class='status'></span>" +
      "<span class='entry-body'><span class='entry-meta'></span><span class='entry-question'></span></span>";
    entry.querySelector(".number").textContent = index + 1;
    const status = entry.querySelector(".status");
    status.className = `status ${verdict ?? "ungraded"}`;
    status.textContent = verdict === "knew" ? "✓" : verdict === "missed" ? "✗" : "";
    status.title = verdict === "knew" ? "Knew it" : verdict === "missed" ? "Missed it" : "Not graded yet";
    entry.querySelector(".entry-meta").textContent = `${topic} · ${card.id}`;
    entry.querySelector(".entry-question").textContent = question;
    entry.addEventListener("click", () => {
      $("#browser").close();
      goTo(index);
    });
    item.append(entry);
    items.push(item);
  });
  $("#card-list").replaceChildren(...items);

  const { knew, missed, ungraded } = countResults();
  const shown = filter ? `${items.length} of ${state.queue.length} shown · ` : "";
  $("#list-summary").textContent = `${shown}${knew} knew · ${missed} missed · ${ungraded} not graded`;
}

// --- Events -----------------------------------------------------------------

function setupEvents() {
  for (const option of document.querySelectorAll("[data-order]")) {
    option.addEventListener("click", () => {
      state.order = option.dataset.order;
      renderControls();
      save();
      startSession();
    });
  }
  $("#restart").addEventListener("click", () => startSession());
  $("#reset").addEventListener("click", () => {
    if (!confirm("Forget all flashcard progress stored in this browser?")) return;
    state.progress = {};
    save();
    startSession();
  });
  $("#prev").addEventListener("click", () => goTo(state.position - 1));
  $("#next").addEventListener("click", () => goTo(state.position + 1));
  $("#open-list").addEventListener("click", openList);
  $("#close-list").addEventListener("click", () => $("#browser").close());
  $("#search").addEventListener("input", () => {
    renderList();
    $("#card-list").scrollTop = 0;
  });
  $("#search").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    $("#card-list .entry")?.click();
  });
  // Close when the backdrop (outside the dialog box) is clicked.
  $("#browser").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });

  window.addEventListener("hashchange", () => {
    const index = state.queue.findIndex((card) => `#${card.id}` === location.hash);
    if (index >= 0 && index !== state.position) goTo(index);
  });

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || $("#browser").open) return;
    const onControl = event.target.closest?.("button, a, input, select, textarea");
    if ((event.key === " " || event.key === "Enter") && !state.revealed) {
      // Let focused controls (topic chips, links) keep their native behavior.
      if (onControl && !onControl.matches(".reveal")) return;
      event.preventDefault();
      reveal();
    } else if (event.key === "1" || event.key === "j") {
      grade(false);
    } else if (event.key === "2" || event.key === "k") {
      grade(true);
    } else if (event.key === "ArrowLeft") {
      goTo(state.position - 1);
    } else if (event.key === "ArrowRight") {
      goTo(state.position + 1);
    } else if (event.key === "/") {
      event.preventDefault();
      openList();
    }
  });
}

// --- Start ------------------------------------------------------------------

async function init() {
  let data;
  try {
    const response = await fetch("cards.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    $("#stage").innerHTML =
      "<p class='message'>Could not load <code>cards.json</code>. Build the site with " +
      "<code>python3 scripts/build_flashcards.py</code> and serve <code>_site/</code> over HTTP.</p>";
    console.error(error);
    return;
  }

  state.cards = data.cards;
  state.topics = data.topics;
  $("#repo-link").href = data.repository;
  $("#generated").textContent = ` (updated ${new Date(data.generated).toLocaleDateString()})`;

  const saved = load();
  state.progress = saved.progress ?? {};
  state.order = saved.order === "weakest" ? "weakest" : "shuffle";
  const known = new Set(state.topics.map((topic) => topic.slug));
  const remembered = (saved.topics ?? []).filter((slug) => known.has(slug));
  state.selected = new Set(remembered.length ? remembered : known);

  // A link such as #DATA-OL-004 opens that card, selecting its topic if needed.
  const linked = state.cards.find((card) => `#${card.id}` === location.hash);
  if (linked) state.selected.add(linked.topic);

  setupEvents();
  renderControls();
  startSession();
  if (linked) goTo(state.queue.indexOf(linked));
}

init();
