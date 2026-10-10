// The investor contact form: POST /api/investors
//
// Saves each message in its own table (investor_contacts), emails the founder
// (the address is the NOTIFY_EMAIL secret, never in the code), and sends the
// investor a short thank-you. The deck is never on the site: "Please send me
// the deck" only marks the message, and the founder replies by hand.

import { InputError, checkBot, checkEmail, charLength, cleanText, isFormPost, isTicked, normaliseEmail, readInput, withinRateLimit } from "./checks.js";
import { emailReady, layout, sendEmail } from "./email.js";
import { escapeHtml, json, messagePage } from "./http.js";
import { CONSENT_VERSION, errorReply, isoTime } from "./waitlist.js";

const TYPES = { angel: "Angel", vc: "VC fund", accelerator: "Accelerator", other: "Other" };
const PER_EMAIL_PER_DAY = 3;
const KEEP_DAYS = 730; // "up to 2 years" in the privacy notice

export async function handleInvestorContact(request, env) {
  const asForm = isFormPost(request);
  try {
    if (!(await withinRateLimit(env, "investor", request))) {
      throw new InputError("Too many tries in a short time. Wait a minute, then try again.", 429);
    }
    const input = await readInput(request);
    const fields = checkInvestorFields(input);
    await checkBot(env, input.token, request);
    await saveAndNotify(env, fields);
    console.log(JSON.stringify({ event: "investor_contact" }));
    if (asForm) return messagePage("Thank you.", "The founder will reply personally.", 201);
    return json({ ok: true }, 201);
  } catch (err) {
    if (err instanceof InputError) return errorReply(asForm, err.message, err.status);
    console.error("investor_error", err.message);
    return errorReply(asForm, "Your message couldn't be sent. Try again in a minute, or write to synkurl@synkurl.com.", 500);
  }
}

export function checkInvestorFields(input) {
  const name = cleanText(input.name);
  if (charLength(name) < 2 || charLength(name) > 100 || !/\p{L}/u.test(name)) {
    throw new InputError("Enter your name (2 to 100 characters).");
  }

  const email = normaliseEmail(input.email);
  checkEmail(email);

  const organisation = cleanText(input.organisation);
  if (charLength(organisation) > 120) throw new InputError("Keep the organisation or fund name under 120 characters.");

  const type = String(input.investor_type ?? "");
  if (!(type in TYPES)) throw new InputError("Choose which describes you: Angel, VC fund, Accelerator or Other.");

  const link = String(input.link ?? "").trim();
  if (link && !isHttpsUrl(link)) {
    throw new InputError("The LinkedIn or website link must start with https://, or leave it empty.");
  }

  // Keep line breaks in the message, drop other control characters.
  const message = String(input.message ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/\r\n?/g, "\n").trim();
  if (charLength(message) < 20 || charLength(message) > 1000) {
    throw new InputError("Write a message of 20 to 1,000 characters.");
  }

  if (!isTicked(input.consent)) throw new InputError("Tick the consent box so we're allowed to keep your message.");

  return { name, email, organisation: organisation || null, type, link: link || null, message, wantsDeck: isTicked(input.wants_deck) };
}

function isHttpsUrl(value) {
  if (value.length > 300) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function saveAndNotify(env, f) {
  let id;
  try {
    // About 3 messages a day from the same email address.
    const recent = await env.DB.prepare("SELECT count(*) AS n FROM investor_contacts WHERE email = ?1 AND created_at > ?2")
      .bind(f.email, isoTime(-24 * 3600 * 1000))
      .first();
    if (recent.n >= PER_EMAIL_PER_DAY) {
      throw new InputError("You've sent us 3 messages today, thank you. The founder will reply; you can write again tomorrow, or email synkurl@synkurl.com.", 429);
    }
    const saved = await env.DB.prepare(
      `INSERT INTO investor_contacts (name, email, organisation, investor_type, link, message, wants_deck, consent_version)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id`
    ).bind(f.name, f.email, f.organisation, f.type, f.link, f.message, f.wantsDeck ? 1 : 0, CONSENT_VERSION).first();
    id = saved.id;
  } catch (err) {
    if (err instanceof InputError) throw err;
    if (/no such table/i.test(String(err.message))) {
      console.warn("investor_contacts table missing: run migration 0003");
      throw new InputError("Your message couldn't be sent right now. Please write to synkurl@synkurl.com.", 503);
    }
    throw err;
  }

  // If email isn't set up yet, the message is saved and the person sees the same thank-you.
  if (!emailReady(env)) return;

  if (env.NOTIFY_EMAIL) {
    const sent = await sendEmail(env, { to: env.NOTIFY_EMAIL, ...founderEmail(f), replyTo: f.email, tag: "investor_notify" });
    if (sent) await env.DB.prepare("UPDATE investor_contacts SET notified = 1 WHERE id = ?1").bind(id).run();
  } else {
    console.warn("NOTIFY_EMAIL is not set: investor message saved without a notification");
  }
  await sendEmail(env, { to: f.email, ...thankYouEmail(f), tag: "investor_thanks" });
}

function founderEmail(f) {
  const rows = [
    ["Name", f.name],
    ["Email", f.email],
    ["Organisation or fund", f.organisation || "(not given)"],
    ["Type", TYPES[f.type]],
    ["LinkedIn or website", f.link || "(not given)"],
    ["Wants the deck", f.wantsDeck ? "Yes" : "No"],
  ];
  const text = [
    "New message from the investors page on synkurl.com.",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Message:",
    f.message,
    "",
    "Reply to this email to answer them directly.",
  ].join("\n");
  const html = layout(`
    <p>New message from the investors page on synkurl.com.</p>
    <table style="border-collapse:collapse;margin:16px 0">${rows
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
      .join("")}</table>
    <p style="white-space:pre-wrap;padding:12px;background:#f4f5fa;border-radius:8px">${escapeHtml(f.message)}</p>
    <p style="color:#555">Reply to this email to answer them directly.</p>`);
  return { subject: `Investor message from ${f.name} (${TYPES[f.type]})`, text, html };
}

function thankYouEmail(f) {
  const lines = [`Hello ${f.name},`, "Thanks for getting in touch with Synkurl. The founder will reply personally."];
  if (f.wantsDeck) lines.push("We've noted that you'd like our deck.");
  const text = `${lines.join("\n\n")}\n\nSynkurl\nsynkurl@synkurl.com`;
  const html = layout(`${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n    ")}
    <p>Synkurl<br><a href="mailto:synkurl@synkurl.com" style="color:#101a3d">synkurl@synkurl.com</a></p>`);
  return { subject: "Thanks for getting in touch with Synkurl", text, html };
}

// Part of the daily clean-up: investor messages are kept for up to 2 years.
export async function cleanUpInvestorContacts(env) {
  try {
    const res = await env.DB.prepare("DELETE FROM investor_contacts WHERE created_at < ?1")
      .bind(isoTime(-KEEP_DAYS * 24 * 3600 * 1000))
      .run();
    console.log(JSON.stringify({ event: "investor_cleanup", deleted: res.meta.changes }));
  } catch (err) {
    console.error("investor_cleanup_error", err.message);
  }
}
