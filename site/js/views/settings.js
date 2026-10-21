// Settings: deck size and goals, sync, export and import, and reset.

import { button, el, plural } from "../dom.js";
import { SETTING_LIMITS } from "../lib/store.js";
import { syncPanel } from "./sync.js";

const FIELDS = [
  ["dailySize", "Cards per day", "The most cards in one day's deck."],
  ["newPerDay", "New cards per day", "Cards you have not seen yet, added to each day's deck."],
  ["dailyGoal", "Daily goal", "Reviews of any kind that keep your streak, if the deck alone is smaller."],
];

export function renderSettings(app, route, message = "") {
  // Filled in after rendering, so screen readers announce it.
  const status = el("p", { class: "status-line", role: "status" });
  const say = (text) => {
    status.textContent = text;
  };

  const fields = FIELDS.map(([key, label, hint]) => {
    const [min, max] = SETTING_LIMITS[key];
    const input = el("input", {
      type: "number",
      id: `setting-${key}`,
      min,
      max,
      step: 1,
      inputmode: "numeric",
      value: app.store.setting(key),
      "aria-describedby": `setting-${key}-hint`,
    });
    input.addEventListener("change", () => {
      const value = Number(input.value);
      if (!Number.isInteger(value) || value < min || value > max) {
        input.value = app.store.setting(key);
        say(`${label} must be a whole number from ${min} to ${max}.`);
        return;
      }
      app.store.setSetting(key, value);
      say(`${label} saved.`);
    });
    return el(
      "div",
      { class: "field" },
      el("label", { for: input.id, text: label }),
      input,
      el("p", { class: "hint", id: `setting-${key}-hint`, text: hint })
    );
  });

  const gate = el("input", {
    type: "checkbox",
    id: "setting-onlyLearnedPages",
    "aria-describedby": "setting-onlyLearnedPages-hint",
  });
  gate.checked = app.store.setting("onlyLearnedPages");
  gate.addEventListener("change", () => {
    app.store.setSetting("onlyLearnedPages", gate.checked);
    say(gate.checked ? "New cards now come only from pages you have learned." : "New cards now come from every page.");
  });
  fields.push(
    el(
      "div",
      { class: "field" },
      el("label", { class: "checkbox", for: gate.id }, gate, el("span", { text: "New cards only from learned pages" })),
      el("p", {
        class: "hint",
        id: "setting-onlyLearnedPages-hint",
        text: "Questions join the daily review after you mark their page as learned in Learn. Turn this off to draw new cards from every page.",
      })
    )
  );

  const fileInput = el("input", { type: "file", accept: "application/json,.json", hidden: true });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    let result;
    try {
      result = app.store.importData(JSON.parse(await file.text()));
    } catch {
      say(`Could not read ${file.name}: it is not a progress export.`);
      return;
    }
    const skipped = result.invalid ? ` ${plural(result.invalid, "row")} skipped as invalid.` : "";
    renderSettings(
      app,
      route,
      (result.changed ? `Imported ${plural(result.changed, "new or newer row")}.` : "Nothing new in that file.") + skipped
    );
  });

  const connected = app.sync.connected && app.sync.status().state !== "unauthorized";
  const storage = !app.store.persistent
    ? "This browser is blocking storage, so progress lasts only until you close the tab. Export it to keep it."
    : connected
      ? "Progress is saved in this browser and synced to your study server. Export it to keep your own copy."
      : "Progress is stored only in this browser. Export it to keep a copy or move it to another device.";
  const resetQuestion = connected
    ? "Forget the progress stored in this browser? This device is connected, so it downloads your progress from the server again; disconnect first to start empty. Changes not yet uploaded are lost."
    : "Forget all study progress stored in this browser? Export it first if you may want it back.";

  app.view.replaceChildren(
    el(
      "section",
      { class: "panel", "aria-labelledby": "settings-title" },
      el("h2", { id: "settings-title", tabindex: "-1", text: "Settings" }),
      el("h3", { text: "Daily review" }),
      el("div", { class: "fields" }, fields)
    ),
    syncPanel(app),
    el(
      "section",
      { class: "panel", "aria-labelledby": "data-title" },
      el("h2", { id: "data-title", text: "Your progress" }),
      el("p", { class: "lead", text: storage }),
      el(
        "div",
        { class: "actions start" },
        button("Export progress", "secondary", () => exportProgress(app, say)),
        button("Import progress", "secondary", () => fileInput.click()),
        button("Reset progress on this device", "danger", () => {
          if (!confirm(resetQuestion)) return;
          app.store.reset();
          // A connected device downloads its progress again.
          app.sync.syncNow();
          renderSettings(app, route, "Progress on this device was reset.");
        })
      ),
      fileInput,
      el("p", { class: "hint", text: "Importing merges a file into this device's progress; newer rows win, so nothing is lost by importing twice." }),
      status
    )
  );
  if (message) say(message);
}

function exportProgress(app, say) {
  const data = app.store.exportData();
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: `llm-wiki-study-${app.today()}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say(`Exported ${plural(data.reviews.length, "review")}.`);
}
