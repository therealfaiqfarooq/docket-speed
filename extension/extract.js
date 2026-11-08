// Docket Speed: judgment text extraction (DOM only, no network, no storage).
// Finds the body of a CanLII decision on the page the user is viewing and
// returns it as ordered text blocks. Works on a live document and on jsdom.
//
// Strategy
//  1. Walk the page once, pruning anything that is never content: consent
//     managers, dialogs, fixed/sticky overlays, nav/aside/footer, hidden nodes.
//  2. Find blocks that start with a CanLII paragraph marker "[n]". The
//     container is the DEEPEST element holding at least 80% of them.
//  3. Walk the container again, also pruning toolbars, sidebars, "related"
//     lists, citators and footnotes, unless they hold paragraph markers.
//  4. Drop the header (everything before paragraph [1]) from the word stream.
//  5. No markers? Fall back to the largest text-dense, link-light container
//     (works for legislation). Nothing good enough: report "not-found".

(function (root) {
  "use strict";

  // "[12] text" but not a report citation such as "[2099] 1 S.C.R. 3".
  // Report citations like "[2005] O.J. No. 3896" or "[2019] 4 S.C.R. 653" at the
  // start of a block (lists of cases cited) are not paragraph markers either.
  const MARKER = /^\s*\[(\d{1,4})\](?!\s+\d+\s+\p{L})(?!\s+(?:\p{Lu}[\p{L}&]*\.){1,4}\s*(?:No\.|\d))\s*/u;
  // Page references from printed reporters ("[page268]") and QuickLaw image
  // placeholders ("[QL:GRAPHIC NAME=...]") are noise when read aloud.
  const NOISE = /\[page\s?\d+\]|\[QL:[^\]]*\]/gi;
  const MIN_MARKERS = 3;

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "CANVAS", "IFRAME", "OBJECT",
    "EMBED", "VIDEO", "AUDIO", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "OPTION",
    "LABEL", "IMG", "PICTURE", "MAP", "DIALOG", "MENU"
  ]);
  const STRUCTURAL_SKIP = new Set(["NAV", "ASIDE", "FOOTER", "HEADER"]);
  const BLOCK_TAGS = new Set([
    "P", "DIV", "SECTION", "ARTICLE", "MAIN", "BLOCKQUOTE", "LI", "UL", "OL", "DL",
    "DT", "DD", "H1", "H2", "H3", "H4", "H5", "H6", "TR", "TABLE", "TBODY", "THEAD",
    "TFOOT", "PRE", "FIGURE", "FIGCAPTION", "ADDRESS", "HR", "CENTER", "FORM",
    "FIELDSET", "DETAILS", "SUMMARY", "BODY", "CAPTION"
  ]);
  // Tags whose computed style is worth checking for fixed/sticky/hidden.
  // Inline tags are skipped to keep the walk fast on 100k-word pages.
  const STYLE_CHECK_TAGS = new Set([
    "DIV", "SECTION", "ASIDE", "ARTICLE", "MAIN", "FORM", "UL", "OL", "TABLE",
    "HEADER", "FOOTER", "NAV", "P", "BLOCKQUOTE", "DL"
  ]);

  // Strong signals: never content, wherever they appear.
  const CONSENT_PATTERN =
    /cookie|consent|gdpr|onetrust|ot-sdk|optanon|cookiebot|cybot|trustarc|truste|didomi|qc-cmp|cc-window|cc-banner|cmp-|osano|termly|iubenda|usercentrics|privacy-?banner|newsletter|subscribe-?modal/i;
  const STRONG_ROLES = new Set([
    "navigation", "banner", "contentinfo", "complementary", "dialog", "alertdialog",
    "search", "menu", "menubar", "toolbar", "tablist", "tooltip"
  ]);

  // Weak signals: chrome around the document, pruned only if the element holds
  // fewer than 2 paragraph markers (so a wrapper named "doc-header-and-body"
  // that holds the judgment is never dropped).
  const WEAK_PATTERN =
    /(^|[\s_-])(nav|navbar|menu|toolbar|tool-?bar|breadcrumbs?|sidebar|side-?bar|sidenav|related|citing|cited-?by|citator|noteup|noteups|share|social|print-?tools|advert|ads?|promo|skip|footer|masthead|site-?header|page-?header|banner|metadata|document-?meta|doc-?meta|tabs|pagination|search|footnotes?|endnotes?|fn-?\d*)([\s_-]|$)|footnote|endnote|breadcrumb|sidebar|toolbar|related(docs|documents|decisions)|citingdocs/i;
  const FOOTNOTE_REF = /^#(fn|ftn|footnote|_ftn|endnote|_edn)/i;

  function idClass(el) {
    const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") || "";
    return `${el.id || ""} ${cls}`;
  }

  function styleOf(el, win) {
    if (!win || !el.isConnected) return null;
    try {
      return win.getComputedStyle(el);
    } catch (e) {
      return null;
    }
  }

  function isStrongExcluded(el, win, relaxed) {
    const tag = el.tagName;
    if (SKIP_TAGS.has(tag)) return true;
    if (STRUCTURAL_SKIP.has(tag)) return true;
    if (el.hidden) return true;
    // Some modal scripts set aria-hidden on the whole page while a banner is
    // open, so a second pass ignores it if the first finds nothing.
    if (!relaxed && el.getAttribute("aria-hidden") === "true") return true;
    if (el.getAttribute("aria-modal") === "true") return true;
    const role = el.getAttribute("role");
    if (role && STRONG_ROLES.has(role.toLowerCase())) return true;
    if (CONSENT_PATTERN.test(idClass(el))) return true;
    if (tag === "SUP" || tag === "A") {
      // Inline footnote references: <sup>3</sup>, <a href="#fn3">3</a>
      const href = tag === "A" ? el.getAttribute("href") || "" : "";
      const txt = (el.textContent || "").trim();
      if (FOOTNOTE_REF.test(href) && /^\[?\d{1,3}\]?$/.test(txt)) return true;
      if (tag === "SUP" && /^\[?\d{1,3}\]?$/.test(txt)) return true;
    }
    if (STYLE_CHECK_TAGS.has(tag)) {
      const st = styleOf(el, win);
      if (st) {
        if (st.display === "none" || st.visibility === "hidden") return true;
        if (st.position === "fixed" || st.position === "sticky") return true;
      }
    }
    return false;
  }

  function isWeakExcluded(el) {
    return WEAK_PATTERN.test(idClass(el));
  }

  // Generic block walker. Produces [{ el, text, inQuote, inList, heading, inTable }]
  // in document order. `prune(el)` returns true to skip a subtree; `onTable`
  // lets the caller decide what to do with tables.
  function walkBlocks(rootEl, opts) {
    const blocks = [];
    let buf = [];
    let bufEl = null;
    const ctx = { quote: 0, list: 0, table: 0 };
    let headingDepth = 0;

    function flush() {
      if (!buf.length) return;
      const text = buf.join("").replace(/[ \t\f\v   \r]+/g, " ").replace(/ *\n */g, "\n").trim();
      buf = [];
      if (text) {
        blocks.push({
          el: bufEl,
          text,
          inQuote: ctx.quote > 0,
          inList: ctx.list > 0,
          heading: headingDepth > 0,
          inTable: ctx.table > 0
        });
      }
      bufEl = null;
    }

    function visit(node, blockEl) {
      if (node.nodeType === 3) {
        // Text node
        if (!bufEl) bufEl = blockEl;
        buf.push(node.nodeValue);
        return;
      }
      if (node.nodeType !== 1 && node.nodeType !== 11) return;
      if (node.nodeType === 1) {
        const el = node;
        const tag = el.tagName;
        if (tag === "BR") {
          buf.push("\n");
          return;
        }
        if (el !== rootEl && opts.prune(el)) return;
        if (tag === "TABLE" && opts.onTable) {
          const decision = opts.onTable(el);
          if (decision === "skip") return;
          if (decision === "omit") {
            flush();
            blocks.push({ el, text: "[table omitted]", omitted: true, inQuote: false, inList: false, heading: false, inTable: true });
            return;
          }
        }
        const isBlock = BLOCK_TAGS.has(tag);
        const isHeading = /^H[1-6]$/.test(tag);
        if (isBlock) flush();
        if (tag === "BLOCKQUOTE") ctx.quote++;
        if (tag === "LI") ctx.list++;
        if (tag === "TABLE") ctx.table++;
        if (isHeading) headingDepth++;
        const nextBlockEl = isBlock ? el : blockEl;
        for (let c = el.firstChild; c; c = c.nextSibling) visit(c, nextBlockEl);
        if (isBlock) flush();
        if (tag === "BLOCKQUOTE") ctx.quote--;
        if (tag === "LI") ctx.list--;
        if (tag === "TABLE") ctx.table--;
        if (isHeading) headingDepth--;
        // Inline cells: keep a space between table cells.
        if (tag === "TD" || tag === "TH") buf.push(" ");
        return;
      }
      // DocumentFragment (selection)
      for (let c = node.firstChild; c; c = c.nextSibling) visit(c, blockEl);
    }

    visit(rootEl, rootEl.nodeType === 1 ? rootEl : null);
    flush();
    return blocks;
  }

  // Split a block that holds several "[n]" paragraphs separated by <br>
  // (older CanLII layouts) and merge a bare "[n]" block with the text after it.
  function normalizeBlocks(raw) {
    const out = [];
    for (const b of raw) {
      const lines = b.text.split(/\n(?=\s*\[\d{1,4}\]\s)/);
      for (const line of lines) {
        const text = line.replace(/\s*\n\s*/g, "\n").trim();
        if (text) out.push({ ...b, text });
      }
    }
    const merged = [];
    for (let i = 0; i < out.length; i++) {
      const b = out[i];
      if (/^\[\d{1,4}\]$/.test(b.text) && out[i + 1] && !MARKER.test(out[i + 1].text)) {
        merged.push({ ...out[i + 1], text: `${b.text} ${out[i + 1].text}`, el: b.el });
        i++;
        continue;
      }
      merged.push(b);
    }
    return merged;
  }

  function toOutputBlocks(blocks, maxPara) {
    const limit = maxPara || Infinity;
    return blocks.map((b) => {
      let m = MARKER.exec(b.text);
      if (m && Number(m[1]) > limit) m = null; // a year in brackets, not a paragraph
      const para = m ? Number(m[1]) : null;
      const text = (m ? b.text.slice(m[0].length) : b.text).replace(NOISE, " ").replace(/[ \t]{2,}/g, " ").replace(/\n+/g, "\n");
      let kind = "p";
      if (b.omitted) kind = "omitted";
      else if (b.heading) kind = "heading";
      else if (b.inQuote) kind = "quote";
      else if (b.inList) kind = "list";
      return { text, para, kind };
    }).filter((b) => b.text.trim().length > 0);
  }

  function ancestorsUpTo(el, stop) {
    const list = [];
    for (let n = el; n && n !== stop; n = n.parentElement) list.push(n);
    if (stop) list.push(stop);
    return list;
  }

  function wordCount(blocks) {
    let n = 0;
    for (const b of blocks) n += (b.text.match(/\S+/g) || []).length;
    return n;
  }

  function pageTitle(doc) {
    const t = (doc.title || "").trim();
    const parts = t.split(/\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
    // CanLII titles look like "2019 SCC 65 (CanLII) | Party v. Party | CanLII"
    const filtered = parts.filter((p) => !/^canlii$/i.test(p));
    if (filtered.length >= 2) {
      const cite = filtered[0].replace(/\s*\(CanLII\)\s*$/i, "");
      return `${filtered[1]}, ${cite}`;
    }
    if (filtered.length === 1) return filtered[0];
    const h1 = doc.querySelector("h1");
    return h1 ? h1.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  }

  function extractFromDocument(doc, options) {
    const opts = options || {};
    const win = doc.defaultView || null;
    const body = doc.body;
    const t0 = now();
    if (!body) return { ok: false, reason: "not-found", blocks: [] };

    let relaxed = false;
    let strongCache = new WeakMap();
    const strong = (el) => {
      let v = strongCache.get(el);
      if (v === undefined) {
        v = isStrongExcluded(el, win, relaxed);
        strongCache.set(el, v);
      }
      return v;
    };

    // Pass 1: find paragraph-marker blocks.
    const findMarkers = () =>
      normalizeBlocks(walkBlocks(body, { prune: strong })).filter((b) => MARKER.test(b.text) && b.el);
    // A real paragraph number is never far above the number of markers found;
    // "[2005]"-style years that slip through are dropped here.
    const plausible = (list) => list.filter((b) => Number(MARKER.exec(b.text)[1]) <= list.length * 2 + 20);
    let markerBlocks = plausible(findMarkers());
    if (markerBlocks.length < MIN_MARKERS) {
      relaxed = true;
      strongCache = new WeakMap();
      const retry = plausible(findMarkers());
      if (retry.length >= MIN_MARKERS) markerBlocks = retry;
      else {
        relaxed = false;
        strongCache = new WeakMap();
      }
    }
    const counts = new Map();
    for (const b of markerBlocks) {
      for (const a of ancestorsUpTo(b.el, body)) counts.set(a, (counts.get(a) || 0) + 1);
    }

    if (markerBlocks.length >= MIN_MARKERS) {
      const total = markerBlocks.length;
      const need = Math.ceil(total * 0.8);
      // Deepest ancestor with >= 80% of markers: walk up from the first marker
      // block and stop at the first ancestor that qualifies.
      let container = body;
      for (const b of markerBlocks) {
        let found = null;
        for (const a of ancestorsUpTo(b.el, body)) {
          if ((counts.get(a) || 0) >= need) {
            found = a;
            break;
          }
        }
        if (found && depth(found) > depth(container)) container = found;
      }

      const markerCount = (el) => counts.get(el) || 0;
      const prune = (el) => {
        if (el === container) return false;
        if (strong(el)) return true;
        if (markerCount(el) < 2 && isWeakExcluded(el)) return true;
        return false;
      };
      const onTable = (table) => (markerCount(table) > 0 ? "layout" : "omit");
      const raw = normalizeBlocks(walkBlocks(container, { prune, onTable }));
      let blocks = toOutputBlocks(raw, total * 2 + 20);
      // Header: drop everything before the first numbered paragraph.
      const first = blocks.findIndex((b) => b.para != null);
      const header = first > 0 ? blocks.slice(0, first) : [];
      if (first > 0) blocks = blocks.slice(first);
      // Trailing "[table omitted]" or headings with nothing after them are noise.
      while (blocks.length && (blocks[blocks.length - 1].kind === "omitted")) blocks.pop();
      return {
        ok: blocks.length > 0,
        reason: blocks.length ? null : "not-found",
        method: "markers",
        title: pageTitle(doc),
        headerWords: wordCount(header),
        markers: total,
        blocks,
        words: wordCount(blocks),
        ms: now() - t0
      };
    }

    // Fallback for pages without paragraph markers (legislation, older pages).
    const prune = (el) => strong(el) || isWeakExcluded(el);
    const raw = normalizeBlocks(walkBlocks(body, { prune, onTable: () => "layout" }));
    const scored = [];
    for (const b of raw) {
      if (!b.el) continue;
      const len = b.text.length;
      const linkLen = linkTextLength(b.el, b.text);
      if (len < 25) continue;
      if (linkLen / len > 0.5) continue;
      scored.push({ b, len });
    }
    const totalLen = scored.reduce((s, x) => s + x.len, 0);
    const lenByAncestor = new Map();
    for (const { b, len } of scored) {
      for (const a of ancestorsUpTo(b.el, body)) lenByAncestor.set(a, (lenByAncestor.get(a) || 0) + len);
    }
    let container = null;
    if (totalLen > 0) {
      const need = totalLen * 0.7;
      let best = body;
      for (const [el, len] of lenByAncestor) {
        if (len >= need && depth(el) > depth(best)) best = el;
      }
      container = best;
    }
    if (container) {
      const inner = normalizeBlocks(walkBlocks(container, { prune: (el) => el !== container && prune(el), onTable: () => "omit" }));
      const blocks = toOutputBlocks(
        inner.filter((b) => !b.el || b.omitted || linkTextLength(b.el, b.text) / Math.max(1, b.text.length) <= 0.5)
      );
      const words = wordCount(blocks);
      const substantial = blocks.filter((b) => b.kind !== "omitted" && b.text.length >= 25).length;
      if (words >= 80 && substantial >= 3) {
        return {
          ok: true,
          reason: null,
          method: "fallback",
          title: pageTitle(doc),
          headerWords: 0,
          markers: markerBlocks.length,
          blocks,
          words,
          ms: now() - t0
        };
      }
    }
    return { ok: false, reason: "not-found", method: "none", blocks: [], words: 0, ms: now() - t0 };
  }

  function linkTextLength(el, text) {
    if (!el.querySelectorAll) return 0;
    let n = 0;
    const links = el.querySelectorAll("a");
    for (let i = 0; i < links.length; i++) n += (links[i].textContent || "").trim().length;
    return Math.min(n, text.length);
  }

  function depth(el) {
    let d = 0;
    for (let n = el; n; n = n.parentElement) d++;
    return d;
  }

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  // Selection: keep block structure and paragraph numbers from the selected
  // range. Falls back to plain text (e.g. the context menu's selectionText).
  function extractFromSelection(selection, fallbackText) {
    let blocks = [];
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const frag = selection.getRangeAt(0).cloneContents();
      const prune = (el) => isStrongExcluded(el, null);
      blocks = toOutputBlocks(normalizeBlocks(walkBlocks(frag, { prune, onTable: () => "layout" })));
    }
    if (!blocks.length && fallbackText && fallbackText.trim()) {
      blocks = String(fallbackText)
        .split(/\n\s*\n|\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => {
          const m = MARKER.exec(t);
          return m ? { text: t.slice(m[0].length), para: Number(m[1]), kind: "p" } : { text: t, para: null, kind: "p" };
        });
    }
    return { ok: blocks.length > 0, reason: blocks.length ? null : "empty-selection", method: "selection", blocks, words: wordCount(blocks) };
  }

  const api = { extractFromDocument, extractFromSelection, pageTitle, _internal: { walkBlocks, normalizeBlocks, isStrongExcluded, isWeakExcluded } };
  root.DocketSpeedExtract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
