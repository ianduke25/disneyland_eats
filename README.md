# Disneyland Planner

A daily dashboard for what to eat, where to go, and what's booked at
Disneyland Resort — built as a plain HTML/CSS/JS site for GitHub Pages.
Data is pulled live, in the browser, from two shared Google Sheets
published as CSV — no backend or build step required.

## How it works

- `index.html` — page markup and structure
- `assets/style.css` — styling
- `assets/app.js` — fetches both sheets, computes today's plan and
  reservation conflicts, filters by park/area/tab, and renders everything
- `google-apps-script/checklist-api.gs` — optional backend that syncs
  "tried it" checkmarks across the whole group (see below)

### Eats/Adventures sheet

Expected columns: `Park`, `Area`, `Food`, `Location`, `Priority` (1–3),
and `Eats?` (`1` for food items, `0` for adventures/attractions).

### Reservations sheet

Expected columns: `reservation`, `area`, `date`, `time` (military time,
e.g. `1830` or `18:30`). Reservations on the same day within 90 minutes of
each other are flagged as conflicting (adjust `CONFLICT_WINDOW_MIN` in
`assets/app.js` to change the window).

Both sheets must be shared as **Anyone with the link can view** — the site
fetches them as anonymous CSV exports, the same way you'd share a read-only
link.

## Syncing checkmarks across the group

Checking off an item as "tried" is meant to be shared — if one person
checks it off, everyone should see it checked off. Since this is a static
site with no server of its own, that shared state is kept in the
Eats/Adventures Google Sheet itself, via a small Google Apps Script web
app:

1. Open the Eats/Adventures Google Sheet.
2. **Extensions → Apps Script**.
3. Delete any starter code, paste in the contents of
   `google-apps-script/checklist-api.gs`, and save.
4. **Deploy → New deployment**, type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployment URL (ends in `/exec`) and paste it into
   `CHECKLIST_API_URL` near the top of `assets/app.js`.
6. Commit and push — the site will now read/write checkmarks through that
   script, and a `Checked` column will appear in the sheet automatically.

Until this is set up, checkmarks still work but are saved only to the
browser you're using (the site will show a small note saying so).

Other devices pick up new checkmarks within 30 seconds automatically (no
refresh needed) — see `CHECKLIST_POLL_MS` in `assets/app.js` to adjust.

## Running locally

Any static file server works, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo settings, go to **Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Choose the branch (e.g. `main`) and folder `/ (root)`.
5. Save — the site will publish at `https://<username>.github.io/<repo>/`.
