# Chrome Web Store listing: Docket Speed 1.0.0

Copy each block into the matching Developer Dashboard field.

## Store listing tab

**Name** (37 of 75 characters; comes from the manifest)

```
Docket Speed — RSVP Reader for CanLII
```

**Summary / short description** (130 of 132 characters; comes from the manifest)

```
Speed-read CanLII judgments one word at a time with a rapid serial visual presentation (RSVP) reader. Nothing leaves your browser.
```

**Description**

```
Docket Speed turns long CanLII judgments into a fast, focused read. It flashes the decision one word at a time in the centre of a quiet reading panel, with the recognition point of each word highlighted so your eyes stay still instead of scanning across lines.

TWO WAYS TO START
• Click the toolbar icon, then "Read whole page". Docket Speed finds the reasons for judgment and skips the site's menus, cookie notices, citation panels, related-document lists and footers.
• Or select any passage, right-click it, and choose "Read selection with Docket Speed".

BUILT FOR JUDGMENTS
• Paragraph numbers like [12] are shown as a quiet "¶ 12" marker instead of being flashed, and you can jump straight to any paragraph.
• Citations such as "2019 SCC 65", "s. 7" and "para. 85" stay together as one unit.
• Natural pacing: brief pauses at commas, longer ones at sentence ends and paragraph breaks, and abbreviations like "J." or "v." don't trigger false stops.
• Works with French decisions and accented text.
• Handles very long judgments (100,000+ words) without slowing the page down.

CONTROLS
• Speed from 100 to 1000 words per minute (default 400).
• Adjustable word size, light or dark theme, optional punctuation pauses.
• Progress bar, current paragraph and time remaining.
• Keyboard: Space play/pause, ←/→ back or forward 10 words, Shift+←/→ previous or next paragraph, ↑/↓ speed, +/− word size, T theme, Home/End, Esc close.
• Accessible: keyboard-only use, screen-reader labels, focus stays in the reader while it is open, honours "reduce motion", works when zoomed to 200%.

PRIVATE BY DESIGN
• Runs only when you click it, and only on canlii.org pages.
• No account, no analytics, no network requests. Case text is never stored or sent anywhere.
• Only your preferences (speed, theme, word size, punctuation pause) are saved, using Chrome's own settings sync.

Docket Speed is an independent tool. It is not affiliated with, endorsed by, or sponsored by CanLII (the Canadian Legal Information Institute). "CanLII" is used only to describe the website the extension works on.
```

**Category**: Productivity (closest fit; "Education" is the alternative if you want to aim at law students).

**Language**: English (the reader also handles French pages, but the extension's own interface is English).

**Graphics**

| Field | File |
|-------|------|
| Store icon (128x128) | `store/icons/store-icon-128.png` (same as `icons/icon128.png` in the zip) |
| Screenshot 1 | `store/screenshots/1-reader-light.png` |
| Screenshot 2 | `store/screenshots/2-popup.png` |
| Screenshot 3 | `store/screenshots/3-reader-dark-french.png` |
| Screenshot 4 | `store/screenshots/4-reader-provincial.png` |
| Small promo tile (440x280) | `store/promo/small-promo-440x280.png` |
| Marquee (1400x560, optional) | `store/promo/marquee-1400x560.png` |

All screenshots are 1280x800 PNG, taken of the real extension on synthetic pages with fictional parties. No CanLII logo appears anywhere.

**Official URL / Homepage URL**: leave blank, or use the page where you host the privacy policy.
**Support URL**: optional; leave blank or use the policy page. Your contact email goes in the developer account settings.

## Privacy practices tab

**Single purpose**

```
Docket Speed displays the text of the CanLII page the user is viewing, or the text they have selected on it, as a one-word-at-a-time (RSVP) speed reader overlaid on that page.
```

**Permission justifications**

| Permission | Justification (paste) |
|-----------|------------------------|
| `activeTab` | Gives temporary access to the current CanLII tab only after the user clicks the toolbar button or the right-click menu item, so the reader can read that page's text and display it. |
| `scripting` | Injects the bundled reader script into the current tab when the user starts reading; no code runs on any page until the user asks. |
| `contextMenus` | Adds the "Read selection with Docket Speed" item to the right-click menu on canlii.org pages. |
| `storage` | Saves the user's reading preferences (speed, theme, word size, punctuation pause) and, for the current browser session only, the reading position as two numbers. |
| Host permissions | None requested. |

**Remote code**: select **"No, I am not using remote code."** All JavaScript is bundled in the package; there are no external scripts, `eval`, or remotely loaded code.

**Data usage**: tick **none** of the data-type boxes (personally identifiable information, health, financial and payment, authentication, personal communications, location, web history, user activity, website content). Docket Speed reads the page's text only to display it in the reader, on the device, and never collects, stores or transmits it.

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**: the URL where you publish `privacy-policy.html` (see HANDOFF.md, step 3).

## Distribution tab

- Visibility: **Public** (or **Unlisted** first if you want to test the store install yourself before announcing it).
- Regions: **All regions**, or Canada only if you prefer. CanLII is Canadian, but nothing stops a reader elsewhere from using it.
- Pricing: free (the dashboard no longer offers paid items).
