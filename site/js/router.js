// Hash routes. Every URL stays relative so the site works under /llm-wiki/.
//
//   #/today            home and the daily deck (default)
//   #/today/review     running the daily deck
//   #/learn            Learn: topics with pages learned and mastery
//   #/learn/<topic>    a topic's pages in wiki index order
//   #/learn/<topic>/<page>[/<anchor>]  the page reader, optionally at a section
//   #/practice         topic list
//   #/practice/<slug>  practice one topic, or "all" for the chosen topics
//   #/settings         settings
//   #REL-CA-002        old card links: that card in a one-card session

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
  if (section === "today" && sub === "review") return { name: "daily" };
  if (section === "learn") {
    if (page) return { name: "reader", topic: sub, page, anchor: anchor ?? null };
    return sub ? { name: "learn-topic", topic: sub } : { name: "learn" };
  }
  if (section === "practice") return sub ? { name: "practice-session", topic: sub } : { name: "practice" };
  if (section === "settings") return { name: "settings" };
  return { name: "today" };
}

// The tab that is highlighted for a route.
export function sectionOf(route) {
  if (route.name === "settings") return "settings";
  if (route.name.startsWith("learn") || route.name === "reader") return "learn";
  if (route.name.startsWith("practice") || route.name === "card") return "practice";
  return "today";
}

export function startRouter(onRoute) {
  const fire = () => onRoute(parseRoute(location.hash));
  window.addEventListener("hashchange", fire);
  fire();
}
