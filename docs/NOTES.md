# Docket Speed: working notes

Living log for the v1.0.0 finishing pass. `HANDOFF.md` is the short version.

## 1. Audit of the original zip (v1.0.0 as received)

Files read in full before any change: `manifest.json`, `background.js`, `content.js`,
`content.css`, `popup.html`, `popup.js`, `popup.css`, `README.md`, and the four icons
(16/32/48/128, all RGBA PNG).

Rules checked on the web on 2026-11-04 (not from memory):

- Manifest format (developer.chrome.com/extensions/manifest): `name` max 75 chars,
  `short_name` max 12, `description` max 132; Web Store requires `description` and
  `icons`; `minimum_chrome_version` must be a real version prefix.
- activeTab (developer.chrome.com/docs/extensions/develop/concepts/activeTab): granted by
  clicking the action and by running a context-menu item; allows `scripting.executeScript`
  when `scripting` is declared and exposes the tab URL; shows **no install warning**.
- Storage (developer.chrome.com/extensions/storage): `storage.sync` allows 120 writes/min,
  1800/hour; `storage.session` and `setAccessLevel` exist from Chrome 102.
- Store images (developer.chrome.com/docs/webstore/images): 128x128 icon with 96x96
  artwork and 16px transparent padding, no outer border; screenshots 1280x800 (or
  640x400), full bleed, 1 to 5; small promo 440x280; marquee 1400x560.
- Privacy tab (developer.chrome.com/docs/webstore/cws-dashboard-privacy): single purpose,
  per-permission justification, remote code declaration, data usage + certifications,
  privacy policy URL. Limited Use policy: the site/policy must affirmatively state
  compliance with the Limited Use requirements.

### Findings, ranked (severity: H high, M medium, L low)

| # | Sev | Area | Finding | Resolution |
|---|-----|------|---------|------------|
| 1 | H | Extraction | Generic heuristic breaks ties on equal marker count by **longest** text, so an outer wrapper (judgment + "related documents" + other `<p>` blocks) beats the real judgment container. Every ancestor of the judgment has the same marker count, so the tie case is the normal case. | Rewritten: paragraph-marker blocks are located first, then the **deepest** ancestor holding at least 80% of them is chosen. |
| 2 | H | Extraction | `candidateSelectors` (`#origDocument`, `main`, `article`, ...) are tried **before** scoring and win on any 500 chars of `<p>` text. A cookie banner or sidebar inside `main` is read. Selectors were never verified against CanLII. | Selectors removed from the decision path; container is chosen by structure only. |
| 3 | H | Extraction / perf | `paragraphMarkerCount` calls `innerText` on every `div/section/article/main`: O(n^2) text work with forced layout. On a 100k-word page this can freeze the tab for seconds. | Single DOM walk; no `innerText`; timing recorded in section 4. |
| 4 | H | Extraction | Only `<p>` elements count. Paragraphs in `div`, `li`, `blockquote`, or layout tables are lost, as is paragraph structure (the `paragraphs` array is built but unused). | Block walker over all block elements, keeps paragraph numbers and block boundaries. |
| 5 | H | Isolation | `content.css` is injected globally on every CanLII page, adds a class to `<html>`, and relies on `all: initial` on the root only; page rules for `button`, `input`, `div` still reach children. Toast styles are global too. | Overlay and toast now live in a Shadow DOM; no page-level CSS file at all. Scroll lock is an inline style that is restored on close. |
| 6 | H | Permissions | Manifest requests `activeTab` + `scripting` **and** an always-on content script + `host_permissions`. `activeTab`/`scripting` are unused (the code only messages a declared script), and the declared script triggers the "Read and change your data on canlii.org" install warning. | Chose on-demand injection; see "Injection decision". |
| 7 | M | Reliability | With the declared content script, CanLII tabs that were already open when the extension is installed or updated have no script; "Read whole page" then fails with a misleading "isn't a CanLII case page" error. | Fixed by on-demand injection. |
| 8 | M | Storage quota | Every `input` event of the WPM slider (popup and reader) calls `storage.sync.set`. Dragging the slider easily exceeds 120 writes/min, which throws quota errors and can drop the setting. | Writes debounced (400 ms). |
| 9 | M | Keyboard | Shortcuts fire while focus is in a text field or on the reader's own range slider (arrow keys both move the slider and seek). Space on a focused button toggles twice (native click + handler). Esc did not stop propagation to page handlers. | Editable-target check via `composedPath()`, Space handled on keydown and suppressed on keyup, Esc always closes. |
| 10 | M | Accessibility | No focus move into the dialog, no focus trap, no focus restore, no `aria-modal`, no live status, no reduced-motion handling, fixed-width controls overflow at 200% zoom. | Added all of these. |
| 11 | M | Engine | ORP counts from the first character even when it is punctuation (`“Section` pivots one letter too early), and its length test strips every non-ASCII letter via `[^\w]`, so French `été` measures as 0 letters and `déclaration` as 10 instead of 11. | New ORP on Unicode letters/digits after leading punctuation. |
| 12 | M | Engine | Sentence-end pause fires after abbreviations common in judgments (`s.`, `v.`, `J.`, `para.`, `Ltd.`), giving a long stall mid-sentence. | Abbreviation list; citations like `s. 7`, `2019 SCC 65` kept as one flash. |
| 13 | M | Engine | Position counter shows `index + 1` after `index` was already advanced, so it is off by one during playback; progress never reaches the last word cleanly. | Fixed; covered by e2e. |
| 14 | M | Listing | 128px icon is a full-bleed rounded square with no transparent padding, against Google's 96px-artwork guidance; the store may add its own frame. | Regenerated with a Pillow script (`scripts/make_icons.py`). |
| 15 | M | Policy | README says a one-sentence privacy policy is enough. The Limited Use policy also asks for an affirmative statement of compliance. | Full policy in `privacy-policy.md/.html`. |
| 16 | L | Background | `contextMenus.create` in `onInstalled` without `removeAll` can log "duplicate id" after reloads in development. | `removeAll` then `create`. |
| 17 | L | Manifest | Explicit `content_security_policy` duplicates the MV3 default. Harmless. | Removed (default is stricter or equal). |
| 18 | L | Manifest | `https://www.canlii.org/*` is redundant with `https://*.canlii.org/*` (the `*.` form also matches the bare domain). | Moot after the permission change; URL check in code accepts `canlii.org` and `www.canlii.org`. |
| 19 | L | Manifest | No `minimum_chrome_version`, though new code uses `storage.session` (102+). | `"minimum_chrome_version": "102"`. |
| 20 | L | Safety | `innerHTML` with hand-escaped text (escape skipped quotes). Safe in context but reviewers prefer DOM APIs. | All rendering via `textContent`/DOM nodes. |
| 21 | L | Features | No font-size setting; WPM range 150 to 900 instead of the requested 100 to 1000; README says arrows change speed by 10 while code used 20. | Font size added; WPM 100 to 1000; README and hint text match code. |
| 22 | L | Branding | Name "Docket Speed — RSVP Reader for CanLII" uses CanLII's name. Descriptive ("for CanLII") use is common, but the listing needs a clear non-affiliation line and must not use CanLII's logo. | Disclaimer added to listing, popup footer and README. Question 2 to Faiq. |
| 23 | L | Copy | README's packaging command references `canlii-rsvp` and `icons/make_icons.py`, neither of which exists. | Replaced by `scripts/package.sh`. |

Things that were already right: Manifest V3, service worker background, no remote code, no
`eval`, no network calls anywhere, icons at all four sizes, version `1.0.0`, `storage` only
for preferences.

### Injection decision: activeTab + scripting (on demand), no content script, no host permissions

Chosen: **`activeTab` + `scripting` + `contextMenus` + `storage`**, no `content_scripts`,
no `host_permissions`.

Why:
- **No install warning.** activeTab has none; a declared content script on canlii.org shows
  "Read and change your data on www.canlii.org". Fewer warnings means fewer users bouncing
  and a lighter review.
- **Nothing runs on CanLII until the user asks.** That is the strongest possible reading of
  "only transform the page the user is already viewing" and of least privilege.
- **Both entry points are user gestures that grant activeTab**: clicking the toolbar action
  (which opens the popup) and running the context-menu item.
- **Fixes finding 7**: tabs opened before install work immediately.

Cost: the extension must check the URL itself (activeTab would technically allow any
site). The background worker refuses anything that is not `https://canlii.org/*` or
`https://www.canlii.org/*`, and the context menu uses `documentUrlPatterns` for the same two
origins. French pages (`/fr/...`) are on the same origins and are covered.

Cost 2: automated tests cannot click the real toolbar button, so the e2e suite grants the
same access with a **test-only manifest** that adds `host_permissions` for canlii.org. The
code path (`chrome.scripting.executeScript` from the worker) is identical; only the source of
the permission differs. The activeTab grant itself is in Faiq's manual checklist.

## Decisions made without asking

1. **Injection model**: activeTab + scripting, see above.
2. **Case header**: text before paragraph `[1]` inside the judgment container (style of cause,
   counsel, headnote, CanLII metadata) is **not** flashed. The style of cause and citation,
   when found, are shown once as a static title in the reader panel. Reason: SCC headers and
   headnotes run to hundreds of words of non-reasons text; users who want them can select
   and use "Read selection".
3. **Paragraph numbers**: `[12]` is removed from the word stream and shown as "¶ 12" in the
   reader's context line, with a short pause at each paragraph boundary. Paragraphs are
   seekable (Shift+arrows, PageUp/PageDown) and there is a "Go to ¶" field.
4. **Footnotes**: inline footnote reference numbers are dropped; footnote bodies at the end
   are not read (they arrive out of context after the last paragraph).
5. **Tables**: tables that contain paragraph markers are treated as layout (each row is read
   as text). Other tables are skipped and shown as a single "[table omitted]" flash so the
   reader knows something was there.
6. **Block quotes and lists**: read inline, in order. Quotes get a subtle indicator in the
   context line.
7. **Legislation and other pages**: if there are no paragraph markers, a fallback picks the
   largest text-dense, link-light container (works for statutes). If nothing qualifies, the
   user gets a toast telling them to select text and use the right-click item.
8. **"Read whole page" ignores any current selection** (the old code silently read a
   selection over 40 chars, which surprised in testing). Selection reading is the right-click
   item.
9. **Position memory**: stored in `chrome.storage.session` (memory only, cleared when Chrome
   closes) as `{index, wordCount}` under a hash of the page URL. No text and no plain URL is
   stored. Resumes only if the word count matches.
10. **Font size**: 28 to 80 px, default 46 (the original size). Stored as `fontSize`.
11. **WPM**: 100 to 1000, default 400, arrows change by 20.
12. **Checkpoints**: no GitHub repo is attached, so phase checkpoints are zipped to the
    project's shared folder (`/mnt/project-files/docket-speed/checkpoints/`), which outlives
    this workspace, instead of being messaged one by one.

## 2. Extraction (phase 2)

Fixtures (all **synthetic**, generated by `scripts/make-fixtures.mjs`, filenames start with
`synthetic-`): SCC decision, provincial decision (older layout: `[n]` in table cells, `<br>`
separated paragraphs, list, inline footnote ref, data table), French QCCA decision, statute,
cookie-banner page (OneTrust-style banner with its own `[1] [2] [3]` decoys, a neutral-named
`position: fixed` notice, an `aria-modal` newsletter dialog, and a related-documents sidebar
with `[n]` decoys), a non-judgment search-results page, and a 105,116-word generated
judgment with 1,451 paragraphs. Parties, judges, courts and citations are fictional (years
2090 to 2099). The page shell imitates the general structure of a legal database page; it
is not copied from canlii.org and carries no CanLII branding. Real saved pages go in
`tests/fixtures/real/` and are picked up by the unit tests automatically.

How `extract.js` works now: one DOM walk that prunes strong boilerplate (consent managers by
id/class, dialogs, `aria-modal`, `position: fixed/sticky`, hidden nodes, nav/aside/header/
footer, form controls, footnote reference numbers); the judgment container is the deepest
element holding at least 80% of the `[n]` blocks; a second walk inside it also prunes weak
boilerplate (toolbars, sidebars, related lists, citators, metadata, footnotes) unless the
element holds paragraph markers. Report citations like `[2099] 1 S.C.R. 3` are not taken for
paragraph markers. Pages whose wrapper is `aria-hidden` while a modal is open are retried
without that rule. No `innerText` (no forced layout per element, works in jsdom).

## 3. Engine and UI (phase 3)

- ORP: Unicode-aware (`\p{L}\p{N}`), skips leading punctuation, standard length table
  (1 / 2-5 / 6-9 / 10-13 / 14+ letters -> 1st..5th letter). NFC normalization so decomposed
  accents count as one letter.
- Tokens: soft hyphens and zero-width characters removed; line-break hyphenation
  (`judg-\nment`) joined only between lowercase letters; standalone punctuation (French
  guillemets, dashes, closing brackets) glued to the neighbouring word; neutral citations
  (`2019 SCC 65`, `2020 CanLII 1234`) and `s. 7`, `para. 85`, `art. 1457`, `l'art. 1457`
  kept as one flash.
- Pacing (multipliers of 60000/wpm): long words +6% per letter past 8 (cap +60%); citation
  units +50%, other numbers +20%; sentence end +120% and clause +50% when punctuation pause
  is on; paragraph end +150% (or +60% with punctuation pause off, so paragraphs always get a
  beat); first two words after play/seek x1.5. Abbreviations (`J.`, `C.J.`, `v.`, `S.C.R.`,
  `Mme.`, `p.`, initials...) do not count as sentence ends.
- UI: Shadow DOM (`attachShadow({mode: "open"})`, constructable stylesheet with `<style>`
  fallback), host element with inline `all: initial !important`, scroll lock as a saved and
  restored inline style. Context line shows `¶ n`, quotation/skipped-table hints, percent and
  time remaining (from suffix sums, O(1) per frame). Controls wrap at narrow widths.
- Accessibility: `role="dialog"` + `aria-modal` + label/description, focus moves to Play on
  open, Tab/Shift+Tab trapped in the dialog, focus restored on close, polite live region for
  pause/resume/finish/jump messages (the flashing word itself is `aria-hidden`), visible
  focus rings, `prefers-reduced-motion` disables animation and stops autoplay, pivot colour on
  dark lifted to #E0707F (5.6:1 on the ink background; the original oxblood was 1.7:1).
- Shortcuts are ignored when the event target (via `composedPath()`) is a text field,
  textarea, select or contenteditable, on the page or in the reader. Esc always closes.
- Preferences in `chrome.storage.sync`: `wpm`, `theme`, `pauseOnPunctuation`, `fontSize`.
  Writes debounced. Session position in `chrome.storage.session` as `{i, n}` keyed by an
  FNV-1a hash of origin + path; resumes at the start of the saved paragraph only when the
  word count matches.

## 4. Test log

Commands: `npm run test:unit`, `npm run test:e2e`, `npm run package` (which re-runs the e2e
suite against the unzipped store package).

| Run | Result |
|-----|--------|
| Unit (node:test + jsdom 26), 2026-11-04 | **25 / 25 pass** (13 engine, 12 extraction) |
| E2E (Playwright 1.63, Chromium new headless, unpacked `extension/`), 2026-11-04 | **16 / 16 pass** |
| E2E against unzipped `dist/docket-speed-1.0.0.zip` | **16 / 16 pass** |

Failures found and fixed along the way: two wrong expectations in my own ORP tests; French
elided citation `l'art. 1457` was split (fixed in engine); session position from an earlier
test leaked into later ones (tests now clear session storage); the first listener-count check
only looked at the page's main world (now counts the extension's isolated world through CDP).

E2E coverage: popup "Read whole page" on SCC, cookie-banner, French, provincial and statute
fixtures; non-judgment page shows the "select text instead" toast and popup message;
non-CanLII page is refused and nothing is injected; context-menu path via the worker's
`handleMenuClick` (live selection with paragraph numbers, and the `selectionText` fallback);
Space/←/→/Shift+arrows/PageUp/PageDown/↑/↓/+/−/T/Home/End and the "Go to ¶" field; Space on
a focused button toggles once; typing in a page input does not trigger shortcuts and Esc
still closes; close removes the host element, restores the `<html>` style attribute, leaves
page stylesheets untouched, removes both reader listeners (0 left in the extension world),
restores focus, and keys reach the page again; settings persist across reload in reader and
popup; session position stores only two numbers and resumes; page CSS (`button {text-transform:
uppercase; font-size: 30px}`, `* {letter-spacing}`) does not reach the reader; reduced motion
opens paused with no animation; 640x400 viewport (the CSS size of 200% zoom on 1280x800) has
no clipped controls; zero console errors in pages and the service worker; every request went
to the routed fixture URLs.

Timings, 105,116-word synthetic judgment (Chromium, this cloud VM):

| Measure | Run 1 | Run 2 (packaged zip) |
|---------|-------|------------------|
| Extraction | 45 ms | 73 ms |
| Tokenize | 59 ms | 121 ms |
| Build and show overlay | 42 ms | 62 ms |
| Total in page | 146 ms | 256 ms |
| Worker round trip (inject + start) | 181 ms | 291 ms |
| Timer lag right after open | 8 ms | 5 ms |

jsdom (unit test) for the same page: about 720 ms, which is jsdom overhead, not browser time.

**Not tested here**: the live canlii.org site (deliberately never loaded), real saved CanLII
pages (none provided yet), the real toolbar click and context-menu click granting activeTab
(automation cannot click Chrome's UI; the harness grants the same access with a test-only
host permission), screen readers, and real browser zoom (approximated by viewport size).

## 5 to 7. Store assets, privacy policy, packaging

- Icons from `scripts/make_icons.py` (Pillow, 16x supersampling). 128px icon is 96x96 artwork
  with 16px transparent padding; 16/32px use heavier strokes, and 16px drops the pivot dot,
  which blurred into a smudge. Checked on light and dark in `store/icons/preview-sheet.png`.
- Screenshots: 4 at exactly 1280x800, taken by `scripts/screenshots.mjs` of the real
  extension on synthetic fixtures (dark reader mid-word, popup over the page, light theme
  French, provincial). The popup shot is composited from two real captures because a
  headless browser has no toolbar; no browser chrome is drawn. Promo tile 440x280 and
  marquee 1400x560 rendered from HTML with the icon artwork. All images inspected by eye.
- Privacy policy written against the final code; HTML built from the Markdown by
  `scripts/build-privacy-html.mjs`.
- `npm run package` builds `dist/docket-speed-1.0.0.zip` (33,282 bytes, 13 files +
  `icons/` entry, manifest at root), checks the file list, rejects `host_permissions`,
  content scripts, `eval`/remote URLs, then runs the e2e suite on the unzipped copy.

## Answers from Faiq (2026-11-04, about 05:20 UTC)

1. Real pages received as `Archive.zip`. HTML copied to `tests/fixtures/real/` (the `_files`
   folders, 22 MB, are not needed): `real-scc-vavilov.html`, `real-cookie-banner-vavilov.html`,
   `real-csc-vavilov-fr.html`, `real-onca-jones-v-tsige.html`, `real-statute-rta-2006.html`.
   Results:
   - Vavilov EN, FR and cookie-banner: correct out of the box ([1] to [343], banner excluded,
     header and headnote skipped, last words are the solicitors' list).
   - *Jones v. Tsige* (O.R. reprint layout): **broke**. The stream started inside "Cases
     referred to", because report citations like `[2005] O.J. No. 3896` and `[2004] UKHL 22`
     at the start of a line were taken for paragraph markers. Fixed two ways: the marker
     pattern now rejects `[yyyy]` followed by a reporter abbreviation, and any marker number
     above 2 x (marker count) + 20 is ignored. Also stripped `[page268]` reporter page refs and
     `[QL:GRAPHIC ...]` placeholders. It now reads [1] "SHARPE J.A.: -- Does Ontario law..."
     to "Appeal allowed. Appendix A ... Appendix B ...".
   - Residential Tenancies Act: fallback reads the Act from its title to s. 263, 74,071 words.
   - Added 5 unit tests and 1 e2e test on these pages (exact first and last words, paragraph
     range, no CanLII UI strings such as "Accept all cookies", "Find in document", "retrieved
     on"). In e2e the saved pages' own CanLII scripts throw (their libraries are deliberately
     not served); those page errors are filtered for the real pages only. Every canlii.org
     request, including the saved pages' asset requests, was answered locally; other hosts
     were aborted.
   - Chromium timings: Vavilov EN 155 ms, FR 179 ms, cookie 160 ms, Jones 63 ms, RTA 317 ms
     (extract + tokenize + open).
2. Keep "for CanLII" in the name: yes. No change.
3. Contact email: faiqfarooq307@gmail.com, now in `privacy-policy.md` and `.html` (the HTML
   builder now also supports `mailto:` links).

Pass counts after folding these in: unit **30 / 30**, e2e **17 / 17** on the source folder and
**17 / 17** on the unzipped `dist/docket-speed-1.0.0.zip`.

## Design refresh (2026-11-04, after Faiq's live test: "works great", wants modern, less chunky, light colours)

- Reader: light theme is now the default (`theme: "paper"`; `"ink"` = dark, stored values
  unchanged so settings stay compatible). White panel, 18 px radius, hairline border, soft
  shadow, blurred light backdrop. System sans-serif (Inter if installed) for UI and word,
  pivot `#E5484D` (dark `#FF6B6E`), thin red ticks instead of the caret and guides, 2 px
  progress line. Transport is one centred row of slim icon buttons (inline SVG, built with DOM
  APIs) around a 48 px round play button. Settings row: custom slim slider, A/A size buttons,
  sun/moon theme toggle, Go to field. Footer hint on a hairline. Contrast: muted text 7.6:1,
  hint text 4.8:1 on white; pivot 3.9:1 on white (large text, AA needs 3:1), 6.4:1 on dark.
- Popup: white, 20 px icon and wordmark, dark pill primary button, settings in a soft card,
  slim sliders, toggle switch for punctuation pause, error text `#C62F35` (5.4:1).
- Icon: white tile with a hairline edge (visible on light and dark toolbars), slim rounded
  slate brackets, red pivot dot. Store screenshots and promo tiles regenerated to match.
- Tests updated for the new default theme and markup (theme button selector, `.dark` class).
  Unit **30 / 30**, e2e **17 / 17** after the redesign.
