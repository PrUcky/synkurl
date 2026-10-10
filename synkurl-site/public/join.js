// Sends the waitlist form to the Worker at /api/join and shows the result.
// The browser has already checked required fields before this runs.

const form = document.getElementById("waitlist");
const statusEl = document.getElementById("status");
const done = document.getElementById("done");
const button = form.querySelector('button[type="submit"]');

function showError(message) {
  statusEl.dataset.state = "error";
  statusEl.textContent = message;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "";
  statusEl.dataset.state = "";

  const data = new FormData(form);
  const token = data.get("cf-turnstile-response");
  if (!token) {
    showError("The bot check is still loading. Wait a moment, then select Join the waitlist again.");
    return;
  }

  button.disabled = true;
  button.textContent = "Joining…";

  try {
    const response = await fetch("/api/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        phone_type: data.get("phone_type"),
        city: data.get("city"),
        family_size: data.get("family_size"),
        consent: data.get("consent") === "yes",
        token,
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok) {
      if (body.already) {
        document.getElementById("done-title").textContent = "You're already on the waitlist.";
        document.getElementById("done-text").textContent =
          "This email joined earlier, so there's nothing more to do. We'll email you when early access opens.";
      }
      form.hidden = true;
      done.hidden = false;
      done.focus();
      return;
    }

    showError(body.error || "The waitlist couldn't save your details. Try again in a minute.");
  } catch {
    showError("Couldn't reach Synkurl. Check your internet connection and try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Join the waitlist";
  }

  // A bot-check token works once, so get a fresh one before the next try.
  if (window.turnstile) window.turnstile.reset();
});
