// Practice: free review by topic. Practice reviews are written with
// mode "practice" and never change a card's box or due date.

import { el, plural } from "../dom.js";
import { shuffle } from "../lib/random.js";
import { MASTERED_BOX, cardStates } from "../lib/schedule.js";
import { runSession } from "./review.js";

// Card count, due count, and mastery for each topic.
export function topicStats(app, states, today) {
  return app.topics.map((topic) => {
    const cards = app.cards.filter((card) => card.topic === topic.slug);
    return {
      ...topic,
      cards: cards.length,
      due: cards.filter((card) => states.get(card.id)?.due <= today).length,
      mastered: cards.filter((card) => (states.get(card.id)?.box ?? 0) >= MASTERED_BOX).length,
    };
  });
}

export function masteryBar(mastered, total) {
  const fill = el("span", { class: "bar-fill" });
  // Set through the CSSOM rather than a style attribute (no inline styles).
  fill.style.width = `${total ? Math.round((mastered / total) * 100) : 0}%`;
  return el(
    "span",
    { class: "mastery" },
    el("span", { class: "bar", "aria-hidden": "true" }, fill),
    el("span", { class: "mastery-text", text: `${mastered}/${total} mastered` })
  );
}

export function topicList(stats) {
  return el(
    "ul",
    { class: "topic-list" },
    stats.map((topic) =>
      el(
        "li",
        {},
        el(
          "a",
          { class: "topic-row", href: `#/practice/${encodeURIComponent(topic.slug)}` },
          el(
            "span",
            { class: "topic-text" },
            el("span", { class: "topic-name", text: topic.name }),
            el("span", { class: "topic-meta", text: `${plural(topic.cards, "card")} · ${topic.due} due` })
          ),
          masteryBar(topic.mastered, topic.cards)
        )
      )
    )
  );
}

// Topics chosen for mixed practice; every topic unless the user narrowed it.
export function selectedTopics(app) {
  const known = new Set(app.topics.map((topic) => topic.slug));
  const saved = app.store.setting("practiceTopics");
  if (!Array.isArray(saved)) return known;
  const remembered = saved.filter((slug) => known.has(slug));
  // An empty choice is kept; a choice of only removed topics falls back to all.
  return remembered.length || !saved.length ? new Set(remembered) : known;
}

// Shuffle, or lowest box first (least recently reviewed first within a box).
function ordered(app, cards) {
  const queue = shuffle(cards);
  if (app.store.setting("practiceOrder") !== "weakest") return queue;
  const states = cardStates(app.store.reviews());
  const box = (card) => states.get(card.id)?.box ?? 0;
  const last = (card) => states.get(card.id)?.last ?? "";
  return queue.sort((a, b) => box(a) - box(b) || last(a).localeCompare(last(b)));
}

export function startPractice(app, cards, title, exitHash) {
  app.run({ cards, mode: "practice", title, exitHash });
}

// Extra practice to reach the daily goal: the weakest cards not reviewed today.
export function startExtraPractice(app, count, exitHash = "#/today") {
  const today = app.today();
  const reviewedToday = new Set(app.store.reviews().filter((row) => row.day === today).map((row) => row.card));
  const states = cardStates(app.store.reviews());
  const candidates = shuffle(app.cards.filter((card) => !reviewedToday.has(card.id)));
  const pool = candidates.length ? candidates : shuffle(app.cards);
  pool.sort((a, b) => (states.get(a.id)?.box ?? 0) - (states.get(b.id)?.box ?? 0));
  startPractice(app, pool.slice(0, count), "Extra practice", exitHash);
}

export function renderPractice(app) {
  const today = app.today();
  const states = cardStates(app.store.reviews());
  const selected = selectedTopics(app);
  const count = app.cards.filter((card) => selected.has(card.topic)).length;
  const order = app.store.setting("practiceOrder");

  const chips = el(
    "div",
    { class: "chips", role: "group", "aria-labelledby": "topics-label" },
    topicStats(app, states, today).map((topic) =>
      el(
        "button",
        {
          type: "button",
          class: "chip",
          "aria-pressed": String(selected.has(topic.slug)),
          "data-slug": topic.slug,
          onclick: () => {
            if (selected.has(topic.slug)) selected.delete(topic.slug);
            else selected.add(topic.slug);
            app.store.setSetting("practiceTopics", [...selected]);
            app.refresh();
            app.view.querySelector(`[data-slug="${topic.slug}"]`)?.focus();
          },
        },
        el("span", { text: topic.name }),
        el("span", { class: "count", text: topic.cards })
      )
    )
  );
  const orderControl = el(
    "div",
    { class: "segmented", role: "radiogroup", "aria-labelledby": "order-label" },
    [
      ["shuffle", "Shuffle"],
      ["weakest", "Weakest first"],
    ].map(([value, label]) =>
      el(
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": String(order === value),
          "data-order": value,
          onclick: () => {
            app.store.setSetting("practiceOrder", value);
            app.refresh();
            app.view.querySelector(`[data-order="${value}"]`)?.focus();
          },
        },
        label
      )
    )
  );
  const allTopics = selected.size === app.topics.length;
  const start = count
    ? el("a", { class: "primary", href: "#/practice/all" }, `Practice ${plural(count, "card")}`)
    : el("p", { class: "hint", text: "Pick at least one topic to start." });

  app.view.replaceChildren(
    el(
      "section",
      { class: "panel", "aria-labelledby": "practice-title" },
      el("h2", { id: "practice-title", tabindex: "-1", text: "Practice" }),
      el("p", { class: "lead", text: "Review freely. Practice counts toward your daily goal but never changes when cards are next due." }),
      el(
        "div",
        { class: "controls" },
        el(
          "div",
          { class: "control-row" },
          el("span", { class: "label", id: "topics-label", text: allTopics ? "All topics" : "Topics" }),
          chips
        ),
        el("div", { class: "control-row" }, el("span", { class: "label", id: "order-label", text: "Order" }), orderControl)
      ),
      el("div", { class: "actions" }, start)
    ),
    el(
      "section",
      { class: "panel", "aria-labelledby": "topic-list-title" },
      el("h2", { id: "topic-list-title", text: "Topics" }),
      topicList(topicStats(app, states, today))
    )
  );
}

export function renderPracticeSession(app, route) {
  let cards;
  let title;
  if (route.topic === "all") {
    const selected = selectedTopics(app);
    cards = app.cards.filter((card) => selected.has(card.topic));
    title = selected.size === app.topics.length ? "All topics" : [...selected].map(app.topicName).join(", ");
  } else {
    const topic = app.topics.find((topic) => topic.slug === route.topic);
    if (!topic) {
      app.redirect("#/practice");
      return null;
    }
    cards = app.cards.filter((card) => card.topic === topic.slug);
    title = topic.name;
  }
  return runSession(app, {
    cards: ordered(app, cards),
    mode: "practice",
    title,
    exitHash: "#/practice",
    actions: () => [
      { label: "New session", run: () => app.refresh() },
      { label: "Back to practice", run: () => app.navigate("#/practice") },
    ],
  });
}

// Old links such as #REL-CA-002 open that card in a one-card practice session.
export function renderCardLink(app, route) {
  const card = app.cardById.get(route.id);
  if (!card) {
    app.redirect("#/practice");
    return null;
  }
  return runSession(app, {
    cards: [card],
    mode: "practice",
    title: `${app.topicName(card.topic)} · ${card.id}`,
    exitHash: "#/practice",
    actions: () => [
      { label: `Practice ${app.topicName(card.topic)}`, run: () => app.navigate(`#/practice/${encodeURIComponent(card.topic)}`) },
      { label: "Today", run: () => app.navigate("#/today") },
    ],
  });
}
