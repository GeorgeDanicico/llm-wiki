// The daily pick and random questions for the public site.
//
// The question of the day depends only on the local date and the question
// bank, so every visitor sees the same one without a server or a scheduled
// job. Questions are dealt from a shuffled deck: within one cycle of N days
// (N = number of questions) no question repeats. Adding or removing questions
// reshuffles the deck, so a deploy can change the rest of that day's pick.
//
// The topic of the day is the wiki page that supports the daily question.

// 32-bit FNV-1a hash of a string.
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// mulberry32: a small, fast PRNG returning floats in [0, 1).
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle into a new array.
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// "YYYY-MM-DD" for the visitor's local date.
export function dayKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Days since 1970-01-01 for a "YYYY-MM-DD" key.
export function dayNumber(key) {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// The question of the day for a date key, or null without questions.
export function dailyCard(cards, key) {
  if (!cards.length) return null;
  // Sorting by ID makes the pick independent of file and build order.
  const deck = [...cards].sort(byId);
  const day = dayNumber(key);
  const cycle = Math.floor(day / deck.length);
  const position = day - cycle * deck.length;
  return shuffle(deck, mulberry32(hashString(`llm-wiki-daily:${cycle}`)))[position];
}

// A random question, avoiding `excludeId` when there is another choice.
export function randomCard(cards, excludeId = null, random = Math.random) {
  const pool = cards.length > 1 ? cards.filter((card) => card.id !== excludeId) : cards;
  if (!pool.length) return null;
  return pool[Math.floor(random() * pool.length)];
}
