// Docket Speed: background service worker.
// - Registers the right-click "Read selection with Docket Speed" item.
// - Starts the reader in a tab when the user clicks "Read whole page" in the
//   popup or uses the right-click item. Both are user gestures that grant
//   temporary activeTab access, so the extension needs no host permissions
//   and nothing runs on CanLII until the user asks.

const MENU_ID = "docket-speed-read-selection";
const CANLII_PATTERNS = ["https://canlii.org/*", "https://www.canlii.org/*"];
const CANLII_HOSTS = new Set(["canlii.org", "www.canlii.org"]);
const READER_FILES = ["engine.js", "extract.js", "reader-styles.js", "reader.js"];

function isCanLII(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && CANLII_HOSTS.has(u.hostname);
  } catch (e) {
    return false;
  }
}

// Let the injected reader keep a reading position (two numbers) in session
// storage. Session storage lives in memory and is cleared when Chrome closes.
function allowSessionAccess() {
  try {
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
  } catch (e) {
    /* older Chrome: position memory is simply unavailable */
  }
}
allowSessionAccess();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Read selection with Docket Speed",
      contexts: ["selection"],
      documentUrlPatterns: CANLII_PATTERNS
    });
  });
});

const NOT_CANLII =
  "Docket Speed works on canlii.org pages. Open a decision there, then try again.";
const CANT_RUN =
  "Docket Speed can’t run on this tab. Reload the CanLII page and try again.";

// Injects the reader into the tab (or frame) and starts it. Returns
// { ok, reason, message, ... } from the page.
async function startReading(tab, source, selectionText, frameId) {
  if (!tab || tab.id == null) return { ok: false, reason: "no-tab", message: NOT_CANLII };
  if (!isCanLII(tab.url)) return { ok: false, reason: "not-canlii", message: NOT_CANLII };
  const target = { tabId: tab.id };
  if (typeof frameId === "number" && frameId > 0) target.frameIds = [frameId];
  try {
    await chrome.scripting.executeScript({ target, files: READER_FILES });
    const results = await chrome.scripting.executeScript({
      target,
      func: (opts) => globalThis.DocketSpeed.start(opts),
      args: [{ source, selectionText: selectionText || "" }]
    });
    const result = results && results[0] && results[0].result;
    return result || { ok: false, reason: "no-result", message: CANT_RUN };
  } catch (e) {
    return { ok: false, reason: "inject-failed", message: CANT_RUN, error: String(e && e.message) };
  }
}

// Called by the context-menu listener (and directly by the e2e tests).
function handleMenuClick(info, tab) {
  if (!info || info.menuItemId !== MENU_ID) return Promise.resolve({ ok: false, reason: "other-menu" });
  return startReading(tab, "selection", info.selectionText, info.frameId);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleMenuClick(info, tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "DOCKET_SPEED_START_TAB") return false;
  // Only the extension's own popup page may ask.
  if (sender.id !== chrome.runtime.id || !String(sender.url || "").startsWith(chrome.runtime.getURL("popup.html"))) return false;
  chrome.tabs.get(message.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      sendResponse({ ok: false, reason: "no-tab", message: NOT_CANLII });
      return;
    }
    startReading(tab, "page").then(sendResponse);
  });
  return true; // async response
});
