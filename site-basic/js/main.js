// The public study site: today's topic and question, random questions, the
// wiki's notes, and every question as a flashcard. It saves nothing: there is
// no progress, account, or service worker. The full study app with review
// tracking runs on the VPS from site/.
//
// Data comes from the same build as the full app (scripts/build_flashcards.py):
// cards.json, learn/index.json, and learn/<topic>/<page>.html. Card text, page
// summaries, and page bodies are HTML rendered and escaped at build time (the
// security boundary), so they are inserted as HTML; everything else is text.

import { dailyCard, dayKey, randomCard } from "./daily.js";
import { notesHash, parseRoute, questionsHash, sectionOf } from "./router.js";

const view = document.getElementById("view");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const SITE_TITLE = "LLM Wiki";

const app = {
  cards: [],
  cardById: new Map(),
  // Question decks from cards.json, by topic slug.
  decks: new Map(),
  // Notes topics from learn/index.json, in wiki index order.
  topics: [],
  // Every page in index order, with its topic, and by "<topic>/<page>".
  pages: [],
  pageByKey: new Map(),
  // Set while a page is open, so links within it only scroll.
  reader: null,
  // Keyboard actions of the current view: { toggle, next }.
  keys: null,
  // The date the home view was rendered for, to refresh after midnight.
  homeDay: null,
};

// --- Helpers -------------------------------------------------------------------------

// el("p", { class: "note", text: "Hi" }, child, …). Keys starting with "on"
// add listeners; `true` sets an empty attribute; null and false are skipped.
function el(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") element.className = value;
    else if (key === "text") element.textContent = value;
    else if (key === "html") element.innerHTML = value;
    else if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else element.setAttribute(key, value === true ? "" : value);
  }
  element.append(...children.flat().filter((child) => child != null && child !== false));
  return element;
}

const plural = (count, word) => `${count} ${count === 1 ? word : `${word}s`}`;

function plainText(html) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent;
}

// Index summaries start in lower case ("token boundaries, …").
const sentence = (html) => html.replace(/^[a-z]/, (letter) => letter.toUpperCase());

const isTyping = (target) => Boolean(target?.closest?.("input, textarea, select, [contenteditable]"));

function setTitle(...parts) {
  document.title = [...parts, SITE_TITLE].join(" · ");
}

function redirect(hash) {
  location.replace(hash);
}

async function fetchOk(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

// --- Flashcards ----------------------------------------------------------------------

// A question with a "Show answer" toggle. `card.reveal` toggles it.
function cardView(card) {
  const page = app.pageByKey.get(card.pageSlug);
  const deck = app.decks.get(card.topic);
  const answerId = `answer-${card.id}`;
  const toggle = el("button", { type: "button", class: "reveal", "aria-expanded": "false", "aria-controls": answerId }, "Show answer");
  const answer = el(
    "div",
    { class: "answer", id: answerId, hidden: true },
    el("h4", { text: "Expected points" }),
    el("ul", { class: "points" }, card.points.map((point) => el("li", { html: point }))),
    page
      ? el("a", { class: "source", href: notesHash(page.topic, page.slug, card.anchor) }, `Read more in “${page.title}”`)
      : el("a", { class: "source", href: card.source.url, target: "_blank", rel: "noopener" }, `Source: ${card.source.title}`)
  );
  const article = el(
    "article",
    { class: "card" },
    el(
      "div",
      { class: "card-meta" },
      el("a", { class: "topic", href: questionsHash(card.topic) }, deck?.name ?? card.topic),
      el("a", { class: "card-id", href: `#${card.id}`, title: "Link to this question" }, card.id)
    ),
    el("h3", { class: "question", html: card.question }),
    answer,
    toggle
  );
  const reveal = () => {
    const show = answer.hidden;
    answer.hidden = !show;
    article.classList.toggle("revealed", show);
    toggle.setAttribute("aria-expanded", String(show));
    toggle.textContent = show ? "Hide answer" : "Show answer";
  };
  toggle.addEventListener("click", reveal);
  article.reveal = reveal;
  return article;
}

const header = (title, lead, ...extra) =>
  el("header", { class: "view-head" }, ...extra, el("h2", { text: title }), lead ? el("p", { class: "lead", text: lead }) : null);

// --- Today ---------------------------------------------------------------------------

function renderHome() {
  const today = dayKey();
  app.homeDay = today;
  const card = dailyCard(app.cards, today);
  const page = card && app.pageByKey.get(card.pageSlug);
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  setTitle("Today");

  const questionCard = card ? cardView(card) : null;
  app.keys = questionCard ? { toggle: questionCard.reveal } : null;

  view.replaceChildren(
    header("Today in the wiki", "One topic and one question a day, the same for everyone. Both change at midnight.", el("p", { class: "eyebrow", text: date })),
    page
      ? el(
          "section",
          { class: "panel topic-of-day", "aria-labelledby": "topic-of-day" },
          el("p", { class: "label", text: "Topic of the day" }),
          el("h3", { id: "topic-of-day" }, el("a", { href: notesHash(page.topic, page.slug) }, page.title)),
          el("p", { class: "meta", text: `${page.topicName} · ${page.minutes} min read · ${plural(page.questions.length, "question")}` }),
          page.summary ? el("p", { class: "summary", html: sentence(page.summary) }) : null,
          el("a", { class: "button primary", href: notesHash(page.topic, page.slug) }, "Read the note")
        )
      : null,
    questionCard
      ? el("section", { class: "daily-question", "aria-label": "Question of the day" }, el("p", { class: "label", text: "Question of the day" }), questionCard)
      : el("p", { class: "message", text: "There are no questions yet." }),
    el(
      "nav",
      { class: "more", "aria-label": "Keep going" },
      el("a", { class: "button", href: "#/random" }, "Random question"),
      el("a", { class: "button", href: "#/notes" }, "Browse notes"),
      el("a", { class: "button", href: "#/questions" }, "Browse questions")
    )
  );
}

// --- Random --------------------------------------------------------------------------

function renderRandom() {
  setTitle("Random question");
  const holder = el("div", { class: "random-card", "aria-live": "polite" });
  let current = null;
  const next = () => {
    current = randomCard(app.cards, current?.id);
    if (!current) {
      holder.replaceChildren(el("p", { class: "message", text: "There are no questions yet." }));
      return;
    }
    const card = cardView(current);
    holder.replaceChildren(card);
    app.keys = { toggle: card.reveal, next };
  };
  view.replaceChildren(
    header("Random question", `Picked from all ${plural(app.cards.length, "question")}. Answer from memory, then show the expected points.`),
    holder,
    el(
      "div",
      { class: "actions" },
      el("button", { type: "button", class: "button primary", onclick: () => next() }, "Another question"),
      el("p", { class: "keys" }, el("kbd", { text: "Space" }), " show answer · ", el("kbd", { text: "N" }), " next question")
    )
  );
  next();
}

// --- Notes ---------------------------------------------------------------------------

function pageItem(page) {
  return el(
    "li",
    {},
    el("a", { class: "page-link", href: notesHash(page.topic, page.slug) }, el("span", { class: "page-title", text: page.title })),
    page.summary ? el("p", { class: "summary", html: sentence(page.summary) }) : null,
    el("p", { class: "meta", text: `${page.minutes} min read · ${plural(page.questions.length, "question")}` })
  );
}

function renderNotes(route) {
  if (route.topic) {
    const topic = app.topics.find((candidate) => candidate.slug === route.topic);
    if (!topic) return redirect("#/notes");
    setTitle(topic.name, "Notes");
    view.replaceChildren(
      header(topic.name, null, el("p", { class: "crumbs" }, el("a", { href: "#/notes" }, "All notes"))),
      topic.description ? el("p", { class: "lead", html: sentence(topic.description) }) : null,
      el("ol", { class: "page-list" }, topic.pages.map(pageItem))
    );
    return;
  }
  setTitle("Notes");
  view.replaceChildren(
    header("Notes", `${plural(app.pages.length, "page")} in ${plural(app.topics.length, "topic")}, in the wiki's order.`),
    ...app.topics.map((topic) =>
      el(
        "section",
        { class: "topic-block", "aria-labelledby": `topic-${topic.slug}` },
        el("h3", { id: `topic-${topic.slug}` }, el("a", { href: notesHash(topic.slug) }, topic.name)),
        topic.description ? el("p", { class: "description", html: sentence(topic.description) }) : null,
        el("ol", { class: "page-list" }, topic.pages.map(pageItem))
      )
    )
  );
}

// --- Reader --------------------------------------------------------------------------

async function renderReader(route) {
  const key = `${route.topic}/${route.page}`;
  const page = app.pageByKey.get(key);
  if (!page) {
    return redirect(app.topics.some((topic) => topic.slug === route.topic) ? notesHash(route.topic) : "#/notes");
  }
  setTitle(page.title);
  const position = app.pages.indexOf(page);
  const previous = app.pages[position - 1];
  const following = app.pages[position + 1];
  const cards = page.questions.map((id) => app.cardById.get(id)).filter(Boolean);
  const body = el("div", { class: "wiki-body", "aria-busy": "true" }, el("p", { class: "loading", text: "Loading page…" }));

  const toc = page.sections.length
    ? el(
        "details",
        { class: "toc" },
        el("summary", { text: "On this page" }),
        el(
          "ol",
          {},
          page.sections.map((section) =>
            el("li", { class: `toc-level-${section.level}` }, el("a", { href: notesHash(page.topic, page.slug, section.anchor) }, section.title))
          ),
          cards.length ? el("li", { class: "toc-level-2" }, el("a", { href: notesHash(page.topic, page.slug, "questions") }, "Questions on this page")) : null
        )
      )
    : null;
  toc?.addEventListener("click", (event) => {
    if (event.target.closest("a")) toc.open = false;
  });

  const state = {
    key,
    scrollTo(anchor) {
      if (!anchor) return window.scrollTo(0, 0);
      const target = document.getElementById(`wiki-${anchor}`) ?? document.getElementById(anchor);
      if (!target) return;
      target.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    },
  };
  app.reader = state;

  view.replaceChildren(
    el(
      "article",
      { class: "reader" },
      el(
        "header",
        { class: "view-head" },
        el("p", { class: "crumbs" }, el("a", { href: "#/notes" }, "Notes"), " › ", el("a", { href: notesHash(page.topic) }, page.topicName)),
        el("h2", { text: page.title }),
        el("p", { class: "meta", text: `${page.minutes} min read · ${plural(cards.length, "question")}` })
      ),
      toc,
      body,
      cards.length
        ? el(
            "section",
            { class: "page-questions", id: "questions", "aria-labelledby": "questions-title" },
            el("h3", { id: "questions-title", text: "Questions on this page" }),
            el("div", { class: "card-stack" }, cards.map(cardView))
          )
        : null,
      el(
        "nav",
        { class: "pager", "aria-label": "Other pages" },
        previous
          ? el("a", { class: "prev", href: notesHash(previous.topic, previous.slug) }, el("span", { text: "Previous" }), el("strong", { text: previous.title }))
          : el("span"),
        following
          ? el("a", { class: "next", href: notesHash(following.topic, following.slug) }, el("span", { text: "Next" }), el("strong", { text: following.title }))
          : null
      )
    )
  );

  try {
    const html = await (await fetchOk(`learn/${encodeURIComponent(page.topic)}/${encodeURIComponent(page.slug)}.html`)).text();
    if (app.reader !== state) return;
    body.innerHTML = html;
  } catch (error) {
    console.error(error);
    if (app.reader !== state) return;
    body.replaceChildren(el("p", { class: "message", text: "This page could not be loaded. Check your connection and reload." }));
  }
  body.removeAttribute("aria-busy");
  if (route.anchor) state.scrollTo(route.anchor);
}

// --- Questions -----------------------------------------------------------------------

function renderQuestions(route) {
  const deck = route.topic ? app.decks.get(route.topic) : null;
  if (route.topic && !deck) return redirect("#/questions");
  setTitle(deck ? `${deck.name} questions` : "Questions");
  const cards = deck ? app.cards.filter((card) => card.topic === deck.slug) : app.cards;

  const chips = el(
    "nav",
    { class: "chips", "aria-label": "Topics" },
    [{ slug: null, name: "All", count: app.cards.length }, ...app.decks.values()].map((option) =>
      el(
        "a",
        { href: questionsHash(option.slug), "aria-current": option.slug === (deck?.slug ?? null) ? "page" : null },
        option.name,
        el("span", { class: "count", text: option.count })
      )
    )
  );
  const filter = el("input", {
    type: "search",
    class: "filter",
    placeholder: "Filter by words or ID",
    "aria-label": "Filter questions",
    autocomplete: "off",
  });
  const summary = el("p", { class: "list-summary", "aria-live": "polite" });
  const items = cards.map((card) => ({
    text: `${card.id} ${plainText(card.question)} ${card.points.map(plainText).join(" ")}`.toLowerCase(),
    node: el("li", {}, cardView(card)),
  }));
  const list = el("ol", { class: "question-list" }, items.map((item) => item.node));

  const apply = () => {
    const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const item of items) {
      const match = words.every((word) => item.text.includes(word));
      item.node.hidden = !match;
      if (match) shown++;
    }
    summary.textContent = words.length ? `${shown} of ${plural(items.length, "question")} match` : plural(items.length, "question");
  };
  filter.addEventListener("input", apply);
  apply();

  view.replaceChildren(
    header(deck ? deck.name : "Questions", "Answer from memory, then show the expected points."),
    chips,
    filter,
    summary,
    list
  );
}

function renderCard(route) {
  const card = app.cardById.get(route.id);
  if (!card) return redirect("#/questions");
  const deck = app.decks.get(card.topic);
  setTitle(card.id);
  const node = cardView(card);
  app.keys = { toggle: node.reveal };
  view.replaceChildren(
    header("Question", null, el("p", { class: "crumbs" }, el("a", { href: questionsHash(card.topic) }, `${deck?.name ?? card.topic} questions`))),
    node,
    el(
      "nav",
      { class: "more", "aria-label": "Keep going" },
      el("a", { class: "button", href: questionsHash(card.topic) }, `More ${deck?.name ?? ""} questions`.replace(/\s+/g, " ")),
      el("a", { class: "button", href: "#/random" }, "Random question")
    )
  );
}

// --- Routing -------------------------------------------------------------------------

const views = { home: renderHome, random: renderRandom, notes: renderNotes, reader: renderReader, questions: renderQuestions, card: renderCard };

function onRoute() {
  const route = parseRoute(location.hash);
  // A link to a section of the open page only scrolls.
  if (route.name === "reader" && app.reader?.key === `${route.topic}/${route.page}`) {
    app.reader.scrollTo(route.anchor);
    return;
  }
  app.reader = null;
  app.keys = null;
  const section = sectionOf(route);
  for (const tab of document.querySelectorAll("[data-tab]")) {
    if (tab.dataset.tab === section) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  if (!(route.name === "reader" && route.anchor)) window.scrollTo(0, 0);
  views[route.name](route);
}

document.addEventListener("keydown", (event) => {
  if (!app.keys || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
  if (event.key === " " && !event.target.closest?.("button, a, summary")) {
    event.preventDefault();
    app.keys.toggle?.();
  } else if ((event.key === "n" || event.key === "N") && app.keys.next) {
    event.preventDefault();
    app.keys.next();
  }
});

// A tab left open overnight shows the new day's pick when it comes back.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && parseRoute(location.hash).name === "home" && app.homeDay !== dayKey()) onRoute();
});

async function init() {
  let cards;
  let learn;
  try {
    [cards, learn] = await Promise.all([fetchOk("cards.json").then((r) => r.json()), fetchOk("learn/index.json").then((r) => r.json())]);
  } catch (error) {
    console.error(error);
    view.replaceChildren(el("p", { class: "message", text: "The wiki could not be loaded. Check your connection and reload." }));
    return;
  }
  app.cards = cards.cards;
  app.cardById = new Map(app.cards.map((card) => [card.id, card]));
  app.decks = new Map(cards.topics.map((topic) => [topic.slug, topic]));
  app.topics = learn.topics;
  for (const topic of learn.topics) {
    for (const page of topic.pages) {
      const entry = { ...page, topic: topic.slug, topicName: topic.name };
      app.pages.push(entry);
      app.pageByKey.set(`${topic.slug}/${page.slug}`, entry);
    }
  }
  // Notes lists use the entries with topic information.
  for (const topic of app.topics) topic.pages = topic.pages.map((page) => app.pageByKey.get(`${topic.slug}/${page.slug}`));

  const repository = document.getElementById("repo-link");
  if (cards.repository) repository.href = cards.repository;
  if (cards.generated) {
    const generated = new Date(cards.generated);
    if (!Number.isNaN(generated.getTime())) {
      document.getElementById("generated").textContent = ` on ${generated.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`;
    }
  }

  window.addEventListener("hashchange", onRoute);
  onRoute();
}

init();
