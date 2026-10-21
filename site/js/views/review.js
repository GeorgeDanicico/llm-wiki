// The card component and session runner, shared by the daily deck, practice
// sessions, and single-card links. Grading writes one review row per card and
// session; regrading a card in the same session replaces its row.

import { $, button, el, plainText, plural } from "../dom.js";
import { randomId } from "../lib/random.js";
import { MAX_BOX, cardStates, isRecentlyAdded } from "../lib/schedule.js";

const SWIPE_DISTANCE = 80;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// The running session, for the browse dialog (one static element in index.html).
let current = null;

// options:
//   cards     the queue, in order
//   mode      "daily" or "practice" (written to every review row)
//   title     shown above the card
//   exitHash  where Exit and Esc go
//   previous  card ID -> review row already graded (resuming today's deck)
//   actions   (summary) -> [{label, run}] extra buttons on the summary
export function runSession(app, options) {
  setupBrowse();
  const session = {
    id: randomId(),
    queue: options.cards,
    position: 0,
    revealed: false,
    // Card ID -> "knew" | "missed" for this session.
    results: new Map(),
    // Card ID -> review row ID, so regrading replaces the row.
    rowIds: new Map(),
  };
  for (const [cardId, row] of options.previous ?? []) {
    session.results.set(cardId, row.knew ? "knew" : "missed");
    session.rowIds.set(cardId, row.id);
  }
  const firstOpen = session.queue.findIndex((card) => !session.results.has(card.id));
  session.position = firstOpen < 0 ? session.queue.length : firstOpen;

  const fill = el("div", { class: "progress-fill" });
  const positionText = el("span");
  const prev = el(
    "button",
    { type: "button", class: "nav-button", "aria-label": "Previous card", onclick: () => goTo(session.position - 1) },
    el("span", { "aria-hidden": "true", text: "‹" }),
    " Prev"
  );
  const next = el(
    "button",
    { type: "button", class: "nav-button", "aria-label": "Next card", onclick: () => goTo(session.position + 1) },
    "Next ",
    el("span", { "aria-hidden": "true", text: "›" })
  );
  const browse = el(
    "button",
    { type: "button", class: "position", "aria-haspopup": "dialog", onclick: openBrowse },
    positionText,
    el("span", { class: "browse" }, "Browse ", el("kbd", { text: "/" }))
  );
  const stage = el("div", { class: "stage", "aria-live": "polite" });

  app.view.replaceChildren(
    el(
      "section",
      { class: "session", "aria-labelledby": "session-title" },
      el(
        "div",
        { class: "session-bar" },
        el(
          "button",
          { type: "button", class: "exit", onclick: leave },
          el("span", { "aria-hidden": "true", text: "✕" }),
          " Exit ",
          el("kbd", { text: "Esc" })
        ),
        el("h2", { id: "session-title", class: "session-title", text: options.title })
      ),
      el("div", { class: "progress", "aria-hidden": "true" }, fill),
      el("nav", { class: "card-nav", "aria-label": "Card navigation" }, prev, browse, next),
      stage
    )
  );
  document.body.classList.add("focus");

  // --- Session ----------------------------------------------------------------

  function goTo(position) {
    session.position = Math.max(0, Math.min(position, session.queue.length));
    render();
  }

  function leave() {
    app.navigate(options.exitHash);
  }

  function counts() {
    let knew = 0;
    for (const verdict of session.results.values()) if (verdict === "knew") knew += 1;
    return { knew, missed: session.results.size - knew, ungraded: session.queue.length - session.results.size };
  }

  function reveal() {
    if (session.revealed || !session.queue[session.position]) return;
    session.revealed = true;
    $(".answer", stage).hidden = false;
    $(".grade", stage).hidden = false;
    $(".reveal", stage).remove();
    const card = $(".card", stage);
    card.classList.add("revealed");
    // Focus the card, not a grade button, so a second Space can't grade by accident.
    card.focus({ preventScroll: true });
  }

  function grade(knew) {
    const card = session.queue[session.position];
    if (!card || !session.revealed) return;
    const row = app.store.addReview({
      id: session.rowIds.get(card.id),
      sessionId: session.id,
      card: card.id,
      mode: options.mode,
      knew,
    });
    session.rowIds.set(card.id, row.id);
    session.results.set(card.id, knew ? "knew" : "missed");
    goTo(session.position + 1);
  }

  // --- Rendering --------------------------------------------------------------

  function render() {
    session.revealed = false;
    const total = session.queue.length;
    const { ungraded } = counts();
    fill.style.width = total ? `${((total - ungraded) / total) * 100}%` : "0";
    positionText.textContent = !total
      ? "No cards"
      : session.position < total
        ? `Card ${session.position + 1} of ${total}`
        : `Summary · ${total - ungraded} of ${total} graded`;
    prev.disabled = session.position === 0;
    next.disabled = session.position >= total;
    browse.disabled = !total;
    const card = session.queue[session.position];
    stage.replaceChildren(card ? cardView(card) : summaryView());
    if (!$("#browser").open) stage.querySelector(".reveal, .primary")?.focus({ preventScroll: true });
  }

  function cardView(card) {
    const box = cardStates(app.store.reviews()).get(card.id)?.box ?? 0;
    const view = renderCard(app, card, { box, verdict: session.results.get(card.id) });
    view.querySelector(".reveal").addEventListener("click", reveal);
    view.querySelector(".missed").addEventListener("click", () => grade(false));
    view.querySelector(".knew").addEventListener("click", () => grade(true));
    attachSwipe(view.querySelector(".card"));
    return view;
  }

  // Swipe right for "knew it" and left for "missed it" once the answer shows.
  function attachSwipe(article) {
    if (reducedMotion.matches) return;
    let drag = null;
    const settle = () => {
      article.style.transform = "";
      article.removeAttribute("data-swipe");
      drag = null;
    };
    article.addEventListener("pointerdown", (event) => {
      if (!session.revealed || event.pointerType === "mouse" || event.target.closest("a, button")) return;
      drag = { x: event.clientX, y: event.clientY, dx: 0, horizontal: null };
    });
    article.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (drag.horizontal === null && Math.hypot(dx, dy) > 10) drag.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!drag.horizontal) return;
      drag.dx = dx;
      article.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
      article.dataset.swipe = dx >= SWIPE_DISTANCE ? "knew" : dx <= -SWIPE_DISTANCE ? "missed" : "";
    });
    article.addEventListener("pointerup", () => {
      if (!drag) return;
      const { dx } = drag;
      settle();
      if (dx >= SWIPE_DISTANCE) grade(true);
      else if (dx <= -SWIPE_DISTANCE) grade(false);
    });
    article.addEventListener("pointercancel", settle);
  }

  function summaryView() {
    const { knew, missed, ungraded } = counts();
    const graded = knew + missed;
    const summary = { knew, missed, ungraded, graded };
    const actions = [];
    let title;
    let text;
    if (!session.queue.length) {
      title = "No cards";
      text = "There are no cards to review here yet.";
    } else {
      title = ungraded ? "End of session" : "Session complete";
      text = `You knew ${knew} of ${plural(graded, "graded card")}` + (ungraded ? `; ${ungraded} not graded yet.` : ".");
    }
    if (ungraded) {
      const first = session.queue.findIndex((card) => !session.results.has(card.id));
      actions.push({ label: "Go to first ungraded", run: () => goTo(first) });
    }
    if (missed) {
      const missedCards = session.queue.filter((card) => session.results.get(card.id) === "missed");
      // Re-reviewing missed cards is practice: it never moves a card twice in one day.
      actions.push({
        label: `Review ${missed} missed`,
        run: () => app.run({ cards: missedCards, mode: "practice", title: "Missed cards", exitHash: options.exitHash }),
      });
    }
    actions.push(...(options.actions?.(summary) ?? [{ label: "Done", run: leave }]));
    return el(
      "div",
      { class: "summary" },
      el("h3", { text: title }),
      el("p", { text }),
      el(
        "div",
        { class: "actions" },
        actions.map((action, index) => button(action.label, index === 0 ? "primary" : "secondary", action.run))
      )
    );
  }

  // --- Browse dialog ------------------------------------------------------------

  function openBrowse() {
    if (!session.queue.length) return;
    $("#browse-filter").value = "";
    renderList();
    $("#browser").showModal();
    $("#browse-list [aria-current]")?.scrollIntoView({ block: "center" });
    $("#browse-filter").focus();
  }

  function renderList() {
    const filter = $("#browse-filter").value.trim().toLowerCase();
    const items = [];
    session.queue.forEach((card, index) => {
      const question = plainText(card.question);
      const topic = app.topicName(card.topic);
      if (filter && !`${card.id} ${topic} ${question}`.toLowerCase().includes(filter)) return;
      const verdict = session.results.get(card.id);
      const entry = el(
        "button",
        {
          type: "button",
          class: "entry",
          "aria-current": index === session.position ? "true" : null,
          onclick: () => {
            $("#browser").close();
            goTo(index);
          },
        },
        el("span", { class: "number", text: index + 1 }),
        el("span", {
          class: `status ${verdict ?? "ungraded"}`,
          title: verdict === "knew" ? "Knew it" : verdict === "missed" ? "Missed it" : "Not graded yet",
          text: verdict === "knew" ? "✓" : verdict === "missed" ? "✗" : "",
        }),
        el(
          "span",
          { class: "entry-body" },
          el("span", { class: "entry-meta", text: `${topic} · ${card.id}` }),
          el("span", { class: "entry-question", text: question })
        )
      );
      items.push(el("li", {}, entry));
    });
    $("#browse-list").replaceChildren(...items);
    const { knew, missed, ungraded } = counts();
    const shown = filter ? `${items.length} of ${session.queue.length} shown · ` : "";
    $("#browse-summary").textContent = `${shown}${knew} knew · ${missed} missed · ${ungraded} not graded`;
  }

  // --- Keys -----------------------------------------------------------------------

  // Returns true when the key was handled.
  function onKey(event) {
    const onControl = event.target.closest?.("button, a, input, select, textarea");
    if ((event.key === " " || event.key === "Enter") && !session.revealed && session.queue[session.position]) {
      // Let focused controls keep their native behavior.
      if (onControl && !onControl.matches(".reveal")) return false;
      event.preventDefault();
      reveal();
      return true;
    }
    const actions = {
      1: () => grade(false),
      j: () => grade(false),
      2: () => grade(true),
      k: () => grade(true),
      ArrowLeft: () => goTo(session.position - 1),
      ArrowRight: () => goTo(session.position + 1),
      "/": openBrowse,
      Escape: leave,
    };
    const action = actions[event.key];
    if (!action) return false;
    event.preventDefault();
    action();
    return true;
  }

  current = { renderList };
  render();
  return {
    onKey,
    destroy() {
      if ($("#browser").open) $("#browser").close();
      current = null;
    },
  };
}

// One card from the template: topic, ID, badges, question, and the hidden
// answer with its grade buttons.
export function renderCard(app, card, { box = 0, verdict } = {}) {
  const view = $("#card-template").content.cloneNode(true);
  view.querySelector(".topic").textContent = app.topicName(card.topic);
  view.querySelector(".card-id").textContent = card.id;
  view.querySelector(".new").hidden = !isRecentlyAdded(card, app.today());
  const boxes = view.querySelector(".box");
  boxes.title = `Box ${box} of ${MAX_BOX}: rises when you know it, resets when you miss it`;
  boxes.setAttribute("aria-label", `Box ${box} of ${MAX_BOX}`);
  boxes.innerHTML = "<span class='on'>" + "●".repeat(box) + "</span>" + "○".repeat(MAX_BOX - box);
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
  for (const point of card.points) points.append(el("li", { html: point }));
  const source = view.querySelector(".source");
  source.href = card.source.url;
  source.textContent = `Read on the wiki: ${card.source.title} ↗`;
  return view;
}

let browseReady = false;

function setupBrowse() {
  if (browseReady) return;
  browseReady = true;
  const dialog = $("#browser");
  $("#close-browse").addEventListener("click", () => dialog.close());
  $("#browse-filter").addEventListener("input", () => {
    current?.renderList();
    $("#browse-list").scrollTop = 0;
  });
  $("#browse-filter").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    $("#browse-list .entry")?.click();
  });
  // Close when the backdrop (outside the dialog box) is clicked.
  dialog.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) dialog.close();
  });
}
