# Docket Speed privacy policy

**Effective date:** November 4, 2026

**Applies to:** the Docket Speed Chrome extension, version 1.0.0 and later

Docket Speed is a speed-reading tool for pages on canlii.org. This policy explains what the extension does with information. The short version: it works entirely inside your browser, it does not collect anything about you, and it never sends anything anywhere.

## What runs, and where

Docket Speed does nothing until you start it, either by clicking its toolbar button and choosing "Read whole page", or by selecting text on a canlii.org page and choosing "Read selection with Docket Speed" from the right-click menu. At that moment Chrome gives the extension temporary access to that one tab, and the extension:

- reads the text of the page you are viewing (or of your selection) from the page itself,
- shows that text back to you, one word at a time, in a reading panel drawn over the same page.

All of this happens on your device, inside your browser. The text is held in memory only while the reading panel is open, and is discarded when you close it or leave the page.

## What is stored

Docket Speed stores only the following, using Chrome's built-in extension storage:

- **Your preferences**, in `chrome.storage.sync`: reading speed (words per minute), theme (dark or light), word size, and whether to pause longer at punctuation. If you have turned on Chrome sync, Chrome syncs these preferences between your own devices through your Google account, as it does for other extension settings. Docket Speed has no access to your Google account and receives no copy of this data.
- **Your reading position, for the current browser session only**, in `chrome.storage.session`: two numbers (the word you stopped at and the total word count), filed under a short code computed from the page address. No case text and no web address is stored. Chrome keeps session storage in memory and clears it when you close the browser.

No case text, page content, browsing history, or personal information is ever stored.

## What is not collected or shared

- Docket Speed makes **no network requests** of any kind. It does not contact any server, including CanLII's, its developer's, or any third party's.
- It has **no analytics, tracking, advertising, or crash reporting**.
- It does **not sell, rent, transfer, or share** any data with anyone, because it has no data to share.
- It does not use any data to determine creditworthiness or for lending purposes.

The use of information by Docket Speed complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/), including the Limited Use requirements.

## Permissions

- **activeTab**: temporary access to the current tab, granted only when you click the toolbar button or the right-click menu item.
- **scripting**: lets the extension start its built-in reader in that tab.
- **contextMenus**: adds the "Read selection with Docket Speed" item to the right-click menu on canlii.org.
- **storage**: saves the preferences and session reading position described above.

Docket Speed requests no permission to read or change data on any website in the background.

## Removing your data

Uninstalling Docket Speed from `chrome://extensions` removes its stored preferences and session data from your browser. Session data is also cleared every time you close Chrome.

## Relationship to CanLII

Docket Speed is an independent tool. It is not affiliated with, endorsed by, or sponsored by CanLII (the Canadian Legal Information Institute). It only displays pages you are already viewing in your own browser and does not copy, collect, or redistribute CanLII content.

## Changes

If this policy changes, the new version will be posted at this address with a new effective date. Material changes will also be noted in the extension's store listing.

## Contact

Questions about this policy: **[faiqfarooq307@gmail.com](mailto:faiqfarooq307@gmail.com)**
