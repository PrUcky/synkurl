// Tests for the waitlist: joining, confirming, removing and the daily clean-up.
import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CONSENT_VERSION, sha256 } from "../src/waitlist.js";
import { EMAIL_OFF, EMAIL_ON, call, fakeOutside, freshEmail, freshIp, goodAnswers, minutesFromNow, row, runCleanUp, tokenFrom } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

async function join(answers, envExtra = EMAIL_ON) {
  const res = await call("/api/join", { method: "POST", json: answers, envExtra });
  return { res, body: await res.json() };
}

// ---------------------------------------------------------------------------
describe("checking the form fields", () => {
  const cases = [
    ["a missing email", { email: "" }, "valid email"],
    ["an email without @", { email: "asha.example.com" }, "valid email"],
    ["an email without a dot in the domain", { email: "asha@example" }, "valid email"],
    ["an email that's too long", { email: `${"a".repeat(250)}@example.com` }, "valid email"],
    ["a throwaway email", { email: "someone@mailinator.com" }, "throwaway"],
    ["a throwaway email on a subdomain", { email: "someone@inbox.yopmail.com" }, "throwaway"],
    ["an unknown phone type", { phone_type: "nokia" }, "Choose your phone"],
    ["a missing phone type", { phone_type: undefined }, "Choose your phone"],
    ["a one-letter city", { city: "P" }, "city"],
    ["a city of 81 characters", { city: "P".repeat(81) }, "city"],
    ["a city with no letters", { city: "12345" }, "city"],
    ["an unknown family size", { family_size: "10" }, "family"],
    ["an unknown design idea", { device_pick: "tower" }, "design"],
    ["the 18+ box not ticked", { is_adult: false }, "18"],
    ["the consent box not ticked", { consent: false }, "consent"],
  ];

  it.each(cases)("rejects %s", async (_name, change, message) => {
    const { sent } = fakeOutside();
    const answers = goodAnswers(change);
    const { res, body } = await join(answers);
    expect(res.status).toBe(400);
    expect(body.error).toContain(message);
    expect(sent).toHaveLength(0);
    if (answers.email) expect(await row(String(answers.email).trim().toLowerCase())).toBeNull();
  });

  it("accepts every allowed answer, a Hindi city and an empty design question", async () => {
    fakeOutside();
    for (const phone_type of ["android", "iphone", "both", "other"]) {
      for (const family_size of ["1-2", "3-4", "5-6", "7+", "not-sure"]) {
        const { res } = await join(goodAnswers({ phone_type, family_size, city: "बेंगलुरु" }), EMAIL_OFF);
        expect(res.status).toBe(201);
      }
    }
    for (const device_pick of ["arch", "album", "pebble", "not-sure", ""]) {
      const { res } = await join(goodAnswers({ device_pick }), EMAIL_OFF);
      expect(res.status).toBe(201);
    }
  });

  it("trims and lowercases the email, but keeps dots and +tags", async () => {
    fakeOutside();
    const email = `  Asha.Rao+Family.${Date.now()}@Gmail.com `;
    await join(goodAnswers({ email }), EMAIL_OFF);
    const saved = await row(email.trim().toLowerCase());
    expect(saved.email).toBe(email.trim().toLowerCase());
    expect(saved.email).toContain("asha.rao+family.");
  });

  it("tidies extra spaces in the city", async () => {
    fakeOutside();
    const answers = goodAnswers({ city: "  New    Delhi " });
    await join(answers, EMAIL_OFF);
    expect((await row(answers.email)).city).toBe("New Delhi");
  });

  it("rejects a body that is too large", async () => {
    const res = await call("/api/join", { method: "POST", json: { email: "x".repeat(9000) } });
    expect(res.status).toBe(413);
  });

  it("rejects broken JSON", async () => {
    const res = await call("/api/join", { method: "POST", json: "{not json" });
    expect(res.status).toBe(400);
  });

  it("only accepts POST", async () => {
    const res = await call("/api/join");
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
describe("the bot check (Turnstile)", () => {
  it("refuses the sign-up when the bot check fails, and saves nothing", async () => {
    const { sent } = fakeOutside({ botPasses: false });
    const answers = goodAnswers();
    const { res, body } = await join(answers);
    expect(res.status).toBe(403);
    expect(body.error).toContain("bot check");
    expect(await row(answers.email)).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("refuses when no bot-check answer was sent", async () => {
    fakeOutside();
    const { res } = await join(goodAnswers({ token: "" }));
    expect(res.status).toBe(403);
  });

  it("says try again when Cloudflare's bot check can't be reached", async () => {
    fakeOutside({ botReachable: false });
    const { res } = await join(goodAnswers());
    expect(res.status).toBe(503);
  });

  it("says the form isn't set up when TURNSTILE_SECRET is missing", async () => {
    fakeOutside();
    const { res } = await join(goodAnswers(), { ...EMAIL_ON, TURNSTILE_SECRET: undefined });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
describe("the rate limit", () => {
  it("allows 5 tries a minute from one IP, then says wait", async () => {
    fakeOutside();
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await call("/api/join", { method: "POST", json: {}, ip });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
    // Someone else, on another IP, is not affected.
    const other = await call("/api/join", { method: "POST", json: {}, ip: freshIp() });
    expect(other.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe("joining when email is set up (double opt-in)", () => {
  it("saves the sign-up as pending and sends one confirmation email", async () => {
    const { sent } = fakeOutside();
    const answers = goodAnswers({ device_pick: "arch" });
    const { res, body } = await join(answers);

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ ok: true, next: "check-email" });

    const saved = await row(answers.email);
    expect(saved).toMatchObject({ status: "pending", is_adult: 1, lang: "en", device_pick: "arch", consent_version: CONSENT_VERSION });
    expect(saved.email_sent_at).not.toBeNull();

    expect(sent).toHaveLength(1);
    const email = sent[0];
    expect(email.to).toEqual([answers.email]);
    expect(email.from).toBe("Synkurl <synkurl@synkurl.com>");
    expect(email.reply_to).toBe("synkurl@synkurl.com");
    expect(email.subject).toBe("Confirm you want to join the Synkurl waitlist");
    expect(email.authorization).toBe("Bearer re_test_key");

    // Both links carry the same code, and the database keeps only its SHA-256 hash.
    const token = tokenFrom(email);
    expect(email.text).toContain(`https://synkurl.com/remove?token=${token}`);
    expect(email.html).toContain(`https://synkurl.com/confirm?token=${token}`);
    expect(saved.token_hash).toBe(await sha256(token));
    expect(saved.token_hash).not.toContain(token);

    // The link expires about 48 hours from now.
    const hours = (Date.parse(saved.token_expires_at) - Date.now()) / 3600000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThanOrEqual(48);
  });

  it("doesn't send again within 10 minutes for a pending email", async () => {
    const { sent } = fakeOutside();
    const answers = goodAnswers();
    await join(answers);
    const second = await join({ ...answers, email: answers.email.toUpperCase() });
    expect(second.res.status).toBe(201);
    expect(second.body).toMatchObject({ next: "check-email", recent: true });
    expect(sent).toHaveLength(1);
  });

  it("sends a fresh email after 10 minutes, and the old link stops working", async () => {
    const { sent } = fakeOutside();
    const answers = goodAnswers();
    await join(answers);
    const firstToken = tokenFrom(sent[0]);
    await env.DB.prepare("UPDATE waitlist SET email_sent_at = ?1 WHERE email = ?2").bind(minutesFromNow(-11), answers.email).run();

    const again = await join(answers);
    expect(again.body).toMatchObject({ next: "check-email", recent: false });
    expect(sent).toHaveLength(2);
    const secondToken = tokenFrom(sent[1]);
    expect(secondToken).not.toBe(firstToken);

    expect((await call(`/confirm?token=${firstToken}`, { method: "POST" })).headers.get("location")).toBe("/link-expired");
    expect((await call(`/confirm?token=${secondToken}`, { method: "POST" })).headers.get("location")).toBe("/confirmed");
  });

  it("says 'already on the waitlist' for a confirmed email, and sends nothing", async () => {
    const { sent } = fakeOutside();
    const answers = goodAnswers();
    await join(answers);
    await call(`/confirm?token=${tokenFrom(sent[0])}`, { method: "POST" });

    const again = await join(answers);
    expect(again.res.status).toBe(200);
    expect(again.body.next).toBe("already");
    expect(sent).toHaveLength(1);
  });

  it("lets someone join again after removing their email", async () => {
    const { sent } = fakeOutside();
    const answers = goodAnswers();
    await join(answers);
    await call(`/remove?token=${tokenFrom(sent[0])}`, { method: "POST" });
    expect(await row(answers.email)).toBeNull();

    const again = await join(answers);
    expect(again.body.next).toBe("check-email");
    expect((await row(answers.email)).status).toBe("pending");
    expect(sent).toHaveLength(2);
  });

  it("keeps the sign-up and allows an immediate retry when the email provider fails", async () => {
    fakeOutside({ emailWorks: false });
    const answers = goodAnswers();
    const { res } = await join(answers);
    expect(res.status).toBe(502);
    expect((await row(answers.email)).email_sent_at).toBeNull();

    vi.restoreAllMocks();
    const { sent } = fakeOutside();
    const retry = await join(answers);
    expect(retry.body).toMatchObject({ next: "check-email", recent: false });
    expect(sent).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("joining when email is NOT set up yet", () => {
  it("saves the sign-up as single_opt_in, says you're on the waitlist, and sends no email", async () => {
    const { calls } = fakeOutside();
    const answers = goodAnswers();
    const { res, body } = await join(answers, EMAIL_OFF);
    expect(res.status).toBe(201);
    expect(body.next).toBe("joined");
    const saved = await row(answers.email);
    expect(saved.status).toBe("single_opt_in");
    expect(saved.token_hash).toBeNull();
    expect(calls.some((url) => url.includes("resend"))).toBe(false);

    const again = await join(answers, EMAIL_OFF);
    expect(again.body.next).toBe("already");
  });
});

// ---------------------------------------------------------------------------
describe("the confirm and remove links", () => {
  async function pendingSignUp() {
    const { sent } = fakeOutside();
    const answers = goodAnswers();
    await join(answers);
    return { email: answers.email, token: tokenFrom(sent[0]) };
  }

  it("opening a link (GET) only shows the page and changes nothing", async () => {
    const { email, token } = await pendingSignUp();
    const confirmPage = await call(`/confirm?token=${token}`);
    const removePage = await call(`/remove?token=${token}`);
    expect(confirmPage.status).toBe(200);
    expect(await confirmPage.text()).toContain("Yes, confirm my email");
    expect(removePage.status).toBe(200);
    expect(await removePage.text()).toContain("Remove my email");
    expect((await row(email)).status).toBe("pending");
  });

  it("confirms with the button (POST)", async () => {
    const { email, token } = await pendingSignUp();
    const res = await call(`/confirm?token=${token}`, { method: "POST" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/confirmed");
    const saved = await row(email);
    expect(saved.status).toBe("confirmed");
    expect(saved.confirmed_at).not.toBeNull();
    expect(saved.token_hash).toBeNull();
  });

  it("also accepts the code in the form body", async () => {
    const { email, token } = await pendingSignUp();
    const res = await call("/confirm", { method: "POST", form: { token } });
    expect(res.headers.get("location")).toBe("/confirmed");
    expect((await row(email)).status).toBe("confirmed");
  });

  it("a link used twice shows the 'link expired' page the second time", async () => {
    const { token } = await pendingSignUp();
    await call(`/confirm?token=${token}`, { method: "POST" });
    const again = await call(`/confirm?token=${token}`, { method: "POST" });
    expect(again.headers.get("location")).toBe("/link-expired");
  });

  it("an expired link doesn't confirm", async () => {
    const { email, token } = await pendingSignUp();
    await env.DB.prepare("UPDATE waitlist SET token_expires_at = ?1 WHERE email = ?2").bind(minutesFromNow(-1), email).run();
    const res = await call(`/confirm?token=${token}`, { method: "POST" });
    expect(res.headers.get("location")).toBe("/link-expired");
    expect((await row(email)).status).toBe("pending");
  });

  it.each([["missing", ""], ["too short", "abc"], ["made up", "A".repeat(43)], ["with odd characters", `${"A".repeat(42)}!`]])(
    "a %s code shows the 'link expired' page",
    async (_name, token) => {
      const res = await call(`/confirm?token=${encodeURIComponent(token)}`, { method: "POST" });
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("/link-expired");
    }
  );

  it("'Not me: remove my email' deletes the row completely", async () => {
    const { email, token } = await pendingSignUp();
    const res = await call(`/remove?token=${token}`, { method: "POST" });
    expect(res.headers.get("location")).toBe("/removed");
    expect(await row(email)).toBeNull();
  });

  it("remove still works after the 48 hours", async () => {
    const { email, token } = await pendingSignUp();
    await env.DB.prepare("UPDATE waitlist SET token_expires_at = ?1 WHERE email = ?2").bind(minutesFromNow(-60), email).run();
    const res = await call(`/remove?token=${token}`, { method: "POST" });
    expect(res.headers.get("location")).toBe("/removed");
    expect(await row(email)).toBeNull();
  });

  it("after confirming, the remove link no longer works (and nothing is deleted)", async () => {
    const { email, token } = await pendingSignUp();
    await call(`/confirm?token=${token}`, { method: "POST" });
    const res = await call(`/remove?token=${token}`, { method: "POST" });
    expect(res.headers.get("location")).toBe("/link-expired?from=remove");
    expect((await row(email)).status).toBe("confirmed");
  });
});

// ---------------------------------------------------------------------------
describe("the daily clean-up", () => {
  it("deletes only pending sign-ups older than 7 days", async () => {
    const make = async (status, daysAgo) => {
      const email = freshEmail(status);
      await env.DB.prepare(
        `INSERT INTO waitlist (email, phone_type, city, family_size, status, consent_version, created_at)
         VALUES (?1, 'android', 'Pune', '3-4', ?2, ?3, ?4)`
      ).bind(email, status, CONSENT_VERSION, minutesFromNow(-daysAgo * 24 * 60)).run();
      return email;
    };
    const oldPending = await make("pending", 8);
    const newPending = await make("pending", 6);
    const oldConfirmed = await make("confirmed", 30);
    const oldSingle = await make("single_opt_in", 30);

    await runCleanUp();

    expect(await row(oldPending)).toBeNull();
    expect(await row(newPending)).not.toBeNull();
    expect(await row(oldConfirmed)).not.toBeNull();
    expect(await row(oldSingle)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("when migration 0002 hasn't been run yet", () => {
  beforeAll(async () => {
    // OLD_DB has only the original table, like the live database before the migration.
    for (const query of env.TEST_MIGRATIONS[0].queries) await env.OLD_DB.prepare(query).run();
  });
  const oldDb = { ...EMAIL_ON, DB: env.OLD_DB };

  it("still saves sign-ups the old way, without email", async () => {
    const { sent } = fakeOutside();
    const answers = goodAnswers();
    const { res, body } = await join(answers, oldDb);
    expect(res.status).toBe(201);
    expect(body.next).toBe("joined");
    expect(await row(answers.email, env.OLD_DB)).not.toBeNull();
    expect(sent).toHaveLength(0);
    expect((await join(answers, oldDb)).body.next).toBe("already");
  });

  it("asks to try later for answers the old table can't hold", async () => {
    fakeOutside();
    const { res } = await join(goodAnswers({ phone_type: "other" }), oldDb);
    expect(res.status).toBe(503);
  });

  it("link pages and the clean-up don't break", async () => {
    const res = await call(`/confirm?token=${"A".repeat(43)}`, { method: "POST", envExtra: oldDb });
    expect(res.headers.get("location")).toBe("/link-expired");
    await expect(runCleanUp({ DB: env.OLD_DB })).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("when JavaScript is off (plain form post)", () => {
  it("shows a readable page instead of raw data", async () => {
    fakeOutside({ botPasses: false });
    const res = await call("/api/join", { method: "POST", form: { email: freshEmail() } });
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<h1>");
  });

  it("goes to 'Check your inbox' after a good sign-up", async () => {
    fakeOutside();
    const answers = goodAnswers();
    const form = { ...answers, is_adult: "yes", consent: "yes", "cf-turnstile-response": "tok" };
    delete form.token;
    const res = await call("/api/join", { method: "POST", form, envExtra: EMAIL_ON });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/check-email");
  });
});
