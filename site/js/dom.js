// Small DOM helpers shared by the views.

export const $ = (selector, root = document) => root.querySelector(selector);

// el("p", { class: "note", text: "Hi" }, child, …). Keys starting with "on"
// add listeners; `true` sets an empty attribute; null and false are skipped.
export function el(tag, props = {}, ...children) {
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

export function button(label, className, onClick) {
  return el("button", { type: "button", class: className, onclick: onClick }, label);
}

export function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

export function plainText(html) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent;
}

export function isTyping(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable]"));
}
