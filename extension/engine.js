// Docket Speed: RSVP engine (pure functions, no DOM).
// Turns text blocks into display tokens, picks the optimal recognition point
// (ORP) for each token, and works out how long each token stays on screen.
// Loaded into the page's isolated extension world on demand, and required
// directly by the Node unit tests.

(function (root) {
  "use strict";

  const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
  const LEADING_ATTACH = /^[«“‘„‹(\[¿¡"']+$/u; // glue to the next word
  const TRAILING_ATTACH = /^[»”’›)\].,;:!?…"'%]+$/u; // glue to the previous word
  const DASH_ONLY = /^[—–-]+$/u;
  const SENTENCE_END = /[.!?…]["'”’»)\]]*$/u;
  const CLAUSE_END = /[,;:—–]["'”’»)\]]*$/u;

  // Abbreviations that end in a period but do not end a sentence. Lowercased,
  // compared after stripping leading punctuation.
  const ABBREVIATIONS = new Set([
    "mr.", "mrs.", "ms.", "dr.", "prof.", "hon.", "rev.", "st.", "sr.", "jr.",
    "j.", "jj.", "j.a.", "jj.a.", "c.j.", "c.j.c.", "c.j.o.", "c.j.q.", "a.c.j.",
    "v.", "vs.", "c.", "cf.", "e.g.", "i.e.", "viz.", "al.", "ibid.", "id.",
    "inc.", "ltd.", "co.", "corp.", "bros.", "assn.", "dept.", "govt.",
    "no.", "nos.", "s.", "ss.", "subs.", "para.", "paras.", "p.", "pp.",
    "art.", "arts.", "ch.", "r.", "rr.", "reg.", "regs.", "sch.", "cl.", "fig.",
    "vol.", "ed.", "eds.", "ont.", "que.", "alta.", "sask.", "man.", "nfld.",
    "can.", "fed.", "supp.", "app.", "div.", "gen.", "q.b.", "k.b.",
    // French
    "m.", "mm.", "mme.", "mlle.", "me.", "mtre.", "al.", "par.", "chap.", "réf.",
    "c.-à-d.", "p.ex."
  ]);

  // Abbreviations that are normally followed by a number and read as one unit:
  // "s. 7", "para. 12", "art. 1457", "c. C-46".
  const CITE_PREFIX = new Set([
    "s.", "ss.", "subs.", "para.", "paras.", "par.", "p.", "pp.", "art.", "arts.",
    "r.", "rr.", "c.", "ch.", "chap.", "no.", "nos.", "sch.", "reg.", "cl.", "vol.",
    "fig.", "al.", "§"
  ]);

  const YEAR = /^[([]?\d{4}[)\]]?$/;
  const COURT_CODE = /^(?:[A-Z][A-Za-z]{1,7}|CanLII)$/; // SCC, ONCA, CSC, QCCA, BCSC, FCA, CanLII
  const CASE_NUMBER = /^\d{1,6}[,.;:)\]]*$/;

  function stripLeadingPunct(word) {
    const chars = Array.from(word);
    let i = 0;
    while (i < chars.length && !LETTER_OR_DIGIT.test(chars[i])) i++;
    return chars.slice(i).join("");
  }

  function isAbbreviation(word) {
    const w = stripLeadingPunct(word).toLowerCase().replace(/["'”’»)\]]+$/u, "");
    if (ABBREVIATIONS.has(w)) return true;
    // Initials and dotted abbreviations: "A.", "S.C.R.", "R.S.C.", "U.S."
    if (/^(?:\p{L}\.){1,4}$/u.test(w)) return true;
    return false;
  }

  function cleanText(text) {
    return String(text)
      .normalize("NFC")
      .replace(/[­​‌‍⁠﻿]/g, "") // soft hyphen, zero-width
      // Line-break hyphenation: "judg-\nment" -> "judgment" (lowercase both sides only,
      // so "Smith-\nJones" and real compounds on one line are left alone).
      .replace(/(\p{Ll})-[ \t]*\n[ \t]*(\p{Ll})/gu, "$1$2");
  }

  // Split one block's text into raw words, then merge punctuation and citations.
  function wordsOf(text) {
    const raw = cleanText(text).split(/\s+/u).filter(Boolean);
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      let w = raw[i];
      // Opening punctuation on its own ("«", "(") glues onto the next word.
      while (LEADING_ATTACH.test(w) && i + 1 < raw.length) {
        w = w + raw[i + 1];
        i++;
        if (!LEADING_ATTACH.test(w)) break;
      }
      // Closing punctuation and lone dashes glue onto the previous word.
      if ((TRAILING_ATTACH.test(w) || DASH_ONLY.test(w)) && out.length) {
        out[out.length - 1].t += DASH_ONLY.test(w) ? " " + w : w;
        continue;
      }
      out.push({ t: w, multi: false });
    }

    // Citation grouping.
    const merged = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      const b = out[i + 1];
      const c = out[i + 2];
      // Neutral citation: 2019 SCC 65 / 2021 ONCA 12 / 2020 CanLII 1234
      if (b && c && YEAR.test(a.t) && COURT_CODE.test(b.t) && CASE_NUMBER.test(c.t)) {
        merged.push({ t: `${a.t} ${b.t} ${c.t}`, multi: true });
        i += 2;
        continue;
      }
      // s. 7 / para. 12 / art. 1457 / c. C-46
      // French elision: "l'art. 1457", "d'art. 12"
      const lower = (stripLeadingPunct(a.t).toLowerCase() || a.t).replace(/^(?:l|d|qu|j|n|s|m|t|c)['’]/u, "");
      if (b && CITE_PREFIX.has(lower) && /^[(\[]?[\p{N}A-Z]/u.test(b.t) && /\p{N}/u.test(b.t)) {
        merged.push({ t: `${a.t} ${b.t}`, multi: true });
        i += 1;
        continue;
      }
      merged.push(a);
    }
    return merged;
  }

  function classify(word) {
    if (SENTENCE_END.test(word) && !isAbbreviation(word)) return "sentence";
    if (CLAUSE_END.test(word)) return "clause";
    return null;
  }

  // blocks: [{ text, para (number|null), kind ('p'|'heading'|'quote'|'list'|'omitted') }]
  // Returns { tokens, paragraphs } where paragraphs lists the token index at
  // which each numbered paragraph starts.
  function tokenizeBlocks(blocks) {
    const tokens = [];
    const paragraphs = [];
    let currentPara = null;
    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b];
      const words = wordsOf(block.text || "");
      if (!words.length) continue;
      if (block.para != null) {
        currentPara = block.para;
        paragraphs.push({ para: block.para, start: tokens.length });
      }
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        tokens.push({
          t: w.t,
          multi: w.multi,
          end: classify(w.t),
          blockEnd: i === words.length - 1,
          blockStart: i === 0,
          block: b,
          para: currentPara,
          kind: block.kind || "p"
        });
      }
    }
    return { tokens, paragraphs };
  }

  function tokenizeText(text) {
    const blocks = String(text)
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const m = /^\[(\d{1,4})\]\s*/.exec(t);
        return m ? { text: t.slice(m[0].length), para: Number(m[1]), kind: "p" } : { text: t, para: null, kind: "p" };
      });
    return tokenizeBlocks(blocks);
  }

  // Optimal recognition point, as an index into Array.from(word) (code points).
  // Leading punctuation is skipped; the pivot always lands on a letter or digit.
  // Length table (letters/digits of the first word): 1 -> 1st, 2-5 -> 2nd,
  // 6-9 -> 3rd, 10-13 -> 4th, 14+ -> 5th.
  function orpIndex(word) {
    const chars = Array.from(String(word));
    let start = 0;
    while (start < chars.length && !LETTER_OR_DIGIT.test(chars[start])) start++;
    if (start >= chars.length) return 0;
    let coreLen = 0;
    for (let i = start; i < chars.length && chars[i] !== " "; i++) {
      if (LETTER_OR_DIGIT.test(chars[i])) coreLen++;
    }
    let target;
    if (coreLen <= 1) target = 0;
    else if (coreLen <= 5) target = 1;
    else if (coreLen <= 9) target = 2;
    else if (coreLen <= 13) target = 3;
    else target = 4;
    let seen = -1;
    for (let i = start; i < chars.length; i++) {
      if (LETTER_OR_DIGIT.test(chars[i])) {
        seen++;
        if (seen === target) return i;
      }
    }
    return start;
  }

  function splitAtOrp(word) {
    const chars = Array.from(String(word));
    const i = orpIndex(word);
    return {
      before: chars.slice(0, i).join(""),
      pivot: chars[i] || "",
      after: chars.slice(i + 1).join("")
    };
  }

  // Multiplier on the base delay (60000 / wpm) for one token.
  function delayFactor(token, pauseOnPunctuation) {
    let m = 1;
    const letters = (token.t.match(/[\p{L}\p{N}]/gu) || []).length;
    if (letters > 8) m += Math.min(0.6, (letters - 8) * 0.06);
    if (token.multi) m += 0.5;
    else if (/\p{N}/u.test(token.t)) m += 0.2;
    let punct = 0;
    if (pauseOnPunctuation) {
      if (token.end === "sentence") punct = 1.2;
      else if (token.end === "clause") punct = 0.5;
    }
    // A paragraph break always gets a beat; a longer one with punctuation pauses on.
    const block = token.blockEnd ? (pauseOnPunctuation ? 1.5 : 0.6) : 0;
    m += Math.max(punct, block);
    return m;
  }

  function delayMs(token, wpm, pauseOnPunctuation) {
    return (60000 / clampWpm(wpm)) * delayFactor(token, pauseOnPunctuation);
  }

  // Suffix sums of delay factors so "time remaining" is O(1) per frame even on
  // 100k-word judgments. remainingMs(i) = (60000/wpm) * suffix[i].
  function buildTimeline(tokens, pauseOnPunctuation) {
    const suffix = new Float64Array(tokens.length + 1);
    for (let i = tokens.length - 1; i >= 0; i--) {
      suffix[i] = suffix[i + 1] + delayFactor(tokens[i], pauseOnPunctuation);
    }
    return suffix;
  }

  function formatRemaining(ms) {
    const totalSec = Math.max(0, Math.round(ms / 1000));
    if (totalSec < 60) return `${totalSec} s left`;
    const min = Math.round(totalSec / 60);
    if (min < 60) return `${min} min left`;
    const h = Math.floor(min / 60);
    const rem = min % 60;
    return `${h} h ${rem} min left`;
  }

  const WPM_MIN = 100;
  const WPM_MAX = 1000;
  const FONT_MIN = 28;
  const FONT_MAX = 80;

  function clampWpm(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 400;
    return Math.min(WPM_MAX, Math.max(WPM_MIN, Math.round(n)));
  }

  function clampFont(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 46;
    return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)));
  }

  const DEFAULTS = Object.freeze({
    wpm: 400,
    theme: "paper", // light by default; "ink" is the dark theme
    pauseOnPunctuation: true,
    fontSize: 46
  });

  function normalizeSettings(s) {
    const out = { ...DEFAULTS, ...(s || {}) };
    out.wpm = clampWpm(out.wpm);
    out.fontSize = clampFont(out.fontSize);
    out.theme = out.theme === "ink" ? "ink" : "paper";
    out.pauseOnPunctuation = out.pauseOnPunctuation !== false;
    return out;
  }

  // Small non-cryptographic hash (FNV-1a) used to key session positions so no
  // URL is stored in plain text.
  function hashKey(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  const api = {
    tokenizeBlocks,
    tokenizeText,
    wordsOf,
    orpIndex,
    splitAtOrp,
    delayFactor,
    delayMs,
    buildTimeline,
    formatRemaining,
    isAbbreviation,
    cleanText,
    clampWpm,
    clampFont,
    normalizeSettings,
    hashKey,
    DEFAULTS,
    WPM_MIN,
    WPM_MAX,
    FONT_MIN,
    FONT_MAX
  };

  root.DocketSpeedEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
