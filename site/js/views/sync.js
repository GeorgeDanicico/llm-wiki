// Sync UI: the header status and the "Sync across devices" panel in Settings.

import { $, el, button, plural } from "../dom.js";
import { serverAvailable } from "../lib/sync.js";

// Header text for a sync status, or null to hide it (no token: local-only).
export function statusText(status) {
  const pending = status.pending ? ` · ${status.pending} pending` : "";
  switch (status.state) {
    case "off":
      return null;
    case "syncing":
      return status.pending ? "Saving…" : "Syncing…";
    case "offline":
      return `Offline${pending}`;
    case "error":
      return `Sync error${pending}`;
    case "unauthorized":
      return "Disconnected";
    default:
      return status.pending ? "Saving…" : "Synced";
  }
}

export function renderSyncStatus(app) {
  const link = $("#sync-status");
  const update = () => {
    const status = app.sync.status();
    const text = statusText(status);
    link.hidden = text == null;
    link.textContent = text ?? "";
    link.dataset.state = status.state === "idle" && status.pending ? "syncing" : status.state;
    link.title = status.error ? `Sync: ${status.error}` : "Sync settings";
  };
  app.sync.subscribe(update);
  update();
}

function timeAgo(date) {
  if (!date) return "not yet";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// The Settings panel. It renders at once from the stored state, then checks
// whether this copy of the site has a progress server (GitHub Pages has none).
export function syncPanel(app) {
  const body = el("div", { class: "sync-body" });
  const message = el("p", { class: "status-line", role: "status" });
  const say = (text) => {
    message.textContent = text;
  };
  const panel = el(
    "section",
    { class: "panel", "aria-labelledby": "sync-title" },
    el("h2", { id: "sync-title", text: "Sync across devices" }),
    body,
    message
  );
  let available = null;
  let busy = false;

  const tokenField = () => {
    const input = el("input", {
      type: "password",
      id: "sync-token",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      "aria-describedby": "sync-token-hint",
    });
    const connect = el("button", { type: "submit", class: "primary" }, "Test and connect");
    const form = el(
      "form",
      { class: "token-form" },
      el("label", { for: input.id, text: "Device token" }),
      el("div", { class: "token-row" }, input, connect),
      el("p", {
        class: "hint",
        id: "sync-token-hint",
        text: "Paste this device's token once. Tokens are created on the server; only their hashes are stored there. Export and import never include the token.",
      })
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      connect.disabled = true;
      say("Testing the connection…");
      const result = await app.sync.connect(input.value);
      busy = false;
      connect.disabled = false;
      if (result.ok) {
        input.value = "";
        say(`Connected${result.device ? ` as ${result.device}` : ""}. This device's progress is uploading.`);
      } else if (result.kind === "unauthorized") {
        say("The server did not accept that token.");
      } else if (result.kind === "offline") {
        say("Could not reach the server. Check the connection and try again.");
      } else {
        say(`Could not connect: ${result.message}`);
      }
      update();
    });
    return form;
  };

  function update() {
    if (!panel.isConnected && body.childElementCount) {
      unsubscribe();
      return;
    }
    // Keep the token form (and anything typed in it) while it is still needed.
    const status = app.sync.status();
    const keepForm = $("#sync-token", body) && (!status.connected || status.state === "unauthorized");
    if (keepForm) return;

    if (status.connected && status.state !== "unauthorized") {
      const details = [
        status.device ? `Connected as ${status.device}` : "Connected",
        `last synced ${timeAgo(status.lastSynced)}`,
        status.pending ? `${plural(status.pending, "change")} waiting to upload` : "nothing waiting to upload",
      ];
      body.replaceChildren(
        el("p", { class: "lead", text: `${details.join(" · ")}.` }),
        status.error ? el("p", { class: "hint warn-text", text: `Last error: ${status.error}` }) : "",
        el(
          "div",
          { class: "actions start" },
          button("Sync now", "secondary", async () => {
            say("Syncing…");
            await app.sync.syncNow();
            const after = app.sync.status();
            say(after.state === "idle" ? "Synced." : `Not synced: ${statusText(after)}.`);
          }),
          button("Disconnect this device", "secondary", () => {
            if (!confirm("Stop syncing this device? Its progress stays in this browser; you can reconnect with its token later.")) return;
            app.sync.disconnect();
            say("Disconnected. Progress on this device stays in this browser.");
          })
        )
      );
      return;
    }

    const intro =
      status.state === "unauthorized"
        ? el("p", {
            class: "notice warn",
            role: "status",
            text: "This device was disconnected: the server no longer accepts its token. Paste a new token to reconnect. Nothing on this device was lost.",
          })
        : el("p", {
            class: "lead",
            text: "Connect this device to your study server to share one review log, schedule, and streak between your phone and laptop. Reviewing still works offline.",
          });
    if (available === false && status.state !== "unauthorized") {
      body.replaceChildren(
        el("p", {
          class: "lead",
          text: "This copy of the site has no progress server (for example, the GitHub Pages copy), so progress stays in this browser. Use the copy on your server to sync, or move progress with Export and Import.",
        })
      );
      return;
    }
    body.replaceChildren(intro, available === null ? el("p", { class: "hint", text: "Checking for the progress server…" }) : tokenField());
  }

  const unsubscribe = app.sync.subscribe(update);
  update();
  serverAvailable().then((ok) => {
    available = ok;
    update();
  });
  return panel;
}
