# Synkurl site

The website and waitlist for [synkurl.com](https://synkurl.com). It runs on Cloudflare's free plan.

The GitHub repository is called `synkurl`. The site lives in its `synkurl-site/` folder. The Cloudflare Worker is called `synkurl-site`.

## How it fits together

1. A visitor opens the site. Cloudflare sends back the files in `public/`.
2. The waitlist form sends answers to `/api/join`. The Worker (`src/`) checks them, checks the bot check (Turnstile) and the rate limit, and saves one row per email in the D1 database.
3. **Email confirmation ("double opt-in").** The Worker emails a link to confirm. The person taps **Confirm** and the row becomes `confirmed`. Until email is set up (ship W5), sign-ups are saved as `single_opt_in` and no email is sent. The site works either way.
4. **Investors** use the form on `/investors`. Messages go to `/api/investors` and are saved in their own table (`investor_contacts`), never mixed with the waitlist. The founder gets an email for each one (to the `NOTIFY_EMAIL` secret), and the investor gets a short thank-you. The deck is never on the site.
5. Once a day, a Cron Trigger (a timer in Cloudflare) deletes sign-ups never confirmed within 7 days, and investor messages older than 2 years.
6. **Deploys are automatic.** When a change lands on `main`, Cloudflare builds and deploys it. Nobody deploys by hand. Tests run on GitHub for every pull request (the "Tests" check).

| File | What it is |
|---|---|
| `public/` | The website: pages, styles, scripts, pictures, the self-hosted font |
| `public/_headers` | Security rules sent with every page |
| `public/styles.css` | All styles. Everything that moves is in the "Motion" block at the end |
| `public/motion.js`, `public/home.js` | Optional motion: story scenes, pausing loops, the app demo |
| `public/art/` | Illustrations (family stories, the concept device, design ideas) |
| `src/index.js` | The backend (Worker): sends each request to the right code |
| `src/waitlist.js` | Joining, confirming, removing, daily clean-up |
| `src/checks.js` | Checks shared by the forms: email, bot check, rate limit |
| `src/investors.js` | The investor contact form |
| `src/email.js` | Sending email through Resend, and the email wording |
| `src/disposable-domains.js` | The short list of throwaway email domains we refuse |
| `migrations/` | Database changes, numbered. Run them in order, once each |
| `test/` | Automatic tests (`npm test`) |
| `wrangler.jsonc` | Cloudflare settings (config as code) |
| `package.json`, `package-lock.json` | Pin the exact tool versions for every build |
| `CLAUDE.md` | Instructions Claude Code reads when it works on this repo |

Dashboard menu names below may differ slightly from what you see.

---

## Ship W1: site live on a workers.dev address

**Done check:** the home page and `/join` open on your phone over mobile data.

1. **Create the database.** In the Cloudflare dashboard, go to **Storage & databases → D1 → Create**, name it `sdrive-waitlist`, and copy its **Database ID**.
2. **Create the tables.** Open the database's **Console** tab. Paste and run each file in `migrations/`, in number order, one at a time. Then run `SELECT count(*) FROM waitlist;` and expect `0`.
   - *Concept:* a migration is one numbered change to the database. Running them in order builds the same tables everywhere.
3. **Tell the code which database to use.** On GitHub, open `synkurl-site/wrangler.jsonc`, click the pencil icon, and replace `PASTE_DATABASE_ID_HERE` with the ID. Commit to `main`.
4. **Connect Cloudflare to the repo.** Go to **Workers & Pages → Create → Import a repository**. Connect GitHub and pick `synkurl`. Keep the project name `synkurl-site` (it must match `name` in `wrangler.jsonc`), and set the **root directory** (sometimes called "path") to `synkurl-site`. Then deploy.
5. Open the `*.workers.dev` address on your phone over mobile data.

| What you see | Cause | Fix |
|---|---|---|
| Build fails mentioning `database_id` | Step 3 not committed | Edit `wrangler.jsonc` on `main` |
| Build fails about the Worker name | Project name isn't `synkurl-site` | Rename to match `wrangler.jsonc` |
| Build can't find `package.json` or `wrangler.jsonc` | Root directory not set | Set it to `synkurl-site` |

## Ship W2: sign-ups save

**Done check:** a sign-up from your phone shows "You're on the waitlist", and the D1 console count shows 1.

1. **Add the bot-check secret.** Open the Worker's **Settings → Variables and secrets → Add**, choose type **Secret**, name it `TURNSTILE_SECRET`, and for now give it `1x0000000000000000000000000000000AA` (Cloudflare's public test key).
   - *Concept:* a secret lives in Cloudflare, never in the code. Secrets survive deploys.
2. **Sign up from your phone** at `…workers.dev/join`. Without email set up yet, you'll see "You're on the waitlist" straight away.
3. **Count:** `SELECT count(*) FROM waitlist;` should show `1`.
4. **Check the logs.** In the Worker's **Logs** tab, look for `{"event":"waitlist_join","outcome":"joined"}`. The logs never contain emails or IP addresses, on purpose.

| What you see | Cause | Fix |
|---|---|---|
| "The form isn't set up yet" | `TURNSTILE_SECRET` missing | Step 1 |
| "The waitlist is being updated" | Migration 0002 not run | Run `migrations/0002_double_opt_in.sql` |
| "The bot check didn't pass" | Site key and secret don't match | Use both test keys or both real keys |

## Ship W3: synkurl.com

**Done check:** `https://synkurl.com` and `https://www.synkurl.com` load on your phone with the padlock.

1. **Add the domain** to Cloudflare (Free plan) and check the copied DNS records. **Keep Google Workspace's MX records** (they deliver mail to synkurl@synkurl.com).
2. **Switch nameservers** at your domain registrar to the two Cloudflare shows. Wait until Cloudflare says **Active**.
3. **Point the domain at the site.** Edit `wrangler.jsonc`: uncomment the `routes` block and add the comma it mentions. Commit to `main`.

## Ship W4: real bot check. Do this before sharing the link.

The test key lets anyone and any bot through.

1. In Cloudflare, open **Turnstile → Add widget** and add the hostname `synkurl.com`. Copy the site key and the secret key.
2. On GitHub, edit `public/join.html` **and** `public/investors.html`, and replace `1x00000000000000000000AA` with the real site key in each. Commit to `main`.
3. Replace the `TURNSTILE_SECRET` value in the Worker's settings with the real secret key.

## Ship W5: confirmation emails (Resend)

**Done check:** joining with your own email sends "Confirm you want to join the Synkurl waitlist", and tapping **Confirm** shows "You're on the waitlist."

Resend is the service that sends our emails. Its free plan is enough for a waitlist, and the Worker talks to it with one simple web request and a key, so no extra code library is needed.

1. **Create a Resend account** and choose **Domains → Add domain**. Enter `synkurl.com`.
2. **Add Resend's DNS records in Cloudflare** (**DNS → Records**), exactly as Resend shows them. Usually these are:
   - a TXT record named `resend._domainkey` (DKIM: proves the email really came from us)
   - an MX record and a TXT record on a **subdomain** such as `send` (where bounces go)

   **Don't break Google Workspace email:**
   - **Never add a second SPF record on `synkurl.com` itself.** SPF is the TXT record starting with `v=spf1`. A domain may have only one. Resend's SPF goes on the `send` subdomain, so it doesn't touch Google's.
   - **Keep Google's MX records on `synkurl.com`.** Resend's MX record is only for the `send` subdomain.
   - If Resend ever asks for an SPF change on `synkurl.com` itself, add its `include:` inside the existing Google record (one line, one `v=spf1`), don't create another one.
   - If a DMARC record (`_dmarc`) already exists, keep just one.
3. Wait for Resend to show the domain as **Verified**.
4. **Create an API key** in Resend with **Sending access** only, for `synkurl.com`. Copy it.
5. In the Worker's **Settings → Variables and secrets**, add a **Secret** named `EMAIL_API_KEY` with that key.
6. `EMAIL_FROM` (`Synkurl <synkurl@synkurl.com>`) and `SITE_URL` (`https://synkurl.com`) are already in `wrangler.jsonc`. Replies go to synkurl@synkurl.com.
7. Join with your own email and check your inbox (and Spam).

If something goes wrong, the Worker's logs show `{"event":"email_failed","status":…}`. The person sees "We saved your details but couldn't send the confirmation email" and can try again.

> Before W3 (domain) is done, links in emails point to synkurl.com, which won't open yet. Do W5 after W3.

## Ship W5b: investor messages reach you

**Done check:** a test message on `/investors` arrives in your inbox, and you can reply straight to the sender.

1. Run `migrations/0003_investor_contacts.sql` in the D1 console (once).
2. In the Worker's **Settings → Variables and secrets**, add a **Secret** named `NOTIFY_EMAIL` with the inbox that should get investor messages (for example synkurl@synkurl.com). It's a secret so the address never appears in the public code.
3. Send yourself a test message from `/investors`. You'll get the notification, and the sender gets "Thanks for getting in touch with Synkurl. The founder will reply personally."

Without `EMAIL_API_KEY` or `NOTIFY_EMAIL`, messages are still saved. See them in the D1 console (below).

## Ship W6: visit counts without cookies (Cloudflare Web Analytics)

1. In the Cloudflare dashboard, open **Analytics & Logs → Web Analytics → Add a site**.
2. Choose `synkurl.com` and the **automatic setup** (Cloudflare adds its small counting script by itself, because the domain is on Cloudflare). No code change is needed.
3. Visit the site, wait a few minutes, and check the numbers appear.

The site's security rules already allow Cloudflare's counting script (`static.cloudflareinsights.com`) and where it sends counts (`cloudflareinsights.com`). It uses no cookies.

## Rate limit and daily clean-up

Both are set in `wrangler.jsonc`. Nothing to do in the dashboard.

- **Rate limit:** about 5 form tries per minute from one IP address (`ratelimits`). The IP is used only for counting, never saved.
- **Daily clean-up:** `triggers.crons` runs at 03:17 India time. It deletes sign-ups still `pending` after 7 days, and investor messages older than 2 years. You can see it under the Worker's **Settings → Triggers**.

## Before sharing the link

- [ ] W3 done, and mail to synkurl@synkurl.com arrives.
- [ ] W4 done (real bot check).
- [ ] W5 done (confirmation emails), or you're happy to collect sign-ups without confirmation for now.
- [ ] W5b done (`NOTIFY_EMAIL` set), so investor messages reach you.
- [ ] Privacy notice reviewed. It's a starting point, not legal advice.

---

## Database changes (migrations)

Merging to `main` deploys the code, but **database changes are run by hand** in the D1 console. So:

1. Before merging a pull request that adds a file in `migrations/`, open the D1 **Console**.
2. Paste the new file's contents and run it, **once**.
3. Then merge.

The code copes if a migration hasn't been run yet (sign-ups are still saved the old way), but run it soon.

`0002_double_opt_in.sql` starts with a guard line. If it was already run, that first line fails with `duplicate column name: status` and nothing else runs. That's expected and safe.

## Everyday tasks (D1 console)

```sql
-- How many sign-ups, by status (pending = waiting for the email click)
SELECT status, count(*) AS people FROM waitlist GROUP BY status;

-- Sign-ups per day (India time), last 30 days
SELECT date(created_at, '+5 hours', '+30 minutes') AS day, count(*) AS people
FROM waitlist GROUP BY day ORDER BY day DESC LIMIT 30;

-- Confirmed rate: of people we emailed, how many confirmed (in %)
SELECT round(100.0 * sum(status = 'confirmed') / nullif(sum(status IN ('pending', 'confirmed')), 0), 1) AS confirmed_percent
FROM waitlist;

-- Phone split (confirmed and single opt-in only)
SELECT phone_type, count(*) AS people FROM waitlist
WHERE status != 'pending' GROUP BY phone_type ORDER BY people DESC;

-- Top 10 cities, ignoring capital letters
SELECT lower(trim(city)) AS city, count(*) AS people FROM waitlist
WHERE status != 'pending' GROUP BY lower(trim(city)) ORDER BY people DESC LIMIT 10;

-- Family-size split
SELECT family_size, count(*) AS people FROM waitlist
WHERE status != 'pending' GROUP BY family_size ORDER BY people DESC;

-- Which design idea people would put in their home (optional question)
SELECT coalesce(device_pick, '(no answer)') AS design, count(*) AS people FROM waitlist
WHERE status != 'pending' GROUP BY design ORDER BY people DESC;

-- Deletion request
DELETE FROM waitlist WHERE email = 'person@example.com';

-- Investor messages, newest first
SELECT created_at, name, email, organisation, investor_type, wants_deck, notified, message
FROM investor_contacts ORDER BY id DESC LIMIT 20;

-- Who asked for the deck
SELECT created_at, name, email, organisation FROM investor_contacts WHERE wants_deck = 1 ORDER BY id DESC;

-- Deleting an investor's messages on request
DELETE FROM investor_contacts WHERE email = 'person@example.com';
```

When the privacy notice changes, also change `CONSENT_VERSION` in `src/waitlist.js`. The privacy page shows the same version, and a test checks they match.

---

## Motion, in plain words

- Everything that moves is in one block at the end of `styles.css`, inside `@media (prefers-reduced-motion: no-preference)`. People who switch on "reduce motion" on their phone see the still version, which tells the same story. A test checks this.
- Only `transform` (moving, turning, growing) and `opacity` (fading) are animated. They're cheap for phones to draw.
- Endless loops (the hero tiles, the device's glow) pause when they're off screen.
- No animation libraries. Page transitions use the browser's View Transitions feature where it exists; other browsers load pages normally.

## Working on it locally

```sh
npm ci                     # install the exact tool versions
cp .dev.vars.example .dev.vars
npm run db:setup:local     # build the tables in a local test database
npm run dev                # open http://localhost:8787
npm test                   # run the automatic tests
```

## The tests, in plain words

Tests run inside Cloudflare's real Workers runtime, with a throwaway local database and pretend versions of Turnstile and Resend. They never touch the internet or the live database.

| Test file | What it proves |
|---|---|
| `test/waitlist.test.js` → *checking the form fields* | Every wrong answer (bad email, throwaway email, missing phone, city too short or long, no 18+ tick, no consent…) is refused, and nothing is saved. Every allowed answer, including a Hindi city, is accepted. Emails are trimmed and lowercased only. |
| … *the bot check* | A failed or missing bot check saves nothing. If Cloudflare can't be reached, the person is asked to try again. |
| … *the rate limit* | The 6th try in a minute from one IP is refused; other people aren't affected. |
| … *joining when email is set up* | A new sign-up is `pending`, gets one email with Confirm and Remove links, and only a hash of the link code is stored. Joining again within 10 minutes sends nothing; after 10 minutes it sends a fresh link and the old one stops working. Confirmed emails get "already on the waitlist". Removed emails can join again. If Resend fails, the person can retry at once. |
| … *joining when email is NOT set up* | Sign-ups are saved as `single_opt_in`, and no email is attempted. |
| … *the confirm and remove links* | Opening a link (GET) changes nothing. The button (POST) confirms or deletes. Used, expired and made-up links show the "link expired" page. Remove works even after 48 hours. |
| … *the daily clean-up* | Only `pending` rows older than 7 days are deleted. |
| … *migration 0002 not run yet* | The site still saves sign-ups the old way and doesn't crash. |
| … *JavaScript off* | A plain form post gets a readable page, not raw data. |
| `test/investors.test.js` | Every investor form rule is checked; the bot check and rate limit apply; one email can send about 3 messages a day; the founder and the investor get the right emails (the message is shown safely as text); without email set up the message is still saved with the same thank-you; messages older than 2 years are cleaned up. |
| `test/motion.test.js` | "Reduce motion": every animation and transition sits inside the reduce-motion guard, so each page has a still version; motion only changes position/size (transform) and see-through-ness (opacity). |
| `test/headers.test.js` | Every page and every Worker answer has the security headers. HSTS only on synkurl.com. |
| `test/site.test.js` | Every page has the same header and footer (Investors only in the footer), its own title and description, preview tags; the sitemap and canonical links are right; the privacy page shows the current `CONSENT_VERSION`. |
| `test/email-hint.test.js` | The "Did you mean gmail.com?" hint catches common typos and stays quiet for real addresses. |
