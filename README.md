# Manga Bookmarker

Bookmark manga and light novels from the sites you read on, and browse them on your own Pinterest-style shelf.

- **Browser extension** (Firefox first, Chrome too). On a series page, click the bookmark button. It reads the title,
  cover, genres, tags, synopsis and chapter count, and lets you pick folders, tags, status and notes before saving.
  On a chapter page it offers to update your last-read chapter. When you open the page of a series you've already
  saved and the site lists more chapters than your library has, the extension saves the new count by itself and the
  corner badge says how many are new. The same series on a different site (found by its title) also gets that page
  added to its links. Its title, cover and other links stay as they are.
- **Your data** lives in a private GitHub repo you own (`library.json` plus a `covers/` folder). Every change is a
  commit, so the history is your backup. Titles, tags, synopses, chapter counts and covers are copied into it, so
  nothing is lost if a site closes. To read a series somewhere else, add that site's link to it on the website: with
  the extension, the page is read and fills in anything new. The ↻ next to a link does the same again later.
- **The website** (`web/`) shows Manga and Light Novels as two shelves, each with All, Unsorted and your folders.
  A series can be in any number of folders. Filter by genre, tag, status or search, and open a series to edit notes,
  progress, tags, folders and the cover. **I'm caught up** sets your last-read chapter to the newest one. The Genres
  screen lists every genre with how many series have it; tick several to find the series that have them.

Sites with their own reader: Mangago, Comix, MangaDex, NovelUpdates, Asura Scans, BornToBeNovel, and scan sites built
on the Madara / MangaThemesia WordPress themes (LunaScans and many others). Any other page falls back to its
title, image and description.

## Setup

### 1. Make your key (once)

Your library is stored in the private repo [kthopeleee/manga-library-data](https://github.com/kthopeleee/manga-library-data).
The key that unlocks it is a GitHub fine-grained token:

1. Open [GitHub → Fine-grained tokens → Generate new token](https://github.com/settings/personal-access-tokens/new).
2. Repository access: **Only select repositories** → `manga-library-data`.
3. Repository permissions → **Contents: Read and write**.
4. Generate it and keep it like a password (a password manager is ideal). Paste it into the website and the
   extension's settings. It is only ever sent to `api.github.com`.

### 2. Install and build

```sh
npm install
npm run build:ext      # writes dist/firefox and dist/chrome
```

### 3. Load the extension

- **Firefox:** open `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* → pick
  `dist/firefox/manifest.json`. (Temporary add-ons are removed when Firefox restarts; see *Publishing* below for a
  permanent install.) Or run `npm run run:firefox` to start a fresh Firefox with it loaded.
- **Chrome:** `chrome://extensions` → turn on *Developer mode* → *Load unpacked* → pick `dist/chrome`.

The extension's settings page opens from the ⚙ in the popup. Your username, repo and website are already filled
in: paste the key and click *Save and test*.

Shortcut: **Alt+Shift+B** opens the popup.

### 4. The website

Live at **https://kthopeleee.github.io/Manga-bookmarker/**. The page is public but the shelf is locked: it shows
nothing until you enter your key (the token from step 1). Your list lives in the private data repo, so without the
key there is nothing to see.

- Untick *Remember on this device* on a shared computer; the key is then forgotten when the tab closes.
- *Lock* (bottom of the sidebar) removes the key and cached covers from that device.
- If a key leaks, delete it on GitHub and make a new one. Nothing else needs changing.

Locally: `npm run dev:web` and open the address it prints.

To publish changes to the site: `npm run deploy:web`. It runs the tests, builds `web/`, and pushes it to the
`gh-pages` branch that GitHub Pages serves. The repo and username the site uses by default are in
`web/src/config.js`.

## Publishing the Firefox extension

For personal use, publish it **unlisted**: Mozilla signs it so it installs permanently, but it's not listed publicly.

1. `npm run lint:ext` (Mozilla's linter; should report 0 errors), then `npm run zip:ext`.
2. Go to <https://addons.mozilla.org/developers/> → *Submit a New Add-on* → **On your own** → upload
   `dist/manga-bookmarker-firefox-<version>.zip`.
3. The code isn't minified or bundled, so no separate source upload is needed.
4. Install the signed `.xpi` it gives you.

Before each new upload, bump `version` in `extension/manifest.json`. The data-collection declaration in the manifest
says the extension sends website content (titles, covers, synopses) to storage you control. Adjust it in
the submission form if Mozilla asks.

## Development

```sh
npm test            # site readers against saved pages in tests/fixtures, plus data/merge/sync tests
npm run watch:ext   # rebuild dist/ on every change (reload the extension in the browser afterwards)
npm run icons       # regenerate extension icons
```

- `shared/`: data model, tags and genres, duplicate matching, GitHub storage. Used by both the extension and the
  website.
- `extension/adapters/`: one file per site. Each one turns a page into
  `{ kind: 'series' | 'chapter', title, coverUrl, genres, tags, … }`.
- `web/`: React + Vite site.

**Adding or fixing a site:** save the series page (and a chapter page) with *Save Page As → Web Page, HTML only*.
Delete anything personal from it (username, session tokens). Put it in `tests/fixtures/`, write the adapter, and
add a test like the ones in `tests/adapters.test.mjs`.
