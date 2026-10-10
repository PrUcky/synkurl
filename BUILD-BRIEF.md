# Build brief: full Synkurl website (v1)

Build on the existing code in this repo. Don't start over. Read `CLAUDE.md` and `README.md` first. The current site has a home page, a waitlist page, a privacy notice and a 404 page, plus the Worker, D1 and Turnstile. Keep the stack: plain HTML, CSS and JavaScript, a Cloudflare Worker with static assets, D1 and Turnstile. No frameworks.

**Start by asking all your questions in one batch.** Then build in the phases at the end, commit after each phase, and open **one** pull request.

---

## 1. Ground rules

- **The repo is public.** No secrets, tokens, personal data or internal notes. Secrets live only in Cloudflare.
- **Dependencies:** add only what's needed. Pin exact versions published at least 14 days ago, and commit the lockfile.
- **Never deploy, log in, set secrets, or run remote database commands.** Merging to `main` deploys.
- **Logs never contain emails, tokens or IP addresses.**
- **Copy:** plain, warm Indian English. Say what Synkurl does for families, never how it works. No hype words ("revolutionary", "AI-powered"), no scare tactics.

### What the site may say
- Photos and videos back up automatically from your phone to a small device in your home.
- You can open them from anywhere, on Wi-Fi or mobile data.
- If you get a new phone, your photos come back to it.
- We're starting with Android.

### What the site must not say
- A price or pricing model, a launch date, storage sizes, or other specs.
- Anything about how it works: networking, encryption design, how pairing or remote access works, server names, IP addresses.
- Features beyond the list above: sharing between family members, face search, AI features, editing, iPhone timelines.
- Names of other companies' products, or comparisons with them.

If an honest answer isn't known yet, write something like: *"We'll explain this before early access opens."* Never invent specs. In the pull request, list every sentence that makes a product promise, so the founder can review it. Include the existing line about pairing several family phones.

---

## 2. Pages

| Path | Contents |
|---|---|
| `/` | Hero (keep the current one), what it does, the app screen mockups section, a "who it's for" teaser of 3 situations linking to `/for-families`, how it will work, 3 FAQ items linking to `/faq`, closing call to action |
| `/for-families` | 4–5 real family situations, each with a short story and what Synkurl does about it (only from the allowed list). Ideas: a phone always full of the kids' photos; a parent who changed phones and lost years of photos; a lost phone on the train; not wanting the family's photos in someone else's cloud. No made-up quotes or testimonials. |
| `/faq` | Grouped questions: **The product** (what it is, is it a cloud service, which phones, do I need to be technical, what if the home internet goes down, what if I lose my phone, what if the device breaks, how much it stores) and **The waitlist** (what I get, how my details are used, why phone, city and family size, I didn't get the email, can I join from outside India, how to be removed). Use the "we'll explain before early access" answer for anything unknown. Each answer gets its own link anchor. |
| `/join` | The form (section 4) |
| `/check-email` | "Check your inbox" after joining, with the WhatsApp share (section 5) |
| `/confirm`, `/remove` | Pages reached from the email links (section 5) |
| `/confirmed`, `/removed`, `/link-expired` | Result pages |
| `/privacy` | Updated (section 7) |
| `/404` | Keep |

Every page gets the same header and footer. The footer links to Privacy, the FAQ and hello@synkurl.com.

---

## 3. Pictures (illustrations and app screens only)

- **No photos, no device renders, no AI-generated images, no real people or faces.**
- **Illustrations:** inline SVG in the existing style (night blue, one diya-amber glow, thin starlight lines, the arch-window motif). One small illustration per family situation.
- **App screen mockups:** 3–4 phone screens drawn in SVG or HTML/CSS, inside a simple phone outline. Suggested screens:
  1. A "Backed up" status showing a photo count.
  2. An album grid. Fill it with illustrated placeholder pictures (a birthday cake, a beach, a diya, a mountain road), never people.
  3. "Away from home: your albums are here."
  4. "Restore to this phone".
- Label them clearly: *"Early design. The real app may look different."*
- Mockups must show no technical details: no addresses, server names, connection screens or encryption labels.
- Keep the mockups light: lazy-load anything below the fold. Respect reduced motion.

---

## 4. Waitlist form

**Fields:**
- Email.
- Phone: Android / iPhone / Both in the family / Other.
- City: free text, 2–80 characters. Hindi and other scripts are allowed.
- People in the family: 1–2 / 3–4 / 5–6 / 7 or more / Not sure.
- Two required tick boxes: **"I'm 18 or older"**, and the existing consent box linking to the privacy notice.

**Behaviour:**
- Show a typo hint for common email mistakes ("Did you mean gmail.com?"), and let the person ignore it.
- Reject throwaway email domains, using a short, maintained list in the repo.
- Normalise emails by trimming and lowercasing only. Don't strip dots or plus-tags.
- Prevent double taps on the button. Show a loading state, and if the request takes too long, show a timeout message with a retry.
- Explain plainly when the bot check is blocked (for example by an ad-blocker or an old browser), and offer emailing hello@synkurl.com instead.
- Without JavaScript, the bot check can't run, so show a `<noscript>` message with the email alternative.
- **Selected chips must look selected on older Android browsers too.** Don't rely only on `:has()`; add a fallback.
- Store a `lang` value (`en` for now). The Hindi pages will come later, in a separate pull request.

---

## 5. After joining: double opt-in and sharing

**Flow:**
1. **`POST /api/join`**: check the fields, the bot check (Turnstile) and the rate limit, then save a row with status `pending`. Generate a random token (32 bytes, base64url), store **only its SHA-256 hash**, and set it to expire after 48 hours. Send the confirmation email.
2. **The email** contains two links: **Confirm** (`/confirm?token=…`) and **Not me: remove my email** (`/remove?token=…`).
3. **Email scanners open links automatically**, so the link pages must never change anything just by opening. `/confirm` and `/remove` show a page with a button that sends a `POST` (it must work without JavaScript). The POST endpoints redirect (303) to `/confirmed`, `/removed` or `/link-expired`.

**Cases to handle:**
- **The same email joins again:**
  - If still pending, resend the email, at most once every 10 minutes per email.
  - If already confirmed, say "already on the waitlist".
  - If removed earlier, allow joining again.
- **Links that no longer work:** an expired, already-used or invalid link shows a friendly page with a way to rejoin.
- **Removing:** "remove" deletes the row completely.

**Email sending:**
- Pick a transactional email provider and explain the choice in the pull request. Use Cloudflare's own email sending if this account can use it, otherwise a provider with a free tier.
- Call its HTTP API with `fetch`, not an SDK. The API key lives in a secret named `EMAIL_API_KEY`. `EMAIL_FROM` and `SITE_URL` go in `vars`.
- Write the email in plain text plus simple HTML, in English (structured so Hindi can be added later). Subject: "Confirm you want to join the Synkurl waitlist".
- **If `EMAIL_API_KEY` isn't set** (the domain may not be ready yet), still save the sign-up with status `single_opt_in`, show "You're on the waitlist", and skip the email. The site must work before email is set up.

**Clean-up:** add a daily Cron Trigger that deletes `pending` rows older than 7 days. Never delete `confirmed` or `single_opt_in` rows automatically.

**WhatsApp share** on `/check-email` and `/confirmed`:
- A "Tell your family on WhatsApp" button linking to a `wa.me` share URL with short pre-filled text and `https://synkurl.com`.
- Use the Web Share API when the browser supports it, with a "Copy link" fallback.
- No referral codes and no tracking parameters.

---

## 6. Visit counts (no cookies)

Use **Cloudflare Web Analytics**, which counts visits without cookies.
- Prefer the setup that needs no code: enabling it for `synkurl.com` in the dashboard once the domain is on Cloudflare. Document the steps.
- If a beacon script is needed instead, allow only Cloudflare's analytics hosts in the browser security rules (CSP).
- No other analytics, pixels, cookies or fingerprinting.
- Update `CLAUDE.md`: Turnstile and Cloudflare Web Analytics are the only allowed third-party scripts.

---

## 7. Data and privacy

**Database changes:**
- Add a numbered migration in `migrations/`. It must **keep the existing rows**. SQLite can't change CHECK rules in place, so rebuild the table safely if needed.
- New or changed columns: `status`, `token_hash`, `token_expires_at`, `email_sent_at`, `confirmed_at`, `is_adult`, `lang`, and the updated options for phone and family size.

**Code that works with old and new data:** Cloudflare deploys on merge, and migrations are run by hand in the D1 console. So the pull request needs a **"Before merging: run this SQL in the D1 console"** section, and the code should cope safely if the migration hasn't been run yet.

**Privacy notice and consent:**
- Rewrite the privacy notice to cover:
  - what is collected and why
  - the double opt-in
  - unconfirmed sign-ups deleted after 7 days
  - the 18+ requirement
  - cookieless visit counts
  - the email provider, named as a service provider
  - how long data is kept
  - how to withdraw consent or ask for deletion (the email link or hello@synkurl.com)
  - a contact address
- Mark it in the pull request as **needing review; not legal advice**.
- Bump `CONSENT_VERSION`.

**Extra SQL for the README:** sign-ups per day, the confirmed rate, the phone split, the top 10 cities (case-insensitive), the family-size split.

---

## 8. Security, speed and compatibility

**Security:**
- Security headers on every page: a Content-Security-Policy allowing only what's used (self, Turnstile, Cloudflare analytics if needed), `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that turns off unused features.
- Add HSTS only for `synkurl.com`, without preload.
- Use the static-assets `_headers` file if the pinned Wrangler supports it; otherwise set the headers in the Worker.
- **Rate limits:** `/api/join` at about 5 attempts per minute per IP, using the Workers rate-limiting binding if available; otherwise document a dashboard rate-limiting rule. The IP is used for limiting only, never stored.
- No admin page and no API that lists or exports data.

**Speed and compatibility:**
- Page weight: home page under about 300 KB on first load, including the font.
- Works at 320 px wide with no sideways scrolling, in Chrome for Android, Samsung Internet, and the browsers built into WhatsApp and Instagram.
- Keyboard and screen-reader friendly, with visible focus and strong colour contrast.

**Search and link previews:**
- Unique titles and descriptions, canonical URLs, `sitemap.xml`, `robots.txt`, and Organization structured data.
- Open Graph and Twitter tags on every page, using `https://synkurl.com` URLs, plus a 1200×630 PNG preview image in the site's style (headline plus glowing arch).
- A favicon set: SVG, a 180 px Apple touch icon, and a 192/512 px PNG for Android.

---

## 9. Tests and CI

- Use Vitest with Cloudflare's Workers test integration, pinned.
- **Tests to cover:**
  - every validation rule
  - a failed bot check
  - the rate limit
  - joining, then the same email again in each state (pending, confirmed, removed)
  - resend throttling
  - confirm, remove, expired link, reused link
  - the email-not-configured path
  - the clean-up cron
  - the security headers
  - opening a link page with GET changes nothing
- **CI:** a GitHub Actions workflow that runs `npm test` on every pull request and push to `main`.
- Explain in plain words what each test group proves.

---

## 10. Delivery

**Phases** (commit after each):
1. Database migration and backend
2. Form and email flow
3. Pages and copy
4. Illustrations and mockups
5. Security, speed and SEO
6. Tests and CI
7. Docs: README (setup for email, the analytics steps, the migration steps, the new SQL) and CLAUDE.md

**The pull request description must include:**
- **Summary** of what changed, in plain words.
- **Before merging:** the exact SQL to run in the D1 console.
- **After merging:** the dashboard steps (email provider account and DNS records, the `EMAIL_API_KEY` secret, Web Analytics, rate limiting if done in the dashboard).
- **Claims needing founder review:** every product promise, the FAQ answers, the privacy notice.
- **What's untested**, and why.

**Out of scope:** Hindi (a separate pull request later), referrals, accounts or logins, an admin dashboard, newsletters, payments, a blog or updates page, an about page.
