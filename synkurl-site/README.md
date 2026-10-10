# Synkurl site

The home page and waitlist for [synkurl.com](https://synkurl.com). It runs entirely on Cloudflare's free plan.

## How it fits together

1. A visitor opens the site. Cloudflare sends back the files in `public/`.
2. The waitlist form sends answers to `/api/join`. The Worker (`src/index.js`) checks them and the bot check (Turnstile).
3. It saves one row per email in a D1 database (`schema.sql`). Signing up twice with the same email changes nothing.
4. **Deploys are automatic.** Cloudflare watches this repo. When a change lands on `main`, it builds and deploys the site. Nobody deploys by hand, and no Cloudflare login is stored anywhere else. This is called CI/CD (continuous integration / continuous deployment).

| File | What it is |
|---|---|
| `public/` | The website: pages, styles, the form script, the self-hosted font |
| `src/index.js` | The backend (Worker) |
| `schema.sql` | The database table |
| `wrangler.jsonc` | Cloudflare settings (config as code) |
| `package.json`, `package-lock.json` | Pin the exact Wrangler version for every build |
| `CLAUDE.md` | Instructions Claude Code reads when it works on this repo |

Dashboard menu names below may differ slightly from what you see.

---

## Ship W1: site live on a workers.dev address

**Done check:** the home page and `/join` open on your phone over mobile data.

1. **Put the code on GitHub.** On github.com, create a new repository named `synkurl-site`, set it to **Public**, and don't add a README. On the empty repo page, click **uploading an existing file**, drag in everything from the unzipped folder, then click **Commit changes**.
   - *Concept:* the repo is now the single source of truth. Every change is a commit you can see and undo.

2. **Create the database.** In the Cloudflare dashboard, go to **Storage & databases → D1 → Create**, name it `synkurl-waitlist`, and copy its **Database ID**.

3. **Create the table.** Open the database's **Console** tab, paste the contents of `schema.sql`, and run it. Then run `SELECT count(*) FROM waitlist;` and expect `0`.

4. **Tell the code which database to use.** On GitHub, open `wrangler.jsonc`, click the pencil icon, and replace `PASTE_DATABASE_ID_HERE` with the ID. Commit to `main`.
   - *Concept:* a "binding" is the Worker's name for a resource. The code says `env.DB`, and this file connects `DB` to your real database.

5. **Connect Cloudflare to the repo.** Go to **Workers & Pages → Create → Import a repository**. Connect GitHub, pick `synkurl-site`, and keep the project name `synkurl-site` (it must match `name` in `wrangler.jsonc`). Then deploy.
   - Watch the build log: it installs Wrangler and runs `npx wrangler deploy`. It ends with your `*.workers.dev` address.

6. Open the address on your phone over mobile data.

| What you see | Cause | Fix |
|---|---|---|
| Build fails mentioning `database_id` | Step 4 not committed | Edit `wrangler.jsonc` on `main` |
| Build fails about the Worker name | Project name isn't `synkurl-site` | Rename to match `wrangler.jsonc` |

---

## Ship W2: sign-ups save, and you see CI/CD work

**Done check:** a sign-up from your phone shows "You're on the waitlist". The D1 console count shows 1. A merged pull request goes live with no manual deploy.

1. **Add the bot-check secret.** Open the Worker's **Settings → Variables and secrets → Add**, choose type **Secret**, name it `TURNSTILE_SECRET`, and for now give it the value `1x0000000000000000000000000000000AA` (Cloudflare's public test key).
   - *Concept:* a secret lives in Cloudflare, never in the code. Secrets survive future deploys.

2. **Sign up from your phone** at `…workers.dev/join`. Then sign up again with the same email, and expect "You're already on the waitlist".

3. **Count** in the D1 console: `SELECT count(*) FROM waitlist;` should show `1`.

4. **Check the logs.** In the Worker's **Logs** tab, look for `{"event":"waitlist_join","added":true}`. The logs never contain the email, on purpose.

5. **Make your first CI/CD change.** At claude.ai/code, connect GitHub and choose `synkurl-site`. Ask:
   > Read CLAUDE.md and README.md, explain how this project fits together in plain words, then change the "When can I get it?" answer to mention we're starting in India. Open a pull request.

   Review the pull request on GitHub and merge it. Cloudflare's build starts by itself, and the change goes live within a few minutes.

| What you see | Cause | Fix |
|---|---|---|
| "The waitlist isn't set up yet" | Secret missing | Step 1 |
| "couldn't save your details", and the logs say `no such table` | Table not created | W1 step 3 |
| "The bot check didn't pass" | Site key and secret don't match | Use both test keys or both real keys |

---

## Ship W3: synkurl.com

**Done check:** `https://synkurl.com` and `https://www.synkurl.com` load on your phone with the padlock.

1. **Add the domain.** In the Cloudflare dashboard, choose **Add a domain**, enter `synkurl.com` and pick the Free plan. Check the DNS records it copies against Porkbun's list, especially email forwarding.
2. **Switch nameservers.** At Porkbun, replace the nameservers with the two Cloudflare shows you. Wait for Cloudflare to say the domain is **Active**. This can take from minutes to about a day.
   - *Concept:* nameservers say who answers "where is synkurl.com?". You're handing that job from Porkbun to Cloudflare.
3. **Point the domain at the site.** On GitHub, edit `wrangler.jsonc`: uncomment the `routes` block and add the comma it mentions. Commit to `main`, and the build adds the domains.
4. **Set up the email address.** The site lists `hello@synkurl.com`. Set up Cloudflare **Email Routing** to forward it to your inbox, then send it a test email.

---

## Ship W4: real bot check. Do this before sharing the link.

The test key lets anyone and any bot through.

1. In the Cloudflare dashboard, open **Turnstile → Add widget** and add the hostname `synkurl.com`. Copy the site key and the secret key.
2. On GitHub, edit `public/join.html` and replace `1x00000000000000000000AA` with the real site key. Commit to `main`.
3. Replace the `TURNSTILE_SECRET` value in the Worker's settings with the real secret key.
4. Sign up from your phone to confirm it still works.

## Before sharing the link

- [ ] W3 done, and mail to hello@synkurl.com arrives.
- [ ] W4 done.
- [ ] Privacy notice reviewed. It's a starting point, not legal advice.

## Everyday tasks (D1 console)

```sql
SELECT count(*) FROM waitlist;                                   -- how many sign-ups
SELECT phone_type, count(*) FROM waitlist GROUP BY phone_type;   -- Android vs iPhone
DELETE FROM waitlist WHERE email = 'person@example.com';         -- deletion request
```

When the privacy notice changes, also change `CONSENT_VERSION` in `src/index.js`.
