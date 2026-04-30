# Today in Pankow — coffee-shop event display

A minimalistic showcase page that lists today's upcoming events in Berlin Pankow.
The page is static HTML; the daily refresh is a GitHub Actions cron that scrapes
[eventbrite.de Pankow today](https://www.eventbrite.de/d/germany--berlin--pankow/events--today/?page=1)
and commits the new `events.json` back to the repo. GitHub Pages serves the page.

## What's in here

```
.
├── index.html             # the showcase (loads events.json on the client)
├── events.json            # daily snapshot, committed by the workflow
├── scraper/
│   ├── package.json
│   └── scrape.js          # Playwright scraper
├── .github/workflows/
│   └── update.yml         # daily cron at 02:00 UTC
├── .gitignore
└── README.md
```

## Live URL

After setup the page will be served at:
**https://cislunari.github.io/local-events/**

## One-time setup

1. **Create the repo on GitHub.**
   - Go to https://github.com/new
   - Name: `local-events`
   - Visibility: **Public** (required for free GitHub Pages on a personal account)
   - Don't initialize with a README (this folder already has one)
   - Click *Create repository*

2. **Push this folder up.** Open Terminal, `cd` into the folder this README lives in, then:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/cislunari/local-events.git
   git push -u origin main
   ```

   If you've never used git on this Mac before, you'll be asked to authenticate. The
   simplest path is GitHub's CLI (`brew install gh && gh auth login`) which handles
   credentials for you.

3. **Enable GitHub Pages.**
   - In the repo on GitHub: *Settings → Pages*
   - Source: **Deploy from a branch**
   - Branch: `main`, folder: `/ (root)` → *Save*
   - Wait ~1 minute. The page will appear at the URL above.

4. **Trigger the first scheduled run manually** (optional, but a good smoke test).
   - *Actions* tab → *Daily event refresh* → *Run workflow* → *Run workflow*
   - Watch the run. If it goes green, `events.json` was refreshed and the page is live.

5. **Point your coffee-shop display at the Pages URL.**
   - On the device that drives the screen (iPad / old laptop / Mac mini), open the URL
     in a browser, enter fullscreen / kiosk mode.
   - The page automatically re-fetches `events.json` every 30 minutes and hard-reloads
     itself at 04:00 Berlin local, so once the daily workflow has committed, the
     screen will pick up the new list without any manual action.

## How the daily refresh works

```
GitHub Actions cron (02:00 UTC)
  └─ runs scraper/scrape.js with Playwright + Chromium
        └─ writes events.json
              └─ commits & pushes back to main
                    └─ GitHub Pages re-deploys automatically (~30s)
                          └─ index.html re-fetches events.json on its 30-min interval
```

Manual trigger any time: *Actions → Daily event refresh → Run workflow*.

## Local development / testing

To regenerate `events.json` on your Mac (e.g., to verify a change before pushing):

```bash
cd scraper
npm install
npx playwright install chromium
node scrape.js          # writes ../events.json
```

Then open `index.html` via a tiny local server (browsers block `fetch()` from
`file://`):

```bash
# from the repo root
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Things that can break and how to spot them

- **Eventbrite changes their HTML.** The scraper relies on JSON-LD plus a CSS class
  (`section.discover-vertical-event-card`) for time extraction. If a workflow run
  errors out or `events.json` shows 0 events, it's almost certainly that. Open the
  failed Actions log; the scraper logs which step failed.
- **Eventbrite blocks the runner IP.** Cloud IPs get challenged sometimes. Symptoms:
  `events.json` becomes empty or the scraper times out waiting for cards. Re-running
  often works. If it persists, switch to running the scraper on your Mac (option 1
  in the original plan) or the Eventbrite API (option 4).
- **Workflow stops running.** GitHub auto-disables scheduled workflows in repos
  with no activity for 60 days. A single push or a manual run resets the counter.

## License

Personal project — code is yours.
