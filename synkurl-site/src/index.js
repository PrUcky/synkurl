// Synkurl site backend (a Cloudflare Worker).
//
// Cloudflare serves files in /public directly. This code only runs for
// requests that don't match a file, which here means POST /api/join.
//
// POST /api/join
//   1. checks the fields
//   2. checks the Turnstile bot-check token with Cloudflare
//   3. saves the sign-up in the D1 database (one row per email)

const PHONE_TYPES = new Set(["android", "iphone", "both"]);
const FAMILY_SIZES = new Set(["1-2", "3-4", "5-6", "7+"]);
const CONSENT_VERSION = "2026-10-10"; // change when the privacy notice changes
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 4096;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/join") {
      if (request.method !== "POST") {
        return json({ error: "Use POST to join the waitlist." }, 405, { allow: "POST" });
      }
      return handleJoin(request, env);
    }

    // Anything else: let the static files (and 404.html) answer.
    return env.ASSETS.fetch(request);
  },
};

async function handleJoin(request, env) {
  // 1. Read the body (JSON from join.js, or a plain form post if JavaScript is off).
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) {
    return json({ error: "That request is too large." }, 413);
  }

  let input;
  try {
    const type = request.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      input = await request.json();
    } else {
      const form = await request.formData();
      input = Object.fromEntries(form);
      input.consent = form.get("consent") === "yes";
      input.token = form.get("cf-turnstile-response");
    }
  } catch {
    return json({ error: "The form data couldn't be read. Reload the page and try again." }, 400);
  }

  // 2. Check and tidy each field.
  const email = String(input.email || "").trim().toLowerCase();
  const phoneType = String(input.phone_type || "");
  const city = String(input.city || "").trim().replace(/\s+/g, " ");
  const familySize = String(input.family_size || "");
  const token = String(input.token || "");

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return json({ error: "Enter a valid email address, like you@example.com." }, 400);
  }
  if (!PHONE_TYPES.has(phoneType)) {
    return json({ error: "Choose your phone: Android, iPhone or both." }, 400);
  }
  if (city.length < 2 || city.length > 80) {
    return json({ error: "Enter your city (2 to 80 characters)." }, 400);
  }
  if (!FAMILY_SIZES.has(familySize)) {
    return json({ error: "Choose how many people are in your family." }, 400);
  }
  if (input.consent !== true) {
    return json({ error: "Tick the consent box so we're allowed to keep your details." }, 400);
  }

  // 3. Bot check.
  if (!env.TURNSTILE_SECRET) {
    console.error("TURNSTILE_SECRET is not set");
    return json({ error: "The waitlist isn't set up yet. Try again later." }, 500);
  }
  let passed = false;
  try {
    passed = await verifyTurnstile(token, env.TURNSTILE_SECRET, request.headers.get("CF-Connecting-IP"));
  } catch (err) {
    console.error("turnstile_unreachable", err.message);
    return json({ error: "The bot check couldn't be completed. Try again in a minute." }, 503);
  }
  if (!passed) {
    return json({ error: "The bot check didn't pass. Reload the page and try again." }, 403);
  }

  // 4. Save. The UNIQUE email column means a second sign-up with the same email changes nothing.
  try {
    const result = await env.DB.prepare(
      `INSERT INTO waitlist (email, phone_type, city, family_size, consent_version)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(email) DO NOTHING`
    )
      .bind(email, phoneType, city, familySize, CONSENT_VERSION)
      .run();

    const added = result.meta.changes === 1;
    // Log the event, never the email: logs should hold no personal data.
    console.log(JSON.stringify({ event: "waitlist_join", added }));
    return json({ ok: true, already: !added }, added ? 201 : 200);
  } catch (err) {
    console.error("db_error", err.message);
    return json({ error: "The waitlist couldn't save your details. Try again in a minute." }, 500);
  }
}

async function verifyTurnstile(token, secret, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const outcome = await res.json();
  return outcome.success === true;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}
