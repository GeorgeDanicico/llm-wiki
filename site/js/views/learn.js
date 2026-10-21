// Learn: topics with pages learned and mastery, and each topic's pages in wiki
// index order. Pages open in the reader (js/views/reader.js).

import { el, plural } from "../dom.js";
import { isLearned, nextToLearn, pageHash } from "../lib/learn.js";
import { MASTERED_BOX, cardStates } from "../lib/schedule.js";
import { masteryBar } from "./practice.js";

export function unavailable(app) {
  app.view.replaceChildren(
    el(
      "section",
      { class: "panel", "aria-labelledby": "learn-title" },
      el("h2", { id: "learn-title", tabindex: "-1", text: "Learn" }),
      el(
        "p",
        { class: "lead" },
        "Could not load ",
        el("code", { text: "learn/index.json" }),
        ". Build the site with ",
        el("code", { text: "python3 scripts/build_flashcards.py" }),
        " and reload."
      )
    )
  );
  return null;
}

// Questions, mastered questions, and learned pages for a list of pages.
function pageStats(app, pages, states) {
  const questions = pages.flatMap((page) => page.questions);
  return {
    pages: pages.length,
    learned: pages.filter((page) => isLearned(app.store, page)).length,
    questions: questions.length,
    mastered: questions.filter((id) => (states.get(id)?.box ?? 0) >= MASTERED_BOX).length,
  };
}

function masteryOrNone(stats) {
  return stats.questions
    ? masteryBar(stats.mastered, stats.questions)
    : el("span", { class: "mastery-text", text: "No questions yet" });
}

export function renderLearn(app) {
  if (!app.learn) return unavailable(app);
  const states = cardStates(app.store.reviews());
  const next = nextToLearn(app.learn, app.store);
  const all = pageStats(app, app.learn.pages, states);

  const hero = el(
    "section",
    { class: "hero", "aria-labelledby": "learn-title" },
    el("p", { class: "eyebrow", text: "Learn" }),
    el("h2", { id: "learn-title", tabindex: "-1", text: next ? `Up next: ${next.title}` : "Every page with questions is learned" }),
    el("p", {
      class: "lead",
      text: next
        ? `${next.topicName} · ${next.minutes} min read · ${plural(next.questions.length, "question")}. ` +
          "Read a page, check yourself on its questions, then mark it as learned so its questions join your daily review."
        : "New pages appear here as the wiki grows. Reread any page below, or practice its questions.",
    }),
    next ? el("div", { class: "actions" }, el("a", { class: "primary", href: pageHash(next) }, "Start reading")) : null
  );

  const rows = app.learn.topics.map((topic) => {
    const stats = pageStats(app, app.learn.pages.filter((page) => page.topic === topic.slug), states);
    return el(
      "li",
      {},
      el(
        "a",
        { class: "topic-row", href: `#/learn/${encodeURIComponent(topic.slug)}` },
        el(
          "span",
          { class: "topic-text" },
          el("span", { class: "topic-name", text: topic.name }),
          el("span", {
            class: "topic-meta",
            text: `${stats.learned} of ${plural(stats.pages, "page")} learned · ${plural(stats.questions, "question")}`,
          })
        ),
        masteryOrNone(stats)
      )
    );
  });

  app.view.replaceChildren(
    hero,
    el(
      "section",
      { class: "panel", "aria-labelledby": "learn-topics-title" },
      el(
        "div",
        { class: "panel-head" },
        el("h2", { id: "learn-topics-title", text: "Topics" }),
        el("p", { class: "panel-note", text: `${all.learned} of ${plural(all.pages, "page")} learned` })
      ),
      el("ul", { class: "topic-list" }, rows)
    )
  );
  return null;
}

export function renderLearnTopic(app, route) {
  if (!app.learn) return unavailable(app);
  const topic = app.learn.topics.find((entry) => entry.slug === route.topic);
  if (!topic) {
    app.redirect("#/learn");
    return null;
  }
  const states = cardStates(app.store.reviews());
  const pages = app.learn.pages.filter((page) => page.topic === topic.slug);
  const stats = pageStats(app, pages, states);

  const rows = pages.map((page, index) => {
    const learned = isLearned(app.store, page);
    const pageStat = pageStats(app, [page], states);
    const meta = [`${page.minutes} min read`, plural(page.questions.length, "question")];
    if (learned) meta.push("Learned");
    return el(
      "li",
      {},
      el(
        "a",
        { class: "page-row", href: pageHash(page) },
        el(
          "span",
          { class: `page-status${learned ? " learned" : ""}`, "aria-hidden": "true" },
          learned ? "✓" : String(index + 1)
        ),
        el(
          "span",
          { class: "page-text" },
          el("span", { class: "page-title", text: page.title }),
          // Summary HTML is escaped at build time by scripts/wiki_markdown.py.
          page.summary ? el("span", { class: "page-summary", html: page.summary }) : null,
          el("span", { class: "page-meta", text: meta.join(" · ") })
        ),
        masteryOrNone(pageStat)
      )
    );
  });

  app.view.replaceChildren(
    el(
      "nav",
      { class: "crumbs", "aria-label": "Breadcrumb" },
      el("a", { href: "#/learn" }, "Learn"),
      el("span", { "aria-hidden": "true", text: " › " }),
      el("span", { "aria-current": "page", text: topic.name })
    ),
    el(
      "section",
      { class: "panel", "aria-labelledby": "topic-title" },
      el(
        "div",
        { class: "panel-head" },
        el("h2", { id: "topic-title", tabindex: "-1", text: topic.name }),
        el("p", { class: "panel-note", text: `${stats.learned} of ${plural(stats.pages, "page")} learned` })
      ),
      // Description HTML is escaped at build time by scripts/wiki_markdown.py.
      topic.description ? el("p", { class: "lead topic-description", html: topic.description }) : null,
      el("ol", { class: "page-list" }, rows)
    )
  );
  return null;
}
