// Shared helpers for the tests.
import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { vi } from "vitest";
import worker from "../src/index.js";

// Each test uses its own pretend IP address, so the rate limit of one test
// doesn't block another.
let ipCount = 0;
export function freshIp() {
  ipCount += 1;
  return `10.${Math.floor(ipCount / 250) % 250}.${ipCount % 250}.7`;
}

let emailCount = 0;
export function freshEmail(prefix = "family") {
  emailCount += 1;
  return `${prefix}.${emailCount}.${Date.now()}@example.com`;
}

// Pretend versions of the outside services, so tests never use the internet:
// Turnstile (bot check) and Resend (email). `sent` collects the emails.
export function fakeOutside({ botPasses = true, emailWorks = true, botReachable = true } = {}) {
  const sent = [];
  const calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push(url);
    if (url.startsWith("https://challenges.cloudflare.com/")) {
      if (!botReachable) throw new TypeError("network down");
      return Response.json({ success: botPasses });
    }
    if (url === "https://api.resend.com/emails") {
      sent.push({ ...JSON.parse(init.body), authorization: init.headers.authorization });
      return emailWorks ? Response.json({ id: "email-1" }) : new Response("provider error", { status: 500 });
    }
    throw new Error(`The test didn't expect a request to ${url}`);
  });
  return { sent, calls };
}

export const EMAIL_ON = { EMAIL_API_KEY: "re_test_key", EMAIL_FROM: "Synkurl <synkurl@synkurl.com>" };
export const EMAIL_OFF = { EMAIL_API_KEY: undefined };

// Sends one request straight to the Worker code, with optional extra settings.
export async function call(path, { method = "GET", json, form, ip = freshIp(), envExtra = {}, host = "synkurl.com" } = {}) {
  const headers = { "CF-Connecting-IP": ip };
  let body;
  if (json !== undefined) {
    headers["content-type"] = "application/json";
    body = typeof json === "string" ? json : JSON.stringify(json);
  } else if (form !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  const request = new Request(`https://${host}${path}`, { method, headers, body, redirect: "manual" });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, { ...env, ...envExtra }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

export async function runCleanUp(envExtra = {}) {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: "47 21 * * *" }), { ...env, ...envExtra }, ctx);
  await waitOnExecutionContext(ctx);
}

export function goodAnswers(extra = {}) {
  return {
    email: freshEmail(),
    phone_type: "android",
    city: "Pune",
    family_size: "3-4",
    device_pick: "",
    is_adult: true,
    consent: true,
    lang: "en",
    token: "turnstile-test-token",
    ...extra,
  };
}

export function tokenFrom(email) {
  return email.text.match(/confirm\?token=([A-Za-z0-9_-]{43})/)[1];
}

export async function row(email, db = env.DB) {
  return db.prepare("SELECT * FROM waitlist WHERE email = ?1").bind(email).first();
}

// Time as the database stores it, moved by some minutes (negative = in the past).
export function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
