// Today: the daily deck, streak and progress tiles, activity grid, and topics.

import { button, el, plural } from "../dom.js";
import {
  ACTIVITY_WEEKS,
  SECONDS_PER_CARD,
  activity,
  addDays,
  buildDeck,
  cardStates,
  dayCounts,
  deckProgress,
  mastery,
  metDays,
  streak,
} from "../lib/schedule.js";
import { startExtraPractice, startPractice, topicList, topicStats } from "./practice.js";
import { runSession } from "./review.js";

function todayDeck(app) {
  const today = app.today();
  const reviews = app.store.reviews();
  const settings = app.store.settings();
  const deck = buildDeck({ cards: app.cards, reviews, today, settings });
  return { today, reviews, settings, deck, done: deckProgress(deck.cards, reviews, today) };
}

export function renderToday(app) {
  const { today, reviews, settings, deck, done } = todayDeck(app);
  const counts = dayCounts(reviews);
  const streakInfo = streak(metDays({ cards: app.cards, reviews, today, settings }), today);
  const states = cardStates(reviews);
  const toGoal = Math.max(0, settings.dailyGoal - (counts.get(today) ?? 0));

  const notice = app.store.migrated
    ? el("p", { class: "notice", role: "status", text: "Your earlier flashcard progress was carried over to the new study site." })
    : "";
  app.view.replaceChildren(
    notice,
    hero(app, { today, deck, done, streakInfo, toGoal }),
    tiles(app, { today, states, streakInfo }),
    activityPanel(counts, today),
    el(
      "section",
      { class: "panel", "aria-labelledby": "topics-title" },
      el(
        "div",
        { class: "panel-head" },
        el("h2", { id: "topics-title", text: "Topics" }),
        el("a", { class: "panel-link", href: "#/practice" }, "Practice")
      ),
      topicList(topicStats(app, states, today))
    )
  );
}

function hero(app, { today, deck, done, streakInfo, toGoal }) {
  const date = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const remaining = deck.cards.filter((card) => !done.has(card.id));
  const dueIds = new Set(deck.cards.slice(0, deck.due).map((card) => card.id));
  const actions = el("div", { class: "actions" });
  let title;
  let text;

  if (remaining.length) {
    const minutes = Math.max(1, Math.round((remaining.length * SECONDS_PER_CARD) / 60));
    const due = remaining.filter((card) => dueIds.has(card.id)).length;
    title = `${plural(remaining.length, "card")}, about ${plural(minutes, "minute")}`;
    text = `${due} due · ${remaining.length - due} new` + (done.size ? ` · ${done.size} of ${deck.cards.length} done` : "");
    actions.append(el("a", { class: "primary", href: "#/today/review" }, done.size ? "Continue review" : "Start review"));
  } else if (deck.cards.length) {
    const missed = deck.cards.filter((card) => !done.get(card.id).knew);
    title = "Today's review is done";
    text = `You knew ${deck.cards.length - missed.length} of ${plural(deck.cards.length, "card")}.`;
    if (missed.length) {
      actions.append(
        button(`Review ${missed.length} missed`, "secondary", () => startPractice(app, missed, "Missed cards", "#/today"))
      );
    }
  } else {
    title = "Nothing due today";
    text = "Every card you have started is scheduled for later, and there are no new cards.";
  }

  if (!remaining.length && !streakInfo.todayMet && toGoal) {
    actions.prepend(
      button(`Practice ${toGoal} more to keep your streak`, "primary", () => startExtraPractice(app, toGoal))
    );
  } else if (!remaining.length) {
    text += " Today counts toward your streak.";
  }

  return el(
    "section",
    { class: "hero", "aria-labelledby": "hero-title" },
    el("p", { class: "eyebrow", text: `Today · ${date}` }),
    el("h2", { id: "hero-title", tabindex: "-1", text: title }),
    el("p", { class: "lead", text }),
    actions.childElementCount ? actions : null
  );
}

function tiles(app, { today, states, streakInfo }) {
  const tomorrow = addDays(today, 1);
  const dueTomorrow = app.cards.filter((card) => states.get(card.id)?.due <= tomorrow).length;
  const { mastered, total } = mastery(app.cards, states);
  const tile = (label, value, note, className = "") =>
    el(
      "div",
      { class: `tile ${className}` },
      el("p", { class: "tile-label", text: label }),
      el("p", { class: "tile-value", text: value }),
      el("p", { class: "tile-note", text: note })
    );
  return el(
    "section",
    { class: "tiles", "aria-label": "Progress" },
    tile(
      "Streak",
      plural(streakInfo.current, "day"),
      streakInfo.atRisk ? `At risk today · best ${streakInfo.best}` : `Best ${plural(streakInfo.best, "day")}`,
      streakInfo.atRisk ? "at-risk" : ""
    ),
    tile("Mastered", `${mastered} / ${total}`, "cards in box 3 or higher"),
    tile("Due tomorrow", String(dueTomorrow), plural(dueTomorrow, "card") + " by then")
  );
}

// Heat level for a day's review count.
const level = (count) => (count === 0 ? 0 : count < 5 ? 1 : count < 10 ? 2 : count < 20 ? 3 : 4);

function activityPanel(counts, today) {
  const days = activity(counts, today);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const label = `${plural(total, "review")} in the last ${ACTIVITY_WEEKS} weeks`;
  return el(
    "section",
    { class: "panel", "aria-labelledby": "activity-title" },
    el(
      "div",
      { class: "panel-head" },
      el("h2", { id: "activity-title", text: "Activity" }),
      el("p", { class: "panel-note", text: label })
    ),
    el(
      "div",
      { class: "heatmap", role: "img", "aria-label": label },
      days.map((day) =>
        el("span", { class: `cell l${level(day.count)}`, title: `${day.day}: ${plural(day.count, "review")}` })
      )
    ),
    el(
      "p",
      { class: "legend", "aria-hidden": "true" },
      "Less ",
      [0, 1, 2, 3, 4].map((value) => el("span", { class: `cell l${value}` })),
      " More"
    )
  );
}

// #/today/review: run today's deck, resuming after the cards already graded.
export function renderDaily(app) {
  const { deck, done } = todayDeck(app);
  if (!deck.cards.length) {
    app.redirect("#/today");
    return null;
  }
  return runSession(app, {
    cards: deck.cards,
    mode: "daily",
    title: "Today's review",
    exitHash: "#/today",
    previous: done,
    actions: () => [{ label: "Back to Today", run: () => app.navigate("#/today") }],
  });
}
