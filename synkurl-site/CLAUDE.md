# Synkurl site: instructions for Claude Code

## Who you're working with
A beginner learning web hosting and SRE basics while building this site. Teach while you build:
- Use very simple words and short sentences. No jargon; when a technical word is needed, say what it means in a few words.
- Before each step, explain the idea in 2–4 plain sentences, with an everyday Indian analogy where it helps.
- Give one clear thing to do at a time.
- Keep changes small. Before editing a file, say in one line what you'll change and why.
- After a change, ask one short check question ("What would happen if…?") before moving on, unless the user asked you to build straight through.

## The project
The repository is `synkurl`; the site is in `synkurl-site/`. The Cloudflare Worker is named `synkurl-site` (keep that name in `wrangler.jsonc`).

- `public/`: static pages, styles, scripts and pictures. Plain HTML, CSS and JavaScript, no frameworks.
- `src/`: the Worker. `index.js` routes requests; `waitlist.js` joins, confirms, removes and cleans up; `investors.js` handles the investor contact form (its own table, `investor_contacts`); `checks.js` holds shared form checks; `email.js` sends email through Resend's HTTP API with `fetch`.
- `migrations/`: numbered D1 changes, run by hand in the D1 console before merging (deploys don't run them). Code must keep working if the newest migration hasn't been run yet.
- `test/`: Vitest with Cloudflare's Workers pool. Run `npm test`. CI runs it on every pull request.
- Config is in `wrangler.jsonc` (vars, cron, rate limit). Versions are pinned in `package.json` and `package-lock.json`.

**How it deploys:** Cloudflare is connected to this GitHub repo. When a change is merged into `main`, Cloudflare builds and deploys it. You never deploy.

## Rules
- **This repository is public.** Never commit secrets, API tokens, personal data or internal planning notes. Secrets (`TURNSTILE_SECRET`, `EMAIL_API_KEY`, `NOTIFY_EMAIL`) live only in Cloudflare.
- **Never run** `wrangler deploy`, `wrangler login`, `wrangler secret`, or any `--remote` database command. Never ask for a Cloudflare token.
- **Never change the `database_id` line** in `wrangler.jsonc`; the user manages it on `main`.
- **Local testing is fine**: `npm ci`, `npm run db:setup:local`, `npm run dev`, `npm run db:rows:local`, `npm test` (`.dev.vars` holds Cloudflare's public test key; copy it from `.dev.vars.example`).
- **Dependencies:** add only what's needed, pin exact versions published at least 14 days ago, and commit the lockfile.
- **Work on a branch** and open a pull request. The user reviews and merges.
- **Product copy** describes what Synkurl does for families, in plain, warm Indian English. Allowed promises: photos and videos back up automatically from your phone to a small device in your home; you can open them from anywhere on Wi-Fi or mobile data; a new phone gets your photos back; we're starting with Android. Never: prices, launch dates, storage sizes or specs, how it works (networking, encryption, pairing, remote access, servers), other features, other companies' products. If unknown, say "We'll explain this before early access opens."
- **Logs** must never contain emails, tokens, IP addresses or other personal data.
- **Third-party scripts:** only Cloudflare Turnstile (the bot check, on form pages) and Cloudflare Web Analytics (cookieless visit counts). No other analytics, pixels, cookies, fingerprinting or font services. Keep `public/_headers` and `SECURITY_HEADERS` in `src/http.js` the same; a test checks.
- **Investors page** is a contact page, not an offer: say "Get in touch" and "We'd love to talk"; never mention shares, a round, valuation, returns, "invest now" or "opportunity". The deck is never hosted on the site. No personal details of the founder or team unless the user supplies them.
- **Ask before** changing the stack, adding dependencies, changing the design direction, the form fields or the privacy notice. If the form fields or the privacy notice change, update `CONSENT_VERSION` in `src/waitlist.js` and the version shown in `public/privacy.html` together (a test checks).

## Design direction (keep it)
A quiet, premium product catalogue (approved October 2026, replacing the earlier night-blue look). Warm paper `#f2eee8` and charcoal `#1b1a18` sections, large product photography, generous spacing, fine dividers. Unbounded (self-hosted) for headings, system font for body. The outlined Synkurl mark (ring with the two-post "M") is the brand mark. Avoid grids of identical rounded cards, decorative gradients, glass effects and heavy overlays on photos.

**The designs:** six concept designs — Arch, Dome, Spine, Stack, Box, Box Plus — each shown in Blush Pink, Matte Black, Dusk Violet and Rose Gold. They are generated design concepts, not finished products: every page says "Concept design. … The final Synkurl device will look different." Never imply they can be bought, never give dimensions, capacity or specs, and never imply Box Plus is bigger or faster than Box.

**Photos:** originals live outside git in `design-masters/`; web copies in `public/media/` are made by `scripts/build-images.py`. A finish's gallery only shows photos of that finish: never recolour (no CSS filters), relabel, or reuse a photo as another finish or angle. Photos of another finish are labelled with their real finish. Don't crop away the device. Wording and alt text live in `data/models.json`; run `npm run build:pages` after changing it, and never hand-edit `public/index.html` or `public/models/` (generated; `npm run check:site` checks).

**Motion:** no animation libraries; CSS, plain JavaScript, IntersectionObserver and bounded requestAnimationFrame only. All CSS motion goes inside the `@media (prefers-reduced-motion: no-preference)` block at the end of `styles.css` (a test checks), JavaScript motion checks the preference too (and reacts if it changes), and hidden starting states only apply once `motion.js` has added `.motion-ready`. Animate only `transform` and `opacity`. Never take over the scroll wheel. The site must look complete with no JavaScript and no motion. Keep the home page under about 350 KB on first load.
