// Sending email through Resend's HTTP API (no SDK, just fetch).
//
// Secrets and settings:
//   EMAIL_API_KEY  secret, set in the Cloudflare dashboard. Without it, no email is sent.
//   EMAIL_FROM     in wrangler.jsonc "vars", like "Synkurl <synkurl@synkurl.com>".
//   SITE_URL       in wrangler.jsonc "vars", used to build the links in emails.

import { escapeHtml } from "./http.js";

export const REPLY_TO = "synkurl@synkurl.com";

export function emailReady(env) {
  return Boolean(env.EMAIL_API_KEY);
}

// Returns true if Resend accepted the email. Never logs the address.
export async function sendEmail(env, { to, subject, text, html, replyTo = REPLY_TO, tag }) {
  if (!emailReady(env)) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.EMAIL_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "Synkurl <synkurl@synkurl.com>",
        to: [to],
        subject,
        text,
        html,
        reply_to: replyTo,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.error(JSON.stringify({ event: "email_failed", tag, status: res.status }));
    return res.ok;
  } catch (err) {
    console.error(JSON.stringify({ event: "email_failed", tag, error: err.name }));
    return false;
  }
}

export function siteUrl(env) {
  return String(env.SITE_URL || "https://synkurl.com").replace(/\/+$/, "");
}

// ---------- Email wording ----------
// Each language has its own block, so Hindi can be added later as `hi: {...}`.

const COPY = {
  en: {
    confirm: {
      subject: "Confirm you want to join the Synkurl waitlist",
      lines: [
        "Hello,",
        "Someone, hopefully you, asked to join the Synkurl waitlist with this email address.",
        "Please confirm, so we know it's really you:",
      ],
      confirmLabel: "Yes, confirm my email",
      removeIntro: "Not you? Remove this email from our list:",
      removeLabel: "Not me: remove my email",
      expiry: "The links work for 48 hours. If you do nothing, we delete this sign-up within 7 days.",
      signoff: "Thank you,\nSynkurl",
    },
  },
};

export function confirmEmail(env, { lang = "en", token }) {
  const copy = (COPY[lang] || COPY.en).confirm;
  const base = siteUrl(env);
  const confirmUrl = `${base}/confirm?token=${token}`;
  const removeUrl = `${base}/remove?token=${token}`;

  const text = [
    ...copy.lines,
    "",
    `${copy.confirmLabel}: ${confirmUrl}`,
    "",
    copy.removeIntro,
    removeUrl,
    "",
    copy.expiry,
    "",
    copy.signoff,
  ].join("\n");

  const html = layout(`
    ${copy.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n    ")}
    <p style="margin:28px 0"><a href="${escapeHtml(confirmUrl)}" style="${BUTTON}">${escapeHtml(copy.confirmLabel)}</a></p>
    <p>${escapeHtml(copy.removeIntro)} <a href="${escapeHtml(removeUrl)}" style="color:#101a3d">${escapeHtml(copy.removeLabel)}</a></p>
    <p style="color:#555">${escapeHtml(copy.expiry)}</p>
    <p>${escapeHtml(copy.signoff).replace("\n", "<br>")}</p>`);

  return { subject: copy.subject, text, html };
}

const BUTTON =
  "display:inline-block;padding:12px 22px;border-radius:999px;background:#ffb648;color:#1b1405;text-decoration:none;font-weight:600";

// A simple, plain email layout. Light background so it reads well in every inbox.
export function layout(body) {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f4f5fa;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#101a3d">
  <div style="max-width:520px;margin:0 auto;padding:28px;background:#ffffff;border-radius:12px">
    <p style="margin:0 0 20px;font-weight:700;font-size:18px"><span style="color:#f08a24">&#9679;</span> Synkurl</p>
    ${body}
  </div>
</body>
</html>`;
}
