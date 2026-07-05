# ggapp-to-backloggd-migrator

Migrate your game collection from GGApp to Backloggd.

## How it works

Two steps. First it pulls your games from GGApp's API and saves them to a JSON file. Then it opens a browser, logs into Backloggd, and adds each game through the site's search-and-add flow.

You can also run both steps together with `migrate`.

## What gets extracted

- Games with play status (Playing, Beaten, Completed, Shelved, Abandoned, Want to Play)
- Wishlist games (needs a one-time login to GGApp)
- Custom lists and list membership
- Backloggd does the rest: it handles ratings, reviews, play status, and custom lists

## Requirements

- Node.js 18 or higher
- A GGApp account
- A Backloggd account

## Setup

```bash
npm install
npx playwright install chromium
```

## Usage

### 1. Login to GGApp (only needed once)

The public API covers most data but wishlist games require authentication:

```bash
npm run login
```

A browser window opens. Click "Log in", enter your credentials, and you are done. The session is saved locally.

### 2. Extract data from GGApp

```bash
npm run extract -- your-ggapp-username
```

This saves your games to `data/ggapp-data.json`. If you did the login step, it also pulls your wishlist.

### 3. Login to Backloggd (first time only)

```bash
npm run import
```

If no session is saved, it opens a browser for you to log in. The session is saved for future runs.

### 4. Import to Backloggd

```bash
npm run import -- data/ggapp-data.json
```

By default it skips games that already exist. Flags:

| Flag | Options | Default |
|---|---|---|
| `--on-conflict` | skip, merge, overwrite, ask | skip |
| `--throttle` | slow, normal, fast | normal |
| `--headless` | true, false | true |

### All in one

```bash
npm run migrate -- your-ggapp-username
```

This extracts and imports in one go.

### Conflict policy

- `skip`: leave existing games as they are
- `overwrite`: replace status, rating, review
- `merge`: combine data where possible
- `ask`: prompt per game

## File structure

```
data/ggapp-data.json   extracted games
data/not-found.json    games that could not be matched on Backloggd
data/report.json       import results
sessions/ggapp.json    GGApp browser session
sessions/backloggd.json Backloggd browser session
```

## Notes

- Game matching is done by exact name. Unmatched games go to `not-found.json` so you can fix them manually.
- The GGApp extractor uses their public GraphQL API (api.ggapp.io). No scraping involved.
- The Backloggd import uses Playwright. It runs headless by default.
- Ratings from GGApp (1.0–5.0 scale) are converted to Backloggd's 0.5–5.0 scale.
