// The page reader: a rendered wiki page with its sections, "Check yourself"
// questions graded with mode "learn", "Mark as learned", and the next page.
//
// Page bodies are HTML fragments from learn/<topic>/<page>.html, rendered and
// escaped at build time by scripts/wiki_markdown.py (the security boundary),
// so they are inserted as HTML. Heading IDs carry a "wiki-" prefix so they
// never collide with IDs in the app shell.

import { button, el, plural } from "../dom.js";
import { isLearned, nextPage, pageHash } from "../lib/learn.js";
import { randomId } from "../lib/random.js";
import { cardStates, compareRows } from "../lib/schedule.js";
import { unavailable } from "./learn.js";
import { parseRoute } from "../router.js";
import { renderCard } from "./review.js";

const HEADING_PREFIX = "wiki-";
const CHECK_ANCHOR = "check-yourself";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// URL -> Promise of the fragment's HTML, so revisiting a page is instant.
const fragments = new Map();

function loadFragment(page) {
  const url = `learn/${encodeURIComponent(page.topic)}/${encodeURIComponent(page.slug)}.html`;
  if (!fragments.has(url)) {
    const request = fetch(url, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        return response.text();
      })
      .catch((error) => {
        fragments.delete(url);
        throw error;
      });
    fragments.set(url, request);
  }
  return fragments.get(url);
}

const behavior = () => (reducedMotion.matches ? "auto" : "smooth");

export function renderReader(app, route) {
  if (!app.learn) return unavailable(app);
  const page = app.learn.byKey.get(`${route.topic}/${route.page}`);
  if (!page) {
    const topicExists = app.learn.topics.some((topic) => topic.slug === route.topic);
    app.redirect(topicExists ? `#/learn/${encodeURIComponent(route.topic)}` : "#/learn");
    return null;
  }

  let destroyed = false;
  let loaded = false;
  let pendingAnchor = route.anchor;
  const sessionId = randomId();
  const cards = page.questions.map((id) => app.cardById.get(id)).filter(Boolean);
  const ids = new Set(cards.map((card) => card.id));
  // Card ID -> "knew" | "missed", and the row to replace when regrading. Rows
  // graded while learning earlier today are shown again.
  const results = new Map();
  const rowIds = new Map();
  for (const row of app.store
    .reviews()
    .filter((row) => row.mode === "learn" && row.day === app.today() && ids.has(row.card))
    .sort(compareRows)) {
    results.set(row.card, row.knew ? "knew" : "missed");
    rowIds.set(row.card, row.id);
  }
  let highlighted = new Set();

  // --- Layout ---------------------------------------------------------------------

  const tocLists = [];
  const tocList = () => {
    const list = el(
      "ol",
      {},
      page.sections.map((section) =>
        el(
          "li",
          { class: `toc-level-${section.level}` },
          el(
            "a",
            { href: pageHash(page, section.anchor), "data-anchor": section.anchor },
            el("span", { text: section.title }),
            section.questions.length
              ? el("span", {
                  class: "toc-count",
                  title: plural(section.questions.length, "question"),
                  "aria-label": plural(section.questions.length, "question"),
                  text: section.questions.length,
                })
              : null
          )
        )
      ),
      cards.length
        ? el("li", { class: "toc-level-2 toc-check" }, el("a", { href: pageHash(page, CHECK_ANCHOR), "data-anchor": CHECK_ANCHOR }, "Check yourself"))
        : null
    );
    tocLists.push(list);
    return list;
  };
  const hasToc = page.sections.length > 0;
  const tocInline = hasToc
    ? el("details", { class: "toc-inline" }, el("summary", { text: "On this page" }), el("nav", { "aria-label": "On this page" }, tocList()))
    : null;
  const tocSide = hasToc
    ? el("nav", { class: "toc-side", "aria-labelledby": "toc-side-title" }, el("p", { class: "toc-title", id: "toc-side-title", text: "On this page" }), tocList())
    : null;
  // Choosing a section in the collapsible menu closes it.
  tocInline?.addEventListener("click", (event) => {
    if (event.target.closest("a")) tocInline.open = false;
  });

  const body = el("div", { class: "wiki-body", "aria-busy": "true" }, el("p", { class: "loading", text: "Loading page…" }));
  const status = el("p", { class: "status-line", role: "status" });
  const say = (text) => {
    status.textContent = text;
  };
  const list = el("div", { class: "check-list" });
  const summary = el("div", { class: "check-summary" });
  const note = el("p", { class: "check-note", role: "status" });
  const check = cards.length
    ? el(
        "section",
        { class: "panel check", id: CHECK_ANCHOR, tabindex: "-1", "aria-labelledby": "check-title" },
        el("h3", { id: "check-title", text: "Check yourself" }),
        el("p", {
          class: "lead",
          text: `${plural(cards.length, "question")} on this page. Answer from memory, then show the expected points and grade yourself. Grading here starts each card's review schedule.`,
        }),
        note,
        list,
        summary
      )
    : el(
        "section",
        { class: "panel check empty", "aria-labelledby": "check-title" },
        el("h3", { id: "check-title", text: "No questions yet" }),
        el("p", { class: "lead", text: "This page has no review questions yet, so marking it as learned adds nothing to your daily review." })
      );
  const footer = el("div", { class: "reader-actions" });

  const meta = [page.topicName, `${page.minutes} min read`, plural(page.questions.length, "question")];
  app.view.replaceChildren(
    el(
      "div",
      { class: "reader" },
      el(
        "nav",
        { class: "crumbs", "aria-label": "Breadcrumb" },
        el("a", { href: "#/learn" }, "Learn"),
        el("span", { "aria-hidden": "true", text: " › " }),
        el("a", { href: `#/learn/${encodeURIComponent(page.topic)}` }, page.topicName)
      ),
      el(
        "div",
        { class: `reader-layout${hasToc ? " with-toc" : ""}` },
        el(
          "div",
          { class: "reader-main" },
          el(
            "article",
            { class: "panel reader-page", "aria-labelledby": "reader-title" },
            el("p", { class: "eyebrow", text: meta.join(" · ") }),
            el("h2", { id: "reader-title", tabindex: "-1", text: page.title }),
            tocInline,
            body
          ),
          check,
          el("section", { class: "panel reader-footer", "aria-label": "Page progress" }, footer, status)
        ),
        tocSide
      )
    )
  );
  document.body.classList.add("reading");
  // A link to the section already in the address bar fires no hashchange, so
  // scroll to it here.
  app.view.firstElementChild.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#/learn/"]');
    if (!link || link.getAttribute("href") !== location.hash || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    goToAnchor(parseRoute(location.hash).anchor);
  });

  // --- Page body --------------------------------------------------------------------

  loadFragment(page).then(
    (html) => {
      if (destroyed) return;
      body.innerHTML = html;
      body.removeAttribute("aria-busy");
      addSectionChips();
      loaded = true;
      if (pendingAnchor) goToAnchor(pendingAnchor);
      updateCurrentSection();
    },
    (error) => {
      if (destroyed) return;
      console.error(error);
      body.removeAttribute("aria-busy");
      body.replaceChildren(
        el(
          "p",
          { class: "message" },
          "Could not load this page. ",
          button("Try again", "link-button", () => app.refresh())
        )
      );
    }
  );

  function headingFor(anchor) {
    if (anchor === CHECK_ANCHOR) return cards.length ? check : null;
    return body.querySelector(`#${CSS.escape(HEADING_PREFIX + anchor)}`);
  }

  function goToAnchor(anchor) {
    pendingAnchor = null;
    const target = anchor ? headingFor(anchor) : null;
    if (!target) {
      window.scrollTo(0, 0);
      return;
    }
    // Jump like an ordinary anchor; a smooth scroll could outlive this view.
    target.scrollIntoView({ block: "start" });
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  // "2 questions" after each heading whose section has questions.
  function addSectionChips() {
    for (const section of page.sections) {
      const count = section.questions.filter((id) => ids.has(id)).length;
      const heading = count && headingFor(section.anchor);
      if (!heading) continue;
      heading.after(
        el(
          "button",
          {
            type: "button",
            class: "section-chip",
            "aria-label": `Check yourself: ${plural(count, "question")} on ${section.title}`,
            onclick: () => highlight(section),
          },
          el("span", { "aria-hidden": "true", text: "✓ " }),
          plural(count, "question")
        )
      );
    }
  }

  // --- Section list: the section being read ------------------------------------------

  let frame = 0;
  function updateCurrentSection() {
    frame = 0;
    if (!loaded || !hasToc) return;
    let current = null;
    for (const section of page.sections) {
      const heading = headingFor(section.anchor);
      if (heading && heading.getBoundingClientRect().top < 120) current = section.anchor;
    }
    if (cards.length && check.getBoundingClientRect().top < 120) current = CHECK_ANCHOR;
    for (const listElement of tocLists) {
      for (const link of listElement.querySelectorAll("a")) {
        if (link.dataset.anchor === current) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
    }
  }
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(updateCurrentSection);
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  // --- Check yourself ---------------------------------------------------------------

  function highlight(section) {
    highlighted = new Set(section.questions);
    for (const item of list.children) item.classList.toggle("highlight", highlighted.has(item.dataset.card));
    note.textContent = `Questions on “${section.title}” are highlighted.`;
    const first = list.querySelector(".check-item.highlight");
    (first ?? check).scrollIntoView({ block: first ? "center" : "start", behavior: behavior() });
    (first?.querySelector(".reveal") ?? first?.querySelector(".card"))?.focus({ preventScroll: true });
  }

  function itemView(card) {
    const verdict = results.get(card.id);
    const box = cardStates(app.store.reviews()).get(card.id)?.box ?? 0;
    const item = el("div", { class: "check-item", "data-card": card.id }, renderCard(app, card, { box, verdict }));
    item.classList.toggle("highlight", highlighted.has(card.id));
    // The card's wiki link points back into this page rather than to GitHub.
    const source = item.querySelector(".source");
    source.href = pageHash(page, card.anchor);
    source.removeAttribute("target");
    source.removeAttribute("rel");
    source.textContent = card.anchor ? "Reread this section" : "Back to the top of the page";
    item.querySelector(".reveal").addEventListener("click", () => reveal(item));
    item.querySelector(".missed").addEventListener("click", () => grade(card, false));
    item.querySelector(".knew").addEventListener("click", () => grade(card, true));
    // Graded cards stay open so the expected points remain visible.
    if (verdict) reveal(item, false);
    return item;
  }

  function reveal(item, focus = true) {
    const control = item.querySelector(".reveal");
    if (!control) return;
    item.querySelector(".answer").hidden = false;
    item.querySelector(".grade").hidden = false;
    control.remove();
    const article = item.querySelector(".card");
    article.classList.add("revealed");
    // Focus the card, not a grade button, so a second Space can't grade by accident.
    if (focus) article.focus({ preventScroll: true });
  }

  function grade(card, knew) {
    const row = app.store.addReview({ id: rowIds.get(card.id), sessionId, card: card.id, mode: "learn", knew });
    rowIds.set(card.id, row.id);
    results.set(card.id, knew ? "knew" : "missed");
    const fresh = itemView(card);
    list.querySelector(`[data-card="${CSS.escape(card.id)}"]`).replaceWith(fresh);
    renderSummary();
    // The next ungraded question after this one, wrapping around to the start.
    const position = cards.indexOf(card);
    const following = [...cards.slice(position + 1), ...cards.slice(0, position)].find((entry) => !results.has(entry.id));
    if (following) {
      const control = list.querySelector(`[data-card="${CSS.escape(following.id)}"] .reveal`);
      control?.scrollIntoView({ block: "nearest", behavior: behavior() });
      control?.focus({ preventScroll: true });
    } else {
      summary.scrollIntoView({ block: "nearest", behavior: behavior() });
      summary.querySelector("button, a")?.focus({ preventScroll: true });
    }
  }

  function renderSummary() {
    const graded = cards.filter((card) => results.has(card.id));
    if (graded.length < cards.length) {
      summary.replaceChildren();
      return;
    }
    const knew = graded.filter((card) => results.get(card.id) === "knew").length;
    const learned = isLearned(app.store, page);
    summary.replaceChildren(
      el("p", { text: `You knew ${knew} of ${plural(cards.length, "question")}.` }),
      el("div", { class: "actions" }, ...pageActions(learned, true))
    );
  }

  // --- Learned state and the next page ---------------------------------------------------

  function setLearned(learned) {
    app.store.setPage(page.path, learned);
    renderFooter();
    renderSummary();
    if (!learned) {
      say("Marked as not learned. Its questions no longer join your daily review as new cards.");
    } else if (!cards.length || !app.store.setting("onlyLearnedPages")) {
      say("Marked as learned.");
    } else {
      const states = cardStates(app.store.reviews());
      const fresh = cards.filter((card) => !states.has(card.id)).length;
      say(
        fresh
          ? `Marked as learned. ${plural(fresh, "question")} can now join your daily review as new cards.`
          : "Marked as learned. Its questions are already in your review schedule."
      );
    }
    footer.querySelector(".toggle-learned")?.focus({ preventScroll: true });
  }

  function pageActions(learned, inSummary = false) {
    const next = nextPage(app.learn, page);
    const nextLink = next
      ? el(
          "a",
          { class: learned ? "primary" : "secondary", href: pageHash(next) },
          next.topic === page.topic ? `Next page: ${next.title}` : `Next topic: ${next.topicName}`,
          el("span", { "aria-hidden": "true", text: " ›" })
        )
      : el("a", { class: learned ? "primary" : "secondary", href: "#/learn" }, "Back to Learn");
    if (learned) return inSummary ? [nextLink] : [nextLink, button("Mark as not learned", "link-button toggle-learned", () => setLearned(false))];
    return [button("Mark as learned", "primary toggle-learned", () => setLearned(true)), nextLink];
  }

  function renderFooter() {
    const record = app.store.page(page.path);
    const learned = record?.learned === 1;
    const when = learned ? new Date(record.at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "";
    footer.replaceChildren(
      el(
        "p",
        { class: `learned-state${learned ? " learned" : ""}` },
        learned ? `✓ Learned on ${when}` : "Not learned yet"
      ),
      el("div", { class: "actions" }, ...pageActions(learned))
    );
  }

  // --- Keys -------------------------------------------------------------------------------

  // Inside a check-yourself card: Space or Enter reveals, 1/j and 2/k grade.
  function onKey(event) {
    const item = event.target.closest?.(".check-item");
    const card = item && app.cardById.get(item.dataset.card);
    if (!card) return false;
    const revealed = !item.querySelector(".reveal");
    if (!revealed && (event.key === " " || event.key === "Enter") && event.target.matches(".card")) {
      event.preventDefault();
      reveal(item);
      return true;
    }
    if (!revealed || event.target.closest("a, button:not(.missed):not(.knew)")) return false;
    const knew = { 1: false, j: false, 2: true, k: true }[event.key];
    if (knew === undefined) return false;
    event.preventDefault();
    grade(card, knew);
    return true;
  }

  for (const card of cards) list.append(itemView(card));
  renderSummary();
  renderFooter();

  return {
    onKey,
    // Moving between sections of this page scrolls instead of re-rendering.
    reroute(next) {
      if (next.name !== "reader" || next.topic !== route.topic || next.page !== route.page) return false;
      if (loaded) goToAnchor(next.anchor);
      else pendingAnchor = next.anchor;
      return true;
    },
    destroy() {
      destroyed = true;
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      document.body.classList.remove("reading");
    },
  };
}
