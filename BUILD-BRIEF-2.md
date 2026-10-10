# Build brief 2: motion, concept device, investor page

This adds to `BUILD-BRIEF.md`; every rule there still applies. Read `CLAUDE.md`, `README.md` and `BUILD-BRIEF.md` first. Ask all your questions in one batch before building.

The brand is **Synkurl**. For now the device is called "the Synkurl device"; it has no separate product name yet.

---

## 1. Fluid and dynamic

**Rules for all motion:**
- **No animation libraries.** Use CSS, plain JavaScript and `IntersectionObserver`. Use CSS scroll-driven animations and the View Transitions API only as extras: with or without them, the site must still look complete.
- **Animate only `transform` and `opacity`.** Stop animations that are off screen. No endless loops off screen.
- **Respect "reduce motion".** When `prefers-reduced-motion` is on, every motion has a still version that tells the same story.
- **Budget:** home page under about 350 KB on first load. Smooth on a low-cost Android phone; test with CPU throttling in DevTools.

**What to build:**
- **"A photo's journey"**, a scroll story on the home page in 4–5 scenes:
  1. A photo is taken at a birthday in Delhi.
  2. It glows its way home to the Synkurl device.
  3. It's safe at home.
  4. Weeks later, it's opened on a phone in Bengaluru.

  Show the journey as light and motion only. No servers, clouds, network lines, tunnels or anything that suggests *how* it works.
- **Tappable app demo:** turn the app screen mockups into a phone you can tap or swipe through (backed up, albums, away from home, restore). It must work with the keyboard and with screen readers. Without JavaScript, show the screens as a still row.
- **Page transitions:** smooth cross-page transitions where the browser supports them, and normal page loads where it doesn't.
- **Small reactions:** buttons, form chips and a short success animation after joining.
- **Hero:** keep the drifting tiles. On desktop only, the art may shift slightly with the pointer.

---

## 2. The concept device: "how it will look in real life"

**Step 1: propose before committing anything.** This repo is public, and anything committed is published, including rejected sketches. So first describe **3 concept directions in the session chat** (shape, material, light, size relative to everyday things) and wait for the founder to pick one. **Commit only the chosen direction.**

**Step 2: build the chosen direction.**
- **Drawing:** a polished SVG illustration in the site's style (night blue, diya-amber light, starlight lines). No 3D library. If you think a "turn it around" view is worth it, use a few pre-drawn angles, loaded only when the visitor taps.
- **"In your home" scenes:** 3 illustrated rooms showing the device among familiar things (next to the Wi-Fi router, on a bookshelf, on a side table with a tea cup), so people sense its size. No exact measurements.
- **Label everywhere:** *"Concept design. The final Synkurl device will look different."*
- **What the drawings must not show:** internal parts, specific ports or connectors, specs, or technical details. No real brands or logos, only the Synkurl arch mark.
- **Placement:** a "Meet the Synkurl device (concept)" section on the home page, after the app demo. The scroll story and the home scenes use the same concept drawing.

---

## 3. Investor page: `/investors`

**Content**, with plain, honest wording:
- What Synkurl is, in one line.
- The family problem it solves.
- Why now (no market figures unless the founder supplies them with a source).
- Stage: "We're building our first version."
- Founder and team.
- A contact form.

**Founder input:** for anything that needs the founder's facts, use a placeholder in the form `[FOUNDER: …]`. Add a test that **fails if any `[FOUNDER:` placeholder remains in `public/`**, so a page with placeholders can't go live by accident.

**Wording rules:** use words like "Get in touch" and "We'd love to talk". Never mention shares, a round size, valuation, returns, "invest now" or "opportunity". This is a contact page, not an offer. List the page's text in the pull request for founder review, marked *not legal advice*.

**Where it appears:** a footer link, "Investors", on every page. Not in the main header.

**The form:**
- **Fields:**
  - name
  - work email
  - organisation or fund (optional)
  - type: Angel / VC fund / Accelerator / Other
  - LinkedIn or website (optional, must be an `https` URL)
  - message (20–1000 characters)
  - a tick box: "Please send me the deck"
  - a consent tick box linking to the privacy notice
- **Protection:** Turnstile, the same rate limiting as the waitlist, and the same typo and throwaway-email checks.
- **Storage:** a separate D1 table, `investor_contacts`, with its own numbered migration. Never mixed with the waitlist.
- **Emails:**
  - **To the founder:** a notification for each message. The founder's address lives in a secret, `NOTIFY_EMAIL`, never in the repo.
  - **To the investor:** a short thank-you: "Thanks, the founder will reply personally." No promised timeline.
- **The deck is never hosted on the site.** "Send me the deck" only flags the request, and the founder replies by hand.
- **If email isn't set up yet,** still save the message and show the same thank-you.
- **Duplicates:** the same email sending again creates a new message, limited to about 3 per day per email.

**Privacy notice:** add an investor-contacts section covering what is collected, why, and how long it's kept (suggest "up to 2 years, or until you ask us to delete it"; mark for founder review). Bump `CONSENT_VERSION`.

---

## 4. Tests to add

- The investor endpoint: each validation rule, the bot check, the rate limit, the per-email limit, and the email-not-configured path.
- The `[FOUNDER:` placeholder check.
- Every page has a still version of its motion under `prefers-reduced-motion` (a CSS check is enough).

## 5. Delivery

**Phases** (commit after each):
1. The 3 concept directions, in chat only.
2. The chosen concept and the home scenes.
3. The scroll story and the app demo.
4. Page transitions and small reactions.
5. The investor page, backend and migration.
6. Tests.
7. Docs (README and CLAUDE.md).

**The pull request description adds to the one in `BUILD-BRIEF.md`:**
- **Needs founder input:** every `[FOUNDER:]` item.
- **Before merging:** the SQL for the `investor_contacts` table.
- **After merging:** set `NOTIFY_EMAIL`.
- **Speed:** the measured page weight for each page, and how it behaves on a throttled CPU.
