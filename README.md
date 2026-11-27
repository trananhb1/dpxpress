# DP Xpress website (dpxpress.net)

Static HTML/CSS, served as-is by **GitHub Pages**. There is no framework and no build step. There is a little vanilla JS: `nav.js` for the mobile menu and `form.js` for the form fallback. The site works without JS.

**Status:** draft. The GitHub repo has not been created and nothing has been pushed or deployed (tom-agent handles that). The forms do **not** send anywhere yet.

## Layout
| Path | Served? | What |
|---|---|---|
| `docs/` | **Yes. This is the GitHub Pages publishing folder** | the 8 pages, `styles.css`, `nav.js`, `form.js`, `fonts/` (Archivo, SIL OFL), `CNAME` (`dpxpress.net`) |
| `worker/` | No | Cloudflare Worker stub for `/api/courier` and `/api/driver`, plus its tests |
| `README.md`, `RESEARCH.md`, `FACTS_NEEDED.md`, `CREDITS.md`, `screenshots/` | No | internal notes |

**GitHub Pages setting:** Settings → Pages → *Deploy from a branch* → `main` / **`/docs`**. Don't publish from the repo root. That would serve `FACTS_NEEDED.md` and `worker/` as public URLs.

All links are root-relative (`/styles.css`, `/about.html`). They work on `dpxpress.net`. They will **not** work at a `username.github.io/repo/` project URL, because paths resolve to the wrong root there. Preview on the custom domain, or locally:
```
python3 -m http.server 8000 -b 127.0.0.1 -d docs
```

The header and footer are copied into every page. If you change the nav, change it in all 8 HTML files.

## Forms today (no backend)
The forms POST to `/api/courier` and `/api/driver`. GitHub Pages can't accept a POST, so for now:
- **With JS** (`form.js`), the browser's own validation runs first. Then the form is sent with `fetch`. If the response is anything other than a redirect to `/thanks.html`, the form stays filled in and a yellow box tells the person to call 0433 573 850 or email dpxpresssupport@gmail.com. This was tested locally against a static server, which answered the POST with 501.
- **Without JS**, the POST lands on GitHub's error page. Every form has a visible line under it with the phone number and email for this case.

No third-party form service is used.

## The Worker (`worker/`, not deployed)
- `src/index.js` routes `POST /api/courier` and `POST /api/driver`. Other paths return 404, and other methods return 405.
- `src/forms.js` does the following:
  - trims and length-checks every field, checks email and phone shape, and whitelists select/radio values
  - requires consent on the driver form
  - caps the body at 32 KB
  - checks the honeypot (`hp_check`): if it's filled, it returns the normal success redirect and sends nothing
  - returns a 400 for invalid input
  - returns a **503** if sending isn't configured. It never returns a fake success.
  - on success, sends one email via the `send_email` binding, then returns a 303 to `/thanks.html`
  - never logs form contents
- Tests: `cd worker && npm test` (Node 18+, no dependencies).

### To go live with the Worker
1. Put dpxpress.net on Cloudflare with the DNS record proxied. GitHub Pages stays the origin. Add a Worker route `dpxpress.net/api/*`.
2. Turn on Email Routing for the zone. Verify the destination inbox, which Email Routing requires.
3. Worker config: env vars `FORM_TO_EMAIL` (the destination) and `FORM_FROM_EMAIL` (a sender on dpxpress.net), and a `send_email` binding named `SEND_EMAIL`. Check the current Cloudflare docs for the exact `wrangler` syntax.
4. Deploy, submit both forms once, and confirm the emails arrive and the browser lands on `/thanks.html`.

Don't hardcode addresses or secrets. To use a different provider, replace `deliver()` in `worker/src/forms.js` and keep the `isConfigured()` gate. Check the provider's current pricing; don't assume it's free.
