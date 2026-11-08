// Docket Speed: toolbar popup. Edits preferences in chrome.storage.sync and
// asks the background worker to start the reader on the active tab.
const E = globalThis.DocketSpeedEngine;

const wpmInput = document.getElementById("p-wpm");
const wpmVal = document.getElementById("p-wpm-val");
const fontInput = document.getElementById("p-font");
const fontVal = document.getElementById("p-font-val");
const themeSelect = document.getElementById("p-theme");
const pauseCheckbox = document.getElementById("p-pause");
const startBtn = document.getElementById("start-page");
const statusEl = document.getElementById("p-status");

// storage.sync allows 120 writes a minute; debounce slider drags.
const pending = {};
let timer = null;
function save(partial) {
  Object.assign(pending, partial);
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}
function flush() {
  clearTimeout(timer);
  const data = { ...pending };
  for (const k of Object.keys(pending)) delete pending[k];
  if (Object.keys(data).length) chrome.storage.sync.set(data);
}
window.addEventListener("pagehide", flush);

function show(settings) {
  wpmInput.value = settings.wpm;
  wpmVal.textContent = settings.wpm;
  fontInput.value = settings.fontSize;
  fontVal.textContent = settings.fontSize;
  themeSelect.value = settings.theme;
  pauseCheckbox.checked = settings.pauseOnPunctuation;
}

chrome.storage.sync.get(E.DEFAULTS, (stored) => show(E.normalizeSettings(stored)));

wpmInput.addEventListener("input", () => {
  wpmVal.textContent = wpmInput.value;
  save({ wpm: E.clampWpm(wpmInput.value) });
});
fontInput.addEventListener("input", () => {
  fontVal.textContent = fontInput.value;
  save({ fontSize: E.clampFont(fontInput.value) });
});
themeSelect.addEventListener("change", () => save({ theme: themeSelect.value }));
pauseCheckbox.addEventListener("change", () => save({ pauseOnPunctuation: pauseCheckbox.checked }));

startBtn.addEventListener("click", () => {
  flush();
  statusEl.textContent = "";
  startBtn.disabled = true;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab) {
      startBtn.disabled = false;
      statusEl.textContent = "Open a CanLII page first.";
      return;
    }
    chrome.runtime.sendMessage({ type: "DOCKET_SPEED_START_TAB", tabId: tab.id }, (response) => {
      startBtn.disabled = false;
      if (chrome.runtime.lastError || !response) {
        statusEl.textContent = "Something went wrong. Reload the page and try again.";
        return;
      }
      if (response.ok) window.close();
      else statusEl.textContent = response.message || "Couldn’t start the reader on this page.";
    });
  });
});
