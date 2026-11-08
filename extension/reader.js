// Docket Speed: reader overlay.
// Injected on demand (activeTab + scripting) into the CanLII tab the user is
// viewing, after engine.js, extract.js and reader-styles.js. Everything is
// local DOM work: words are read from this page and shown back over it.
// Nothing is fetched, sent, or stored except preferences (chrome.storage.sync)
// and, for this browser session only, a reading position as two numbers
// (chrome.storage.session).

(function () {
  "use strict";
  if (globalThis.DocketSpeed) return; // already set up in this tab's isolated world

  const E = globalThis.DocketSpeedEngine;
  const X = globalThis.DocketSpeedExtract;
  const HOST_ID = "docket-speed-host";
  const TOAST_ID = "docket-speed-toast";
  const SEEK_WORDS = 10;
  const WPM_STEP = 20;
  const FONT_STEP = 4;

  let st = null; // reader state while open
  let toast = null; // { host, timer }

  // ---------------- Settings ----------------

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(E.DEFAULTS, (stored) => {
          resolve(E.normalizeSettings(chrome.runtime.lastError ? {} : stored));
        });
      } catch (e) {
        resolve(E.normalizeSettings({}));
      }
    });
  }

  // storage.sync allows 120 writes a minute, so slider drags are debounced.
  let pendingSave = {};
  let saveTimer = null;
  function saveSetting(partial) {
    Object.assign(pendingSave, partial);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSettings, 400);
  }
  function flushSettings() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const data = pendingSave;
    pendingSave = {};
    if (!Object.keys(data).length) return;
    try {
      chrome.storage.sync.set(data, () => void chrome.runtime.lastError);
    } catch (e) {
      /* extension reloaded; nothing to do */
    }
  }

  // ---------------- Session position (numbers only) ----------------

  function positionKey() {
    return "pos:" + E.hashKey(location.origin + location.pathname);
  }
  function readPosition(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.session.get(key, (v) => resolve(chrome.runtime.lastError ? null : v && v[key]));
      } catch (e) {
        resolve(null);
      }
    });
  }
  function writePosition() {
    if (!st || !st.posKey) return;
    try {
      chrome.storage.session.set({ [st.posKey]: { i: st.index, n: st.tokens.length } }, () => void chrome.runtime.lastError);
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------- Entry point ----------------

  async function start(opts) {
    const options = opts || {};
    try {
      const settings = await loadSettings();
      const t0 = performance.now();
      const res =
        options.source === "selection"
          ? X.extractFromSelection(window.getSelection(), options.selectionText)
          : X.extractFromDocument(document);
      const t1 = performance.now();
      if (!res.ok || res.words < 3) {
        const message =
          options.source === "selection"
            ? "Select some text on the page first, then right-click it and choose “Read selection with Docket Speed”."
            : "Couldn’t find a judgment on this page. Select the text you want to read, then right-click it and choose “Read selection with Docket Speed”.";
        showToast(message);
        return { ok: false, reason: res.reason || "not-found", message };
      }
      const { tokens, paragraphs } = E.tokenizeBlocks(res.blocks);
      const t2 = performance.now();
      const title = X.pageTitle(document);
      const posKey = options.source === "selection" ? null : positionKey();
      const saved = posKey ? await readPosition(posKey) : null;
      openReader({ tokens, paragraphs, settings, title, posKey, saved, source: options.source || "page" });
      const t3 = performance.now();
      return {
        ok: true,
        method: res.method,
        words: tokens.length,
        paragraphs: paragraphs.length,
        timings: { extractMs: round(t1 - t0), tokenizeMs: round(t2 - t1), openMs: round(t3 - t2), totalMs: round(t3 - t0) }
      };
    } catch (err) {
      const message = "Docket Speed couldn’t open the reader on this page. Try selecting the text and using the right-click menu.";
      showToast(message);
      return { ok: false, reason: "error", message, error: String(err && err.message) };
    }
  }

  function round(n) {
    return Math.round(n * 10) / 10;
  }

  // ---------------- DOM helpers ----------------

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const c of children) {
      if (c == null) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  // Small stroke icons (24x24 grid), drawn with DOM APIs, no external assets.
  const ICONS = {
    play: [["path", { d: "M8 5.5v13l10.5-6.5z", fill: "currentColor", stroke: "none" }]],
    pause: [["rect", { x: "7", y: "5.5", width: "3.5", height: "13", rx: "1", fill: "currentColor", stroke: "none" }], ["rect", { x: "13.5", y: "5.5", width: "3.5", height: "13", rx: "1", fill: "currentColor", stroke: "none" }]],
    back: [["path", { d: "M14.5 7l-5 5 5 5" }]],
    fwd: [["path", { d: "M9.5 7l5 5-5 5" }]],
    prev: [["path", { d: "M17 7l-5 5 5 5" }], ["path", { d: "M7.5 6.5v11" }]],
    next: [["path", { d: "M7 7l5 5-5 5" }], ["path", { d: "M16.5 6.5v11" }]],
    close: [["path", { d: "M7 7l10 10M17 7L7 17" }]],
    sun: [["circle", { cx: "12", cy: "12", r: "3.6" }], ["path", { d: "M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6" }]],
    moon: [["path", { d: "M18.5 14.5A7 7 0 0 1 9.5 5.5a7 7 0 1 0 9 9z" }]]
  };
  function icon(name) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "ico");
    for (const [tag, attrs] of ICONS[name]) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      svg.appendChild(el);
    }
    return svg;
  }

  function attachStyles(shadow) {
    const css = globalThis.DocketSpeedCSS || "";
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
    } catch (e) {
      shadow.appendChild(h("style", { text: css }));
    }
  }

  function makeHost(id) {
    const host = document.createElement("div");
    host.id = id;
    // Inline !important beats any page rule that targets div or *.
    host.style.setProperty("all", "initial", "important");
    host.style.setProperty("display", "block", "important");
    host.style.setProperty("position", "static", "important");
    const shadow = host.attachShadow({ mode: "open" });
    attachStyles(shadow);
    return { host, shadow };
  }

  // ---------------- Toast ----------------

  function showToast(message) {
    hideToast();
    const { host, shadow } = makeHost(TOAST_ID);
    const box = h("div", { class: "root" }, h("div", { class: "toast", role: "status", "aria-live": "polite", text: message }));
    shadow.appendChild(box);
    box.addEventListener("click", hideToast);
    document.documentElement.appendChild(host);
    toast = { host, timer: setTimeout(hideToast, 6500) };
  }
  function hideToast() {
    if (!toast) return;
    clearTimeout(toast.timer);
    toast.host.remove();
    toast = null;
  }

  // ---------------- Reader ----------------

  function buildPanel(settings, title) {
    const els = {};
    els.wordPre = h("span", { class: "pre" });
    els.wordPivot = h("span", { class: "pivot" });
    els.wordPost = h("span", { class: "post" });
    els.wordRow = h("div", { class: "word-row", "aria-hidden": "true" }, els.wordPre, els.wordPivot, els.wordPost);
    els.para = h("span", { class: "para" });
    els.kind = h("span", { class: "quote" });
    els.pct = h("span", { class: "pct" });
    els.left = h("span", { class: "left" });
    els.fill = h("div", { class: "fill" });
    els.rail = h("div", { class: "rail", role: "progressbar", "aria-label": "Reading progress", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, els.fill);
    els.back = h("button", { class: "btn", type: "button", title: `Back ${SEEK_WORDS} words (\u2190)`, "aria-label": `Back ${SEEK_WORDS} words` }, icon("back"), h("span", { class: "btn-label", text: String(SEEK_WORDS) }));
    els.playLabel = h("span", { class: "sr-only", text: "Play" });
    els.playIcon = h("span", { class: "play-icon" }, icon("play"));
    els.play = h("button", { class: "btn primary", type: "button", title: "Play or pause (Space)" }, els.playIcon, els.playLabel);
    els.fwd = h("button", { class: "btn", type: "button", title: `Forward ${SEEK_WORDS} words (\u2192)`, "aria-label": `Forward ${SEEK_WORDS} words` }, h("span", { class: "btn-label", text: String(SEEK_WORDS) }), icon("fwd"));
    els.prevPara = h("button", { class: "btn icon", type: "button", title: "Previous paragraph (Shift+\u2190)", "aria-label": "Previous paragraph" }, icon("prev"));
    els.nextPara = h("button", { class: "btn icon", type: "button", title: "Next paragraph (Shift+\u2192)", "aria-label": "Next paragraph" }, icon("next"));
    els.wpm = h("input", { type: "range", min: String(E.WPM_MIN), max: String(E.WPM_MAX), step: "10", value: String(settings.wpm), "aria-label": "Speed in words per minute" });
    els.wpmVal = h("span", { class: "num", text: String(settings.wpm) });
    els.fontDown = h("button", { class: "btn icon small-a", type: "button", title: "Smaller text (−)", "aria-label": "Smaller text" }, "A");
    els.fontUp = h("button", { class: "btn icon big-a", type: "button", title: "Larger text (+)", "aria-label": "Larger text" }, "A");
    els.themeIcon = h("span", { class: "theme-icon" });
    els.themeLabel = h("span", { class: "sr-only" });
    els.theme = h("button", { class: "btn icon theme-btn", type: "button", title: "Switch theme (T)" }, els.themeIcon, els.themeLabel);
    els.goto = h("input", { type: "number", min: "1", step: "1", inputmode: "numeric", "aria-label": "Go to paragraph number", placeholder: "¶ #" });
    els.gotoForm = h("form", { class: "field goto" }, h("span", { "aria-hidden": "true", text: "Go to" }), els.goto);
    els.close = h("button", { class: "close", type: "button", title: "Close (Esc)", "aria-label": "Close reader" }, icon("close"));
    els.position = h("span", { class: "num-pos" });
    els.live = h("div", { class: "sr-only", role: "status", "aria-live": "polite" });
    els.title = h("span", { class: "title", id: "ds-title", text: title || "Docket Speed reader" });

    const help = h(
      "span",
      { id: "ds-help" },
      "Space play · ← → seek · Shift+← → paragraph · ↑ ↓ speed · + − size · T theme · Esc close"
    );

    els.panel = h(
      "div",
      { class: "panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "ds-title", "aria-describedby": "ds-help", tabindex: "-1" },
      h("div", { class: "header" }, h("span", { class: "mark", "aria-hidden": "true" }, h("span", { class: "dot" }), "Docket Speed"), els.title, els.close),
      h("div", { class: "context" }, h("span", null, els.para, " ", els.kind), h("span", { class: "meta" }, els.pct, h("span", { class: "sep", "aria-hidden": "true", text: "•" }), els.left)),
      h("div", { class: "stage" }, h("div", { class: "tick top" }), els.wordRow, h("div", { class: "tick bottom" })),
      els.rail,
      h("div", { class: "controls" }, els.prevPara, els.back, els.play, els.fwd, els.nextPara),
      h("div", { class: "controls second" },
        h("label", { class: "field speed" }, h("span", { text: "Speed" }), els.wpm, els.wpmVal, h("span", { class: "unit", text: "wpm" })),
        h("span", { class: "spacer" }), els.fontDown, els.fontUp, els.theme, els.gotoForm),
      h("div", { class: "footer" }, els.position, help),
      els.live
    );
    els.backdrop = h("div", { class: "backdrop" }, els.panel);
    els.root = h("div", { class: "root" }, els.backdrop);
    return els;
  }

  function openReader({ tokens, paragraphs, settings, title, posKey, saved, source }) {
    if (st) closeReader();
    hideToast();
    const { host, shadow } = makeHost(HOST_ID);
    const els = buildPanel(settings, title);
    shadow.appendChild(els.root);

    const html = document.documentElement;
    const stops = paragraphs.length ? paragraphs.map((p) => p.start) : tokens.map((t, i) => (t.blockStart ? i : -1)).filter((i) => i >= 0);
    st = {
      host,
      shadow,
      els,
      tokens,
      paragraphs,
      stops,
      settings: { ...settings },
      timeline: E.buildTimeline(tokens, settings.pauseOnPunctuation),
      index: 0,
      playing: false,
      timer: null,
      ramp: 0,
      lastSaved: 0,
      posKey,
      source,
      prevFocus: document.activeElement,
      prevOverflow: [html.style.getPropertyValue("overflow"), html.style.getPropertyPriority("overflow")],
      reducedMotion: !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    };

    if (saved && saved.n === tokens.length && saved.i > 0 && saved.i < tokens.length - 1) {
      st.index = stopAtOrBefore(saved.i);
    }

    html.style.setProperty("overflow", "hidden", "important");
    html.appendChild(host);
    wire();
    applyTheme();
    applyFont();
    render();

    if (st.index > 0) {
      const tok = st.tokens[st.index];
      announce(`Resumed ${tok.para != null ? "at paragraph " + tok.para : "where you left off"}. Press Home to start over.`);
    }
    els.play.focus();
    // Respect reduced motion: wait for the user to press Play instead of flashing at once.
    if (!st.reducedMotion) play();
    else announce("Press Space to start reading.");
  }

  function closeReader() {
    if (!st) return;
    const s = st;
    clearTimeout(s.timer);
    writePosition();
    flushSettings();
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
    try {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch (e) {
      /* ignore */
    }
    s.host.remove();
    const html = document.documentElement;
    if (s.prevOverflow[0]) html.style.setProperty("overflow", s.prevOverflow[0], s.prevOverflow[1]);
    else html.style.removeProperty("overflow");
    if (!html.getAttribute("style")) html.removeAttribute("style");
    st = null;
    if (s.prevFocus && s.prevFocus.isConnected && typeof s.prevFocus.focus === "function") {
      try {
        s.prevFocus.focus({ preventScroll: true });
      } catch (e) {
        /* ignore */
      }
    }
  }

  function wire() {
    const { els } = st;
    els.close.addEventListener("click", closeReader);
    els.backdrop.addEventListener("click", (e) => {
      if (e.target === els.backdrop) closeReader();
    });
    els.play.addEventListener("click", toggle);
    els.back.addEventListener("click", () => seekBy(-SEEK_WORDS));
    els.fwd.addEventListener("click", () => seekBy(SEEK_WORDS));
    els.prevPara.addEventListener("click", () => seekParagraph(-1));
    els.nextPara.addEventListener("click", () => seekParagraph(1));
    els.wpm.addEventListener("input", () => setWpm(els.wpm.value));
    els.fontDown.addEventListener("click", () => setFont(st.settings.fontSize - FONT_STEP));
    els.fontUp.addEventListener("click", () => setFont(st.settings.fontSize + FONT_STEP));
    els.theme.addEventListener("click", toggleTheme);
    els.gotoForm.addEventListener("submit", (e) => {
      e.preventDefault();
      goToParagraph(els.goto.value);
    });
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    try {
      chrome.storage.onChanged.addListener(onStorageChanged);
    } catch (e) {
      /* ignore */
    }
  }

  function onStorageChanged(changes, area) {
    if (!st || area !== "sync") return;
    const next = {};
    for (const k of Object.keys(changes)) next[k] = changes[k].newValue;
    const merged = E.normalizeSettings({ ...st.settings, ...next });
    const pauseChanged = merged.pauseOnPunctuation !== st.settings.pauseOnPunctuation;
    st.settings = merged;
    if (pauseChanged) st.timeline = E.buildTimeline(st.tokens, merged.pauseOnPunctuation);
    st.els.wpm.value = String(merged.wpm);
    st.els.wpmVal.textContent = String(merged.wpm);
    applyTheme();
    applyFont();
    render();
  }

  // ---------------- Keyboard ----------------

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return !["range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image"].includes(type);
    }
    return false;
  }

  function onKeyDown(e) {
    if (!st) return;
    const path = e.composedPath ? e.composedPath() : [e.target];
    const target = path[0];
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeReader();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEditable(target)) return; // typing in the page or in "Go to"
    if (target === st.els.wpm && /^(Arrow|Home$|End$|Page)/.test(e.key)) return; // slider keeps its own keys
    if (e.key === "Tab") {
      trapFocus(e);
      return;
    }
    let handled = true;
    switch (e.key) {
      case " ":
      case "Spacebar":
        toggle();
        break;
      case "ArrowLeft":
        if (e.shiftKey) seekParagraph(-1);
        else seekBy(-SEEK_WORDS);
        break;
      case "ArrowRight":
        if (e.shiftKey) seekParagraph(1);
        else seekBy(SEEK_WORDS);
        break;
      case "PageUp":
        seekParagraph(-1);
        break;
      case "PageDown":
        seekParagraph(1);
        break;
      case "ArrowUp":
        setWpm(st.settings.wpm + WPM_STEP);
        break;
      case "ArrowDown":
        setWpm(st.settings.wpm - WPM_STEP);
        break;
      case "+":
      case "=":
        setFont(st.settings.fontSize + FONT_STEP);
        break;
      case "-":
      case "_":
        setFont(st.settings.fontSize - FONT_STEP);
        break;
      case "t":
      case "T":
        toggleTheme();
        break;
      case "Home":
        seekTo(0);
        break;
      case "End":
        seekTo(st.tokens.length - 1);
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Space activates a focused button on keyup; swallow it so Space only toggles once.
  function onKeyUp(e) {
    if (!st) return;
    const target = e.composedPath ? e.composedPath()[0] : e.target;
    if ((e.key === " " || e.key === "Spacebar") && !isEditable(target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function focusables() {
    return Array.from(st.shadow.querySelectorAll("button, input, [tabindex]:not([tabindex='-1'])")).filter((el) => !el.disabled);
  }

  function trapFocus(e) {
    const list = focusables();
    if (!list.length) return;
    const active = st.shadow.activeElement;
    const i = list.indexOf(active);
    let next;
    if (e.shiftKey) next = i <= 0 ? list[list.length - 1] : list[i - 1];
    else next = i === -1 || i === list.length - 1 ? list[0] : list[i + 1];
    e.preventDefault();
    e.stopPropagation();
    next.focus();
  }

  // ---------------- Playback ----------------

  function toggle() {
    if (st.playing) pause();
    else play();
  }

  function play() {
    if (st.index >= st.tokens.length - 1) st.index = 0;
    st.playing = true;
    st.ramp = 2;
    setPlayButton(true);
    render();
    schedule();
  }

  function pause(finished) {
    st.playing = false;
    clearTimeout(st.timer);
    st.timer = null;
    setPlayButton(false);
    writePosition();
    const tok = st.tokens[st.index];
    announce(finished ? "Finished." : `Paused${tok && tok.para != null ? " at paragraph " + tok.para : ""}, word ${st.index + 1} of ${st.tokens.length}.`);
  }

  function schedule() {
    clearTimeout(st.timer);
    if (!st.playing) return;
    const tok = st.tokens[st.index];
    let d = E.delayMs(tok, st.settings.wpm, st.settings.pauseOnPunctuation);
    if (st.ramp > 0) {
      d *= 1.5;
      st.ramp--;
    }
    st.timer = setTimeout(advance, d);
  }

  function advance() {
    if (!st) return;
    if (st.index >= st.tokens.length - 1) {
      pause(true);
      return;
    }
    st.index++;
    render();
    if (st.index - st.lastSaved >= 100) {
      st.lastSaved = st.index;
      writePosition();
    }
    schedule();
  }

  function seekTo(i) {
    st.index = Math.max(0, Math.min(st.tokens.length - 1, i));
    st.ramp = 2;
    render();
    if (st.playing) schedule();
  }

  function seekBy(delta) {
    seekTo(st.index + delta);
  }

  function stopAtOrBefore(i) {
    let best = 0;
    for (const s of st.stops) {
      if (s <= i) best = s;
      else break;
    }
    return best;
  }

  function seekParagraph(dir) {
    const stops = st.stops;
    if (!stops.length) return;
    const cur = stopAtOrBefore(st.index);
    if (dir < 0) {
      // Within the first few words of a paragraph, go to the previous one.
      if (st.index - cur > 2) return seekTo(cur);
      const k = stops.indexOf(cur);
      return seekTo(k > 0 ? stops[k - 1] : 0);
    }
    const next = stops.find((s) => s > st.index);
    if (next != null) seekTo(next);
  }

  function goToParagraph(value) {
    const n = parseInt(value, 10);
    const p = st.paragraphs.find((x) => x.para === n);
    if (!p) {
      announce(st.paragraphs.length ? `No paragraph ${value} in this text.` : "This text has no numbered paragraphs.");
      return;
    }
    seekTo(p.start);
    announce(`Paragraph ${n}.`);
    st.els.play.focus();
  }

  // ---------------- Settings in the reader ----------------

  function setWpm(v) {
    const wpm = E.clampWpm(v);
    st.settings.wpm = wpm;
    st.els.wpm.value = String(wpm);
    st.els.wpmVal.textContent = String(wpm);
    saveSetting({ wpm });
    renderMeta();
  }

  function setFont(v) {
    st.settings.fontSize = E.clampFont(v);
    saveSetting({ fontSize: st.settings.fontSize });
    applyFont();
    renderWord();
  }

  function toggleTheme() {
    st.settings.theme = st.settings.theme === "paper" ? "ink" : "paper";
    saveSetting({ theme: st.settings.theme });
    applyTheme();
  }

  function setPlayButton(playing) {
    st.els.playLabel.textContent = playing ? "Pause" : "Play";
    st.els.playIcon.replaceChildren(icon(playing ? "pause" : "play"));
  }

  function applyTheme() {
    const dark = st.settings.theme === "ink";
    st.els.root.classList.toggle("dark", dark);
    st.els.themeIcon.replaceChildren(icon(dark ? "sun" : "moon"));
    st.els.themeLabel.textContent = dark ? "Light theme" : "Dark theme";
    st.els.theme.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  }

  function applyFont() {
    st.els.wordRow.style.fontSize = st.settings.fontSize + "px";
  }

  // ---------------- Rendering ----------------

  function render() {
    renderWord();
    renderMeta();
  }

  function renderWord() {
    const tok = st.tokens[st.index];
    if (!tok) return;
    const { before, pivot, after } = E.splitAtOrp(tok.t);
    const els = st.els;
    els.wordPre.textContent = before;
    els.wordPivot.textContent = pivot;
    els.wordPost.textContent = after;
    els.wordRow.className = "word-row kind-" + tok.kind;
    // Shrink long tokens (URLs, long citations) so they fit around the pivot.
    els.wordRow.style.fontSize = st.settings.fontSize + "px";
    const ratio = Math.min(
      els.wordPre.scrollWidth > els.wordPre.clientWidth ? els.wordPre.clientWidth / els.wordPre.scrollWidth : 1,
      els.wordPost.scrollWidth > els.wordPost.clientWidth ? els.wordPost.clientWidth / els.wordPost.scrollWidth : 1
    );
    if (ratio < 1) els.wordRow.style.fontSize = Math.max(14, Math.floor(st.settings.fontSize * ratio * 0.95)) + "px";
  }

  function renderMeta() {
    const { els, tokens, index } = st;
    const tok = tokens[index];
    const n = tokens.length;
    const pct = n > 1 ? Math.round((index / (n - 1)) * 100) : 100;
    els.fill.style.width = pct + "%";
    els.rail.setAttribute("aria-valuenow", String(pct));
    els.pct.textContent = pct + "%";
    els.left.textContent = E.formatRemaining((60000 / st.settings.wpm) * st.timeline[index]);
    els.para.textContent = tok && tok.para != null ? `¶ ${tok.para}` : "";
    els.kind.textContent = tok && tok.kind === "quote" ? "quotation" : tok && tok.kind === "omitted" ? "table skipped" : "";
    els.position.textContent = `${index + 1} / ${n} words`;
  }

  function announce(msg) {
    if (!st) return;
    st.els.live.textContent = "";
    // Next frame so screen readers notice a repeated message.
    setTimeout(() => {
      if (st) st.els.live.textContent = msg;
    }, 30);
  }

  globalThis.DocketSpeed = {
    start,
    close: closeReader,
    isOpen: () => !!st
  };
})();
