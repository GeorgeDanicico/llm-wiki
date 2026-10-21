// Search every card by ID, topic, and question text; a result opens that card.

import { $, el, plainText, plural } from "../dom.js";

const MAX_RESULTS = 60;
let ready = false;
let app = null;

export function openSearch(context) {
  app = context;
  setup();
  $("#search-input").value = "";
  renderResults();
  $("#search-dialog").showModal();
  $("#search-input").focus();
}

function renderResults() {
  const filter = $("#search-input").value.trim().toLowerCase();
  const matches = app.cards.filter(
    (card) => !filter || `${card.id} ${app.topicName(card.topic)} ${plainText(card.question)}`.toLowerCase().includes(filter)
  );
  $("#search-results").replaceChildren(
    ...matches.slice(0, MAX_RESULTS).map((card) =>
      el(
        "li",
        {},
        el(
          "button",
          {
            type: "button",
            class: "entry search-entry",
            onclick: () => {
              $("#search-dialog").close();
              app.navigate(`#${card.id}`);
            },
          },
          el(
            "span",
            { class: "entry-body" },
            el("span", { class: "entry-meta", text: `${app.topicName(card.topic)} · ${card.id}` }),
            el("span", { class: "entry-question", text: plainText(card.question) })
          )
        )
      )
    )
  );
  const more = matches.length > MAX_RESULTS ? ` · showing the first ${MAX_RESULTS}` : "";
  $("#search-summary").textContent = `${plural(matches.length, "card")}${more}`;
}

function setup() {
  if (ready) return;
  ready = true;
  const dialog = $("#search-dialog");
  $("#close-search").addEventListener("click", () => dialog.close());
  $("#search-input").addEventListener("input", () => {
    renderResults();
    $("#search-results").scrollTop = 0;
  });
  $("#search-input").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    $("#search-results .entry")?.click();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) dialog.close();
  });
}
