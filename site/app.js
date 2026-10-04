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
  position: 0,
  revealed: false,
  results: { knew: [], missed: [] },
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
  state.position = 0;
  state.results = { knew: [], missed: [] };
  render();
}

function grade(knew) {
  const card = state.queue[state.position];
  if (!card || !state.revealed) return;
  const box = knew ? Math.min(MAX_BOX, boxOf(card) + 1) : 0;
  const reviews = (state.progress[card.id]?.reviews ?? 0) + 1;
  state.progress[card.id] = { box, reviews, last: new Date().toISOString() };
  state.results[knew ? "knew" : "missed"].push(card);
  state.position += 1;
  save();
  render();
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

// --- Rendering --------------------------------------------------------------

function render() {
  state.revealed = false;
  renderStats();
  renderProgress();
  const card = state.queue[state.position];
  const stage = $("#stage");
  stage.replaceChildren(card ? cardView(card) : summaryView());
  stage.querySelector(".reveal, .primary")?.focus({ preventScroll: true });
}

function cardView(card) {
  const view = $("#card-template").content.cloneNode(true);
  const topic = state.topics.find((t) => t.slug === card.topic);
  view.querySelector(".topic").textContent = topic?.name ?? card.topic;
  view.querySelector(".card-id").textContent = card.id;
  const box = boxOf(card);
  view.querySelector(".box").innerHTML =
    "<span class='on'>" + "●".repeat(box) + "</span>" + "○".repeat(MAX_BOX - box);
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
  const { knew, missed } = state.results;
  const total = knew.length + missed.length;

  const title = document.createElement("h2");
  const text = document.createElement("p");
  const actions = document.createElement("div");
  actions.className = "actions";

  if (state.selected.size === 0) {
    title.textContent = "No topics selected";
    text.textContent = "Pick at least one topic above to start.";
  } else if (total === 0) {
    title.textContent = "No cards";
    text.textContent = "The selected topics have no cards yet.";
  } else {
    title.textContent = "Session complete";
    text.textContent = `You knew ${knew.length} of ${total} card${total === 1 ? "" : "s"}.`;
    if (missed.length) {
      actions.append(button(`Review ${missed.length} missed`, "primary", () => startSession(missed)));
    }
    actions.append(button("New session", missed.length ? "secondary" : "primary", () => startSession()));
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

function renderProgress() {
  const total = state.queue.length;
  const done = Math.min(state.position, total);
  $("#progress-fill").style.width = total ? `${(done / total) * 100}%` : "0";
  $("#progress-text").textContent = total
    ? done < total ? `Card ${done + 1} of ${total}` : `${total} of ${total} done`
    : "";
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

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const onControl = event.target.closest?.("button, a, input, select, textarea");
    if ((event.key === " " || event.key === "Enter") && !state.revealed) {
      // Let focused controls (topic chips, links) keep their native behavior.
      if (onControl && !onControl.matches(".reveal")) return;
      event.preventDefault();
      reveal();
    } else if (["1", "j", "ArrowLeft"].includes(event.key)) {
      grade(false);
    } else if (["2", "k", "ArrowRight"].includes(event.key)) {
      grade(true);
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

  setupEvents();
  renderControls();
  startSession();
}

init();
