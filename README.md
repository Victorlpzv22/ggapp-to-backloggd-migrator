# ggapp-to-backloggd-migrator

Migrate your game collection from GGApp to Backloggd.

## How it works

Two steps. First it pulls your games from GGApp's API and saves them to a JSON file. Then it opens a browser, logs into Backloggd, and adds each game through the site's search-and-add flow.

You can also run both steps together with `migrate`.

## What gets migrated

- Games with play status (Playing, Beaten, Completed, Shelved, Abandoned, Want to Play)
- Wishlist games (requires a one-time login to GGApp)
- Ratings and reviews
- Custom lists and list membership
- Playtime, platforms, achievements (where supported by Backloggd)

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

### 1. Login to GGApp (only once)

The public API covers most data, but pulling your full wishlist requires authentication:

```bash
npm run login
```

A browser window opens. Click "Log in", enter your credentials, and you are done. The session is saved locally to `sessions/ggapp.json`.

### 2. Extract data from GGApp

```bash
npm run extract -- your-ggapp-username
```

This saves your games to `data/ggapp-data.json`. If you did the login step, the full wishlist is included.

You can change the output path with `--data-file`:

```bash
npm run extract -- your-ggapp-username --data-file data/my-library.json
```

### 3. Login to Backloggd (first time only)

```bash
npm run import
```

If no session is saved, it opens a visible browser for you to log in. The session is saved to `sessions/backloggd.json` and reused on future runs.

### 4. Import to Backloggd

```bash
npm run import -- data/ggapp-data.json
```

By default it skips games that already exist on Backloggd. Available flags:

| Flag | Options | Default |
|---|---|---|
| `--on-conflict` | skip, merge, overwrite, ask | skip |
| `--throttle` | slow, normal, fast | normal |
| `--headless` | true, false | true |
| `--data-file` | path to input JSON | `data/ggapp-data.json` |
| `--session-dir` | path to session directory | `sessions` |
| `--config` | path to config JSON | — |

### Re-running on not-found games

Games that Backloggd could not match (special characters in the title, IGDB slug mismatches, etc.) are saved to `data/not-found.json`. After fixing them, you can re-run the import directly on that file:

```bash
npm run import -- --data-file data/not-found.json
```

The importer accepts the compact `{title, status, lists}[]` format used by `not-found.json` in addition to the full extraction format.

> **`not-found.json` vs `not-found-importable.json`**
>
> - `data/not-found.json` contains only `{ title, status, lists }`. Re-importing it works, but every game falls back to **title search** on Backloggd (slug fields are absent).
> - `data/not-found-importable.json` is produced by `scripts/build-importable-not-found.ts` and **enriches** each not-found entry with `gameId`, `token`, `slug`, and `_slugVariants` from `ggapp-data.json` so the importer can retry the slug-based path. Prefer this file for re-runs after fixing the original extraction.

### All in one

```bash
npm run migrate -- your-ggapp-username
```

Extracts and imports in one go. Add `--direct` to skip the intermediate JSON file.

### Conflict policy

- `skip`: leave existing games on Backloggd as they are (list membership is still synced)
- `overwrite`: replace status, rating, review
- `merge`: combine data where possible
- `ask`: prompt per game

## Game matching

The importer tries several strategies to find each game on Backloggd, in order:

1. Navigate directly to the GGApp IGDB slug (`/games/{slug}/`)
2. Try a clean slug built from the title (strips ™, ®, ©, [duplicate] tags, and special characters)
3. Try a variant of the clean slug with apostrophes removed
4. Try a variant with Roman numerals converted to digits (e.g. `hellblade-ii` → `hellblade-2`)
5. Search by the cleaned title and match the first result that starts with the title

Most games resolve on step 1. The fallback chain catches games where GGApp's slug has special characters that Backloggd handles differently. Unmatched games still go to `not-found.json` for manual review.

## File structure

```
data/ggapp-data.json       extracted games
data/not-found.json        games that could not be matched on Backloggd
data/not-found-importable.json  enrichment of not-found.json with original slugs/IDs
data/report.json           import results
sessions/ggapp.json        GGApp browser session
sessions/backloggd.json    Backloggd browser session
```

## Scripts

- `npm run login` — log in to GGApp interactively (one time)
- `npm run extract -- <username>` — extract your library to JSON
- `npm run import` — log in to Backloggd if needed
- `npm run import -- data/ggapp-data.json` — import a JSON file to Backloggd
- `npm run migrate -- <username>` — extract and import in one step
- `npm test` — run the unit tests
- `npx tsc --noEmit` — type-check the source

## Notes

- Game matching uses IGDB slugs (shared between GGApp and Backloggd) with a title-based fallback. Unmatched games are saved to `data/not-found.json`.
- The GGApp extractor uses the public GraphQL API at `api.ggapp.io`. No scraping involved.
- The Backloggd import uses Playwright. It runs headless when a saved session is available, and visible on first run to allow manual login.
- Ratings from GGApp (1.0–5.0 scale) are converted to Backloggd's 0.5–5.0 scale.
- List membership is synced on every game, regardless of the `--on-conflict` policy, so running with `skip` will still populate your custom lists.
