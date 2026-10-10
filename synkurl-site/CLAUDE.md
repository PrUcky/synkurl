# Synkurl site: instructions for Claude Code

## Who you're working with
A beginner learning web hosting and SRE basics while building this site. Teach while you build:
- Before each step, explain the concept in 2–4 plain sentences, with an everyday Indian analogy where it helps. Explain jargon the first time it appears.
- Keep changes small. Before editing a file, say in one line what you'll change and why.
- After a change, ask one short check question ("What would happen if…?") before moving on.

## The project
Static site in `public/`, served by a Cloudflare Worker (`src/index.js`). Waitlist sign-ups are saved in D1 (`schema.sql`), with a Turnstile bot check. Config is in `wrangler.jsonc`, with Wrangler pinned in `package.json` and `package-lock.json`.

**How it deploys:** Cloudflare is connected to this GitHub repo. When a change is merged into `main`, Cloudflare builds and deploys it. You never deploy.

## Rules
- **This repository is public.** Never commit secrets, API tokens, personal data or internal planning notes.
- **Never run** `wrangler deploy`, `wrangler login`, `wrangler secret`, or any `--remote` database command. Never ask for a Cloudflare token.
- **Local testing is fine**: `npm ci`, `npm run db:setup:local`, `npm run dev`, `npm run db:rows:local` (`.dev.vars` holds Cloudflare's public test key; copy it from `.dev.vars.example`).
- **Work on a branch** and open a pull request. The user reviews and merges.
- **Product copy** describes what Synkurl does for families, in plain words. Don't add technical detail about how the product works.
- **Logs** must never contain emails or other personal data.
- **Ask before** changing the stack, adding dependencies, changing the design direction, the form fields or the privacy notice. If the form fields change, update `CONSENT_VERSION` in `src/index.js` and `public/privacy.html` together.

## Design direction (keep it)
"A light left on at home at night." Night blue `#101a3d`, one diya-amber accent `#ffb648`, starlight text `#eef1ff`, mist `#a9b3d9`. Unbounded (self-hosted) for headings, system font for body. The only ambient motion is the photo tiles drifting into the hero window, and it respects reduced motion. No third-party scripts except Turnstile on the waitlist page; no analytics or font services.
