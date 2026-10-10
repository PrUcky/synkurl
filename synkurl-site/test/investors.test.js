// Tests for the investor contact form.
import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONSENT_VERSION } from "../src/waitlist.js";
import { EMAIL_OFF, EMAIL_ON, call, fakeOutside, freshEmail, freshIp, minutesFromNow, runCleanUp } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

const NOTIFY = { ...EMAIL_ON, NOTIFY_EMAIL: "founder-inbox@example.org" };

function goodMessage(extra = {}) {
  return {
    name: "Anita Rao",
    email: freshEmail("investor"),
    organisation: "Example Fund",
    investor_type: "vc",
    link: "https://www.linkedin.com/in/example",
    message: "Hello, I'd like to learn more about Synkurl and what you're building.",
    wants_deck: true,
    consent: true,
    token: "turnstile-test-token",
    ...extra,
  };
}

async function send(message, envExtra = NOTIFY, ip = freshIp()) {
  const res = await call("/api/investors", { method: "POST", json: message, envExtra, ip });
  return { res, body: await res.json() };
}

const saved = (email) => env.DB.prepare("SELECT * FROM investor_contacts WHERE email = ?1 ORDER BY id").bind(email).all().then((r) => r.results);

describe("checking the investor form fields", () => {
  const cases = [
    ["a missing name", { name: "" }, "name"],
    ["a one-letter name", { name: "A" }, "name"],
    ["a name of 101 characters", { name: "A".repeat(101) }, "name"],
    ["a bad email", { email: "anita@fund" }, "valid email"],
    ["a throwaway email", { email: "anita@10minutemail.com" }, "throwaway"],
    ["an organisation over 120 characters", { organisation: "O".repeat(121) }, "organisation"],
    ["an unknown type", { investor_type: "bank" }, "describes you"],
    ["a missing type", { investor_type: undefined }, "describes you"],
    ["an http (not https) link", { link: "http://example.com" }, "https://"],
    ["a link that isn't a web address", { link: "linkedin" }, "https://"],
    ["a javascript: link", { link: "javascript:alert(1)" }, "https://"],
    ["a message of 19 characters", { message: "x".repeat(19) }, "20 to 1,000"],
    ["a message of 1001 characters", { message: "x".repeat(1001) }, "20 to 1,000"],
    ["the consent box not ticked", { consent: false }, "consent"],
  ];

  it.each(cases)("rejects %s, and saves nothing", async (_name, change, message) => {
    const { sent } = fakeOutside();
    const m = goodMessage(change);
    const { res, body } = await send(m);
    expect(res.status).toBe(400);
    expect(body.error).toContain(message);
    expect(sent).toHaveLength(0);
    if (m.email) expect(await saved(String(m.email).toLowerCase())).toHaveLength(0);
  });

  it("accepts the optional fields left empty, and every type", async () => {
    fakeOutside();
    for (const investor_type of ["angel", "vc", "accelerator", "other"]) {
      const { res } = await send(goodMessage({ investor_type, organisation: "", link: "", wants_deck: false }), EMAIL_OFF);
      expect(res.status).toBe(201);
    }
  });

  it("keeps line breaks in the message, and a message of exactly 1000 characters is fine", async () => {
    fakeOutside();
    const m = goodMessage({ message: `Line one of the message.\nLine two.${"x".repeat(1000 - 34)}` });
    expect(m.message.length).toBe(1000);
    await send(m, EMAIL_OFF);
    expect((await saved(m.email))[0].message).toContain("message.\nLine two.");
  });
});

describe("saving and emails", () => {
  it("saves the message in its own table and emails the founder and the investor", async () => {
    const { sent } = fakeOutside();
    const m = goodMessage();
    const { res, body } = await send(m);
    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);

    const [row] = await saved(m.email);
    expect(row).toMatchObject({ name: "Anita Rao", investor_type: "vc", wants_deck: 1, notified: 1, consent_version: CONSENT_VERSION });

    expect(sent).toHaveLength(2);
    const [toFounder, toInvestor] = sent;
    expect(toFounder.to).toEqual(["founder-inbox@example.org"]);
    expect(toFounder.reply_to).toBe(m.email);
    expect(toFounder.text).toContain("Wants the deck: Yes");
    expect(toFounder.text).toContain(m.message);
    expect(toInvestor.to).toEqual([m.email]);
    expect(toInvestor.text).toContain("The founder will reply personally.");
    expect(toInvestor.text).toContain("We've noted that you'd like our deck.");

    // The waitlist is untouched.
    const onWaitlist = await env.DB.prepare("SELECT count(*) AS n FROM waitlist WHERE email = ?1").bind(m.email).first();
    expect(onWaitlist.n).toBe(0);
  });

  it("escapes the message in the founder's HTML email", async () => {
    const { sent } = fakeOutside();
    await send(goodMessage({ message: "<script>alert('hi')</script> is not run, it's shown as text." }));
    expect(sent[0].html).toContain("&lt;script&gt;");
    expect(sent[0].html).not.toContain("<script>");
  });

  it("when email isn't set up: still saves, shows the same thank-you, sends nothing", async () => {
    const { calls } = fakeOutside();
    const m = goodMessage();
    const { res, body } = await send(m, EMAIL_OFF);
    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect((await saved(m.email))[0].notified).toBe(0);
    expect(calls.some((url) => url.includes("resend"))).toBe(false);
  });

  it("when NOTIFY_EMAIL isn't set: saves and thanks the investor", async () => {
    const { sent } = fakeOutside();
    const m = goodMessage();
    await send(m, EMAIL_ON);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([m.email]);
    expect((await saved(m.email))[0].notified).toBe(0);
  });

  it("allows about 3 messages a day from one email, each saved as a new message", async () => {
    fakeOutside();
    const m = goodMessage();
    for (let i = 0; i < 3; i++) expect((await send(m, EMAIL_OFF)).res.status).toBe(201);
    const fourth = await send(m, EMAIL_OFF);
    expect(fourth.res.status).toBe(429);
    expect(await saved(m.email)).toHaveLength(3);
  });

  it("asks the person to email instead if migration 0003 hasn't been run", async () => {
    fakeOutside();
    const { res, body } = await send(goodMessage(), { ...EMAIL_ON, DB: env.OLD_DB });
    expect(res.status).toBe(503);
    expect(body.error).toContain("synkurl@synkurl.com");
  });
});

describe("protection", () => {
  it("refuses when the bot check fails", async () => {
    const { sent } = fakeOutside({ botPasses: false });
    const m = goodMessage();
    const { res } = await send(m);
    expect(res.status).toBe(403);
    expect(await saved(m.email)).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("has the same rate limit as the waitlist: the 6th try in a minute is refused", async () => {
    fakeOutside();
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await call("/api/investors", { method: "POST", json: {}, ip })).status);
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  });
});

describe("clean-up", () => {
  it("deletes investor messages older than 2 years, keeps newer ones", async () => {
    const insert = async (daysAgo) => {
      const email = freshEmail("old-investor");
      await env.DB.prepare(
        `INSERT INTO investor_contacts (name, email, investor_type, message, consent_version, created_at)
         VALUES ('Old', ?1, 'angel', 'A message from a while ago, long enough.', ?2, ?3)`
      ).bind(email, CONSENT_VERSION, minutesFromNow(-daysAgo * 24 * 60)).run();
      return email;
    };
    const old = await insert(731);
    const recent = await insert(700);
    await runCleanUp();
    expect(await saved(old)).toHaveLength(0);
    expect(await saved(recent)).toHaveLength(1);
  });
});
