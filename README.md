# Docket Speed: RSVP Reader for CanLII

Docket Speed is a Manifest V3 Chrome extension that speed-reads CanLII judgments and
legislation one word at a time (rapid serial visual presentation). It highlights the optimal
recognition point of each word, knows about paragraph numbers, and is fully keyboard
driven. Everything runs locally in your browser: no network requests and no data collection.

Not affiliated with or endorsed by CanLII.

## Features

- **Read whole page.** Finds the body of the judgment on a canlii.org page (from paragraph
  [1] to the end) and skips cookie banners, menus, headers, footers, metadata, "related
  documents" and footnotes. The style of cause and citation are shown as the reader's title.
  Statutes fall back to the main text block.
- **Read selection.** Right-click any selected text and choose *Read selection with Docket
  Speed*.
- **Paragraph aware.** Shows "¶ 12" as you read, jumps by paragraph, and has a *Go to ¶* field.
- **Smart pacing.** Pivot letters handle accents and punctuation, citations such as
  `2019 SCC 65` and `s. 7` stay together, and abbreviations like `J.` or `v.` don't cause
  false sentence pauses. English and French.
- **Adjustable.** 100 to 1000 WPM, word size, light and dark themes, time remaining. Settings
  sync; your position is remembered for the browser session.
- **Accessible.** Focus trap, screen-reader labels, and reduced-motion support.
- **Isolated and minimal.** The reader runs in a Shadow DOM and leaves no trace when closed.
  No host permissions and no always-on content script: code is injected only when you click
  the toolbar button or the context-menu item, and only on `canlii.org`.

Permissions: `activeTab`, `scripting`, `contextMenus`, `storage`. None of them shows an
install warning.

## Keyboard controls

| Key | Action |
|-----|--------|
| Space | Play / pause |
| ← / → | Back / forward 10 words |
| Shift+← / → or PageUp / PageDown | Previous / next paragraph |
| ↑ / ↓ | Speed ±20 WPM |
| + / − | Word size |
| T | Toggle theme |
| Home / End | Start / end |
| Esc | Close |

## Install (load unpacked)

1. Clone this repository.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension/` folder (the one with `manifest.json`).
4. Pin Docket Speed from the puzzle-piece menu.
5. Open a decision on canlii.org, click the Docket Speed icon, then **Read whole page**.

Requires Chrome 102 or later.

## Project layout

```
extension/          Everything that ships in the store zip
  manifest.json     MV3 manifest
  background.js     Context menu, URL check, on-demand injection
  engine.js         Tokenizer, pivot letter, pacing, settings helpers (pure functions)
  extract.js        Finds the judgment body on the page
  reader.js         Reader overlay: playback, keyboard, accessibility, cleanup
  reader-styles.js  Reader CSS, applied inside a Shadow DOM
  popup.*           Toolbar popup: "Read whole page" and preferences
  icons/            16, 32, 48 and 128 px icons
tests/
  unit/             node:test + jsdom tests for the engine and extraction
  e2e/              Playwright + Chromium tests with the unpacked extension
  fixtures/         Synthetic CanLII-like pages (fictional parties)
scripts/            Packaging, fixture, icon, screenshot and privacy-page generators
store/              Chrome Web Store listing text, icons, screenshots and promo tiles
docs/NOTES.md       Audit, design decisions and test log
privacy-policy.md   Privacy policy (privacy-policy.html is generated from it)
```

## Build and test

You need Node.js 18 or later.

```bash
npm install            # installs jsdom for the unit tests
npm run test:unit      # unit tests (node:test + jsdom)
npm run test:e2e       # end-to-end tests; needs Playwright and Chromium (see below)
npm test               # both
npm run package        # builds dist/docket-speed-<version>.zip and verifies it
```

The end-to-end tests use Playwright, which isn't listed as a dependency. Install it once with
`npm install --no-save playwright && npx playwright install chromium`.

Other scripts: `npm run fixtures` regenerates the synthetic fixtures, `npm run screenshots`
regenerates the store images, `npm run icons` regenerates the icons (needs Python 3 and
Pillow), and `npm run privacy` rebuilds `privacy-policy.html` from `privacy-policy.md`.

The tests never contact canlii.org. Playwright answers every canlii.org request from the
local fixtures, and Chromium is started with resolver rules that make the real site
unreachable. Because automation can't click Chrome's toolbar, the e2e harness loads a copy of
the extension with a test-only canlii.org host permission standing in for the `activeTab`
grant. The shipped manifest has no host permissions.

### Real CanLII pages

Extra tests run against real CanLII pages saved with *Save as > Webpage, Complete* (HTML
only) in `tests/fixtures/real/`. Those pages are CanLII's content, so the folder is in
`.gitignore` and the tests are skipped when it is missing. The expected files are
`real-scc-vavilov.html`, `real-cookie-banner-vavilov.html`, `real-csc-vavilov-fr.html`,
`real-onca-jones-v-tsige.html` and `real-statute-rta-2006.html`.

## Privacy

Docket Speed collects no data and makes no network requests. It reads the page already open
in your tab, only when you ask. See [privacy-policy.md](privacy-policy.md), also published at
<https://gist.github.com/therealfaiqfarooq/a1902660b2e91ca4e11f886aec00c7fa>.

## License

License to be decided. Until a license is added, all rights are reserved.
