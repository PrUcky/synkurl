// Shared behaviour for the waitlist and investor forms:
// - loads the Turnstile bot check, and explains plainly if it's blocked
// - shows a "Did you mean …?" hint for email typos
// - stops double taps, shows a loading state, and offers "Try again" if it's too slow

import { suggestEmail } from "/email-hint.js";

const TIMEOUT_MS = 15000;
const BOT_LOAD_WAIT_MS = 12000;
const BOT_PROBLEM =
  "The bot check couldn't load. An ad-blocker, a privacy setting or an old browser can cause this. " +
  "Try turning the blocker off for this page, or use another browser. " +
  "Or email synkurl@synkurl.com and we'll take your details by hand.";

let tokenWaiters = [];
let statusEl = null;

// Turnstile calls these by name (see data-callback on the widget).
window.synkurlTurnstileDone = () => {
  tokenWaiters.forEach((resolve) => resolve(true));
  tokenWaiters = [];
  if (statusEl?.dataset.kind === "bot") clearStatus();
};
window.synkurlTurnstileError = () => {
  showStatus(BOT_PROBLEM, "bot");
  return true;
};
window.synkurlTurnstileExpired = () => window.turnstile?.reset();

function loadTurnstile() {
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  script.async = true;
  script.onerror = () => showStatus(BOT_PROBLEM, "bot");
  document.head.append(script);
  setTimeout(() => {
    if (!window.turnstile) showStatus(BOT_PROBLEM, "bot");
  }, BOT_LOAD_WAIT_MS);
}

function waitForToken(ms = 10000) {
  return new Promise((resolve) => {
    tokenWaiters.push(resolve);
    setTimeout(() => resolve(false), ms);
  });
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.dataset.state = "";
  statusEl.dataset.kind = "";
}

function showStatus(message, kind = "error", retry) {
  if (!statusEl) return;
  statusEl.textContent = "";
  statusEl.dataset.state = "error";
  statusEl.dataset.kind = kind;
  const p = document.createElement("p");
  p.textContent = message;
  statusEl.append(p);
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-ghost btn-small";
    button.textContent = "Try again";
    button.addEventListener("click", retry);
    statusEl.append(button);
  }
}

function setUpEmailHint(form) {
  const input = form.querySelector('input[type="email"]');
  const hint = form.querySelector(".hint-box");
  if (!input || !hint) return;

  const update = () => {
    const suggestion = suggestEmail(input.value);
    hint.textContent = "";
    hint.hidden = !suggestion;
    if (!suggestion) return;
    hint.append("Did you mean ");
    const use = document.createElement("button");
    use.type = "button";
    use.className = "link-button";
    use.textContent = suggestion;
    use.addEventListener("click", () => {
      input.value = suggestion;
      hint.hidden = true;
      input.focus();
    });
    hint.append(use, "? If not, just carry on.");
  };
  input.addEventListener("change", update);
  input.addEventListener("blur", update);
}

// collect(formData) returns the JSON body. onSuccess(body) runs after a good answer.
export function setUpForm({ form, collect, onSuccess }) {
  statusEl = form.querySelector('[role="status"]');
  const button = form.querySelector('button[type="submit"]');
  let busy = false;

  setUpEmailHint(form);
  loadTurnstile();

  const retry = async () => {
    clearStatus();
    window.turnstile?.reset();
    await waitForToken();
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { cancelable: true }));
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return; // a second tap while sending does nothing
    clearStatus();

    const data = new FormData(form);
    const token = data.get("cf-turnstile-response");
    if (!token) {
      if (window.turnstile) showStatus("The bot check is still running. Wait a moment, then try again.", "bot");
      else showStatus(BOT_PROBLEM, "bot");
      return;
    }

    busy = true;
    button.disabled = true;
    button.textContent = button.dataset.busyLabel || "Sending…";
    form.setAttribute("aria-busy", "true");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let finished = false;

    try {
      const response = await fetch(form.dataset.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...collect(data), token }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        finished = true;
        onSuccess(body);
        return;
      }
      showStatus(body.error || "Something went wrong. Try again in a minute.");
    } catch (err) {
      if (err.name === "AbortError") {
        showStatus("This is taking too long. Check your internet connection, then try again.", "timeout", retry);
      } else {
        showStatus("Couldn't reach Synkurl. Check your internet connection and try again.", "network", retry);
      }
    } finally {
      clearTimeout(timer);
      busy = false;
      button.disabled = false;
      button.textContent = button.dataset.label;
      form.removeAttribute("aria-busy");
      // A bot-check answer works only once, so get a fresh one for the next try.
      if (!finished) window.turnstile?.reset();
    }
  });
}
