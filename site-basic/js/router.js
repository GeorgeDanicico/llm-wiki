// Hash routes for the public site. Every URL stays relative so the site works
// under /llm-wiki/ on GitHub Pages.
//
//   #/                                  today's topic and question (default)
//   #/random                            a random question
//   #/notes                             every topic and its pages
//   #/notes/<topic>                     one topic's pages
//   #/notes/<topic>/<page>[/<anchor>]   a page, optionally at a section
//   #/questions[/<topic>]               every question, or one topic's
//   #REL-CA-002                         one question by its ID
//
// Rendered wiki pages link to each other as #/learn/..., the full study app's
// route, so "learn" is accepted as another name for "notes". Other old routes
// of the full app fall back to the nearest view here.

const CARD_RE = /^#([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3})$/;

export function parseRoute(hash) {
  const card = CARD_RE.exec(hash);
  if (card) return { name: "card", id: card[1] };
  let parts;
  try {
    parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    parts = [];
  }
  const [section, sub, page, anchor] = parts;
  if (section === "random") return { name: "random" };
  if (section === "notes" || section === "learn") {
    if (sub && page) return { name: "reader", topic: sub, page, anchor: anchor ?? null };
    return sub ? { name: "notes", topic: sub } : { name: "notes", topic: null };
  }
  if (section === "questions" || section === "practice") {
    return { name: "questions", topic: sub && sub !== "all" ? sub : null };
  }
  return { name: "home" };
}

// The navigation tab highlighted for a route.
export function sectionOf(route) {
  if (route.name === "notes" || route.name === "reader") return "notes";
  if (route.name === "questions" || route.name === "card") return "questions";
  if (route.name === "random") return "random";
  return "home";
}

export const notesHash = (topic, page, anchor) =>
  "#/notes" + [topic, page, anchor].filter(Boolean).map((part) => "/" + encodeURIComponent(part)).join("");

export const questionsHash = (topic) => (topic ? `#/questions/${encodeURIComponent(topic)}` : "#/questions");
