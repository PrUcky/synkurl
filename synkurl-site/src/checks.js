// Checks shared by the waitlist form and the investor form.

import { isDisposable } from "./disposable-domains.js";

export const MAX_BODY_BYTES = 8192;
const EMAIL_PATTERN = /^[^\s@<>"(),;:]{1,64}@(?:[a-z0-9-]+\.)+[a-z]{2,63}$/;

export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Was this sent by a plain HTML form (JavaScript off) rather than by our script?
export function isFormPost(request) {
  const type = request.headers.get("content-type") || "";
  return !type.includes("application/json");
}

// Reads the body as an object, from JSON (our scripts) or a plain form post.
export async function readInput(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new InputError("That request is too large.", 413);
  try {
    if (!isFormPost(request)) {
      const data = await request.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not an object");
      return data;
    }
    const form = await request.formData();
    const data = Object.fromEntries(form);
    if (!data.token) data.token = form.get("cf-turnstile-response");
    return data;
  } catch {
    throw new InputError("The form data couldn't be read. Reload the page and try again.");
  }
}

// Tick boxes arrive as true (JSON) or "yes"/"on" (plain form).
export function isTicked(value) {
  return value === true || value === "yes" || value === "on";
}

// Trim and lowercase only. Dots and +tags stay, because they can be part of a real address.
export function normaliseEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function checkEmail(email) {
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new InputError("Enter a valid email address, like you@example.com.");
  }
  if (isDisposable(email.split("@")[1])) {
    throw new InputError("That looks like a throwaway email address. Use an address you'll check, so you get our email.");
  }
}

// Tidies free text: drops control characters and squeezes spaces.
export function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Length in characters (so Hindi and other scripts count correctly).
export function charLength(text) {
  return [...text].length;
}

// The rate limit: about 5 tries per minute from one IP address.
// The IP is used only for this count. It's never saved or logged.
export async function withinRateLimit(env, scope, request) {
  if (!env.FORM_LIMITER) return true; // binding not set up (README explains)
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  try {
    const { success } = await env.FORM_LIMITER.limit({ key: `${scope}:${ip}` });
    return success;
  } catch (err) {
    console.error("rate_limit_error", err.message);
    return true; // if the limiter itself fails, don't block real people
  }
}

// Asks Cloudflare whether the Turnstile bot check passed.
export async function checkBot(env, token, request) {
  if (!env.TURNSTILE_SECRET) {
    console.error("TURNSTILE_SECRET is not set");
    throw new InputError("The form isn't set up yet. Try again later, or write to synkurl@synkurl.com.", 500);
  }
  if (!token || typeof token !== "string" || token.length > 2048) {
    throw new InputError("The bot check didn't finish. Reload the page and try again.", 403);
  }

  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.append("remoteip", ip);

  let outcome;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    outcome = await res.json();
  } catch (err) {
    console.error("turnstile_unreachable", err.message);
    throw new InputError("The bot check couldn't be completed. Try again in a minute.", 503);
  }
  if (outcome?.success !== true) {
    throw new InputError("The bot check didn't pass. Reload the page and try again.", 403);
  }
}
