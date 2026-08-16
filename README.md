# Disney Eats & Adventures

A static guide to what to eat and what to do at Disneyland Resort, built as a
plain HTML/CSS/JS site for GitHub Pages. Data is pulled live, in the browser,
from a shared Google Sheet published as CSV — no backend or build step
required.

## How it works

- `index.html` — page markup and structure
- `assets/style.css` — styling
- `assets/app.js` — fetches the sheet, filters by park/area/tab, and renders
  the food and adventure cards

The sheet is expected to have these columns: `Park`, `Area`, `Food`,
`Location`, `Price`, `Priority` (1–3), and `Eats?` (`1` for food items, `0`
for adventures/attractions).

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
