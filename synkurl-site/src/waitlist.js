// The waitlist: joining, confirming by email, removing, and the daily clean-up.
//
// How confirming works ("double opt-in"):
//   1. POST /api/join saves the row as "pending" and emails a secret link code.
//      We keep only a SHA-256 fingerprint ("hash") of the code, never the code.
//   2. The email has two links: /confirm?token=… and /remove?token=….
//   3. Opening a link only shows a page with a button. Email scanners open
//      links by themselves, so nothing changes until the button is pressed.
//   4. The button sends POST to the same address, and we redirect to a result page.

import { InputError, checkBot, checkEmail, charLength, cleanText, isFormPost, isTicked, normaliseEmail, readInput, withinRateLimit } from "./checks.js";
import { confirmEmail, emailReady, sendEmail } from "./email.js";
import { json, messagePage, redirect } from "./http.js";

// Change when the privacy notice changes. public/privacy.html shows the same value (a test checks).
export const CONSENT_VERSION = "2026-10-10.3";

const PHONE_TYPES = new Set(["android", "iphone", "both", "other"]);
const FAMILY_SIZES = new Set(["1-2", "3-4", "5-6", "7+", "not-sure"]);
const DEVICE_PICKS = new Set(["arch", "album", "pebble", "not-sure"]);
const LANGS = new Set(["en"]);

// The answers the first version of the table allowed (before migration 0002).
const OLD_PHONE_TYPES = new Set(["android", "iphone", "both"]);
const OLD_FAMILY_SIZES = new Set(["1-2", "3-4", "5-6", "7+"]);

const TOKEN_HOURS = 48;
const RESEND_MINUTES = 10;
const PENDING_DAYS = 7;

// ---------- POST /api/join ----------

export async function handleJoin(request, env) {
  const asForm = isFormPost(request);
  try {
    if (!(await withinRateLimit(env, "join", request))) {
      throw new InputError("Too many tries in a short time. Wait a minute, then try again.", 429);
    }
    const input = await readInput(request);
    const fields = checkJoinFields(input);
    await checkBot(env, input.token, request);
    const outcome = await saveSignUp(env, fields);
    console.log(JSON.stringify({ event: "waitlist_join", outcome: outcome.next }));
    return joinReply(asForm, outcome);
  } catch (err) {
    if (err instanceof InputError) return errorReply(asForm, err.message, err.status);
    console.error("join_error", err.message);
    return errorReply(asForm, "The waitlist couldn't save your details. Try again in a minute.", 500);
  }
}

export function checkJoinFields(input) {
  const email = normaliseEmail(input.email);
  checkEmail(email);

  const phoneType = String(input.phone_type ?? "");
  if (!PHONE_TYPES.has(phoneType)) throw new InputError("Choose your phone: Android, iPhone, both or other.");

  const city = cleanText(input.city);
  if (charLength(city) < 2 || charLength(city) > 80 || !/\p{L}/u.test(city)) {
    throw new InputError("Enter your city (2 to 80 characters).");
  }

  const familySize = String(input.family_size ?? "");
  if (!FAMILY_SIZES.has(familySize)) throw new InputError("Choose how many people are in your family.");

  const pick = String(input.device_pick ?? "");
  if (pick !== "" && !DEVICE_PICKS.has(pick)) throw new InputError("Choose one of the design ideas, or leave it empty.");
  const devicePick = pick === "" ? null : pick;

  if (!isTicked(input.is_adult)) throw new InputError("Tick the box to confirm you're 18 or older.");
  if (!isTicked(input.consent)) throw new InputError("Tick the consent box so we're allowed to keep your details.");

  const lang = LANGS.has(input.lang) ? input.lang : "en";

  return { email, phoneType, city, familySize, devicePick, lang };
}

// Returns { next } where next is:
//   "check-email": we sent (or recently sent) a confirmation email
//   "joined":      saved without email confirmation (email not set up yet)
//   "already":     this email is already on the waitlist
async function saveSignUp(env, f) {
  let existing;
  try {
    existing = await env.DB.prepare("SELECT id, status FROM waitlist WHERE email = ?1").bind(f.email).first();
  } catch (err) {
    if (isOldTable(err)) return saveSignUpOldTable(env, f);
    throw err;
  }

  if (existing && existing.status !== "pending") return { next: "already" };

  if (!emailReady(env)) {
    // Email isn't set up yet: keep the sign-up without asking for confirmation.
    if (existing) {
      await env.DB.prepare(
        `UPDATE waitlist SET status = 'single_opt_in', token_hash = NULL, token_expires_at = NULL WHERE id = ?1`
      ).bind(existing.id).run();
      return { next: "joined" };
    }
    const res = await env.DB.prepare(
      `INSERT INTO waitlist (email, phone_type, city, family_size, device_pick, is_adult, lang, status, consent_version)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, 'single_opt_in', ?7)
       ON CONFLICT(email) DO NOTHING`
    ).bind(f.email, f.phoneType, f.city, f.familySize, f.devicePick, f.lang, CONSENT_VERSION).run();
    return { next: res.meta.changes === 1 ? "joined" : "already" };
  }

  const token = newToken();
  const tokenHash = await sha256(token);
  const now = isoTime();
  const expires = isoTime(TOKEN_HOURS * 3600 * 1000);
  let rowId;

  if (existing) {
    // Still pending: send again, but at most once every 10 minutes per email.
    // The WHERE clause "claims" the send, so two taps at once can't send twice.
    const cutoff = isoTime(-RESEND_MINUTES * 60 * 1000);
    const res = await env.DB.prepare(
      `UPDATE waitlist
       SET token_hash = ?1, token_expires_at = ?2, email_sent_at = ?3,
           phone_type = ?4, city = ?5, family_size = ?6, device_pick = ?7,
           is_adult = 1, lang = ?8, consent_version = ?9
       WHERE id = ?10 AND status = 'pending' AND (email_sent_at IS NULL OR email_sent_at < ?11)`
    ).bind(tokenHash, expires, now, f.phoneType, f.city, f.familySize, f.devicePick, f.lang, CONSENT_VERSION, existing.id, cutoff).run();
    if (res.meta.changes !== 1) return { next: "check-email", recent: true };
    rowId = existing.id;
  } else {
    const res = await env.DB.prepare(
      `INSERT INTO waitlist (email, phone_type, city, family_size, device_pick, is_adult, lang, status,
                             token_hash, token_expires_at, email_sent_at, consent_version)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, 'pending', ?7, ?8, ?9, ?10)
       ON CONFLICT(email) DO NOTHING
       RETURNING id`
    ).bind(f.email, f.phoneType, f.city, f.familySize, f.devicePick, f.lang, tokenHash, expires, now, CONSENT_VERSION).first();
    if (!res) return { next: "check-email", recent: true }; // the same email joined a moment ago
    rowId = res.id;
  }

  const message = confirmEmail(env, { lang: f.lang, token });
  const sent = await sendEmail(env, { to: f.email, ...message, tag: "confirm" });
  if (!sent) {
    // Free the 10-minute slot so the person can simply try again.
    await env.DB.prepare("UPDATE waitlist SET email_sent_at = NULL WHERE id = ?1").bind(rowId).run();
    throw new InputError("We saved your details but couldn't send the confirmation email. Try again in a few minutes.", 502);
  }
  return { next: "check-email" };
}

// The site may go live a little before migration 0002 is run in the D1 console.
// Until then, save sign-ups the old way (no email confirmation), so nothing breaks.
async function saveSignUpOldTable(env, f) {
  if (!OLD_PHONE_TYPES.has(f.phoneType) || !OLD_FAMILY_SIZES.has(f.familySize)) {
    throw new InputError("The waitlist is being updated. Try again in a few minutes.", 503);
  }
  console.warn("waitlist_old_table: run migration 0002");
  const res = await env.DB.prepare(
    `INSERT INTO waitlist (email, phone_type, city, family_size, consent_version)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(email) DO NOTHING`
  ).bind(f.email, f.phoneType, f.city, f.familySize, CONSENT_VERSION).run();
  return { next: res.meta.changes === 1 ? "joined" : "already" };
}

function isOldTable(err) {
  return /no such column|has no column named/i.test(String(err?.message));
}

function joinReply(asForm, outcome) {
  if (asForm) {
    if (outcome.next === "check-email") return redirect(outcome.recent ? "/check-email?sent=recent" : "/check-email");
    if (outcome.next === "already") return messagePage("You're already on the waitlist.", "This email joined earlier, so there's nothing more to do.");
    return messagePage("You're on the waitlist.", "We'll email you when early access opens.", 201);
  }
  return json({ ok: true, next: outcome.next, recent: Boolean(outcome.recent) }, outcome.next === "already" ? 200 : 201);
}

export function errorReply(asForm, message, status) {
  if (asForm) return messagePage("That didn't work.", message, status);
  return json({ error: message }, status);
}

// ---------- POST /confirm and POST /remove ----------

export async function handleConfirm(request, env) {
  const row = await findByToken(request, env);
  if (!row) return redirect("/link-expired");
  if (row.token_expires_at < isoTime()) return redirect("/link-expired");

  const res = await env.DB.prepare(
    `UPDATE waitlist
     SET status = 'confirmed', confirmed_at = ?1, token_hash = NULL, token_expires_at = NULL
     WHERE id = ?2 AND token_hash = ?3 AND status = 'pending'`
  ).bind(isoTime(), row.id, row.token_hash).run();
  if (res.meta.changes !== 1) return redirect("/link-expired");

  console.log(JSON.stringify({ event: "waitlist_confirm" }));
  return redirect("/confirmed");
}

// "Not me: remove my email" deletes the row completely. This works even after
// the 48 hours, because deleting someone's details is always allowed.
export async function handleRemove(request, env) {
  const row = await findByToken(request, env);
  if (!row) return redirect("/link-expired?from=remove");

  await env.DB.prepare("DELETE FROM waitlist WHERE id = ?1 AND token_hash = ?2").bind(row.id, row.token_hash).run();
  console.log(JSON.stringify({ event: "waitlist_remove" }));
  return redirect("/removed");
}

async function findByToken(request, env) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") || "";
  if (!token) {
    try {
      token = String((await request.formData()).get("token") || "");
    } catch {
      token = "";
    }
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  try {
    return await env.DB.prepare(
      "SELECT id, token_hash, token_expires_at FROM waitlist WHERE token_hash = ?1 AND status = 'pending'"
    ).bind(await sha256(token)).first();
  } catch (err) {
    console.error("token_lookup_error", err.message);
    return null;
  }
}

// ---------- Daily clean-up (Cron Trigger) ----------

// Deletes sign-ups that were never confirmed within 7 days.
// Never touches "confirmed" or "single_opt_in" rows.
export async function cleanUpPending(env) {
  try {
    const cutoff = isoTime(-PENDING_DAYS * 24 * 3600 * 1000);
    const res = await env.DB.prepare("DELETE FROM waitlist WHERE status = 'pending' AND created_at < ?1").bind(cutoff).run();
    console.log(JSON.stringify({ event: "waitlist_cleanup", deleted: res.meta.changes }));
    return res.meta.changes;
  } catch (err) {
    console.error("cleanup_error", err.message);
    return 0;
  }
}

// ---------- Small helpers ----------

// 32 random bytes, written in base64url (letters, digits, - and _). 43 characters.
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Time as text in the same shape the database uses: 2026-10-10T09:30:00Z
export function isoTime(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}
