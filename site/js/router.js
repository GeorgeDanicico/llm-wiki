// Hash routes. Every URL stays relative so the site works under /llm-wiki/.
//
//   #/today            home and the daily deck (default)
//   #/today/review     running the daily deck
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
  const [section, sub] = parts;
  if (section === "today" && sub === "review") return { name: "daily" };
  if (section === "practice") return sub ? { name: "practice-session", topic: sub } : { name: "practice" };
  if (section === "settings") return { name: "settings" };
  return { name: "today" };
}

// The tab that is highlighted for a route.
export function sectionOf(route) {
  if (route.name === "settings") return "settings";
  if (route.name.startsWith("practice") || route.name === "card") return "practice";
  return "today";
}

export function startRouter(onRoute) {
  const fire = () => onRoute(parseRoute(location.hash));
  window.addEventListener("hashchange", fire);
  fire();
}
