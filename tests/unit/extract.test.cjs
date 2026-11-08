const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const X = require("../../extension/extract.js");
const E = require("../../extension/engine.js");

const FIX = path.join(__dirname, "..", "fixtures");
function load(name) {
  const html = fs.readFileSync(path.join(FIX, name), "utf8");
  return new JSDOM(html, { pretendToBeVisual: true }).window.document;
}
function run(name) {
  const doc = load(name);
  const res = X.extractFromDocument(doc);
  const { tokens, paragraphs } = E.tokenizeBlocks(res.blocks);
  const words = tokens.map((t) => t.t);
  return { res, tokens, paragraphs, words, text: words.join(" ") };
}

// Text that must never be read: consent managers, site chrome, metadata,
// tools, related documents, footers, modals.
const BANNED = [
  /cookie/i, /Accept all/i, /Your privacy/i, /Skip to content/, /Terms of use/i, /Privacy policy/i,
  /Related documents/i, /Zephyr Holdings/, /Penhallow/, /Quinlan/, /Citing documents/i,
  /Cited documents/i, /File number/i, /Other citations/i, /Planned maintenance/i, /newsletter/i,
  /demonstration site/i, /Use the tools above/i, /Canada \(Federal\)/, /Passer au contenu/,
  /Documents connexes/
];
function assertClean(text) {
  for (const re of BANNED) assert.doesNotMatch(text, re, `leaked boilerplate matching ${re}`);
}
const first = (w, n) => w.slice(0, n).join(" ");
const last = (w, n) => w.slice(-n).join(" ");

test("SCC decision: judgment body only, header skipped, markers become paragraphs", () => {
  const { res, words, text, paragraphs } = run("synthetic-scc-decision.html");
  assert.equal(res.ok, true);
  assert.equal(res.method, "markers");
  assert.equal(first(words, 5), "This appeal concerns the proper");
  assert.equal(last(words, 3), "Rourke, Port Ellery.");
  assert.equal(paragraphs.length, 11);
  assert.deepEqual(paragraphs.map((p) => p.para), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.doesNotMatch(text, /\[\d+\]/, "paragraph markers must not be flashed");
  assert.doesNotMatch(text, /Coram|Headnote|SUPREME COURT OF WESTMARCH/, "case header is skipped");
  assert.doesNotMatch(text, /amended in 2097/, "footnote bodies are skipped");
  assert.match(text, /The licensee has offered various explanations/, "block quote is read");
  assert.equal(res.title, "Marlowe v. Westmarch Licensing Tribunal, 2099 SCC 1");
  assertClean(text);
});

test("provincial decision: layout tables, <br> paragraphs, lists, footnote refs, data table", () => {
  const { res, words, text, paragraphs } = run("synthetic-provincial-decision.html");
  assert.equal(res.ok, true);
  assert.equal(first(words, 4), "The plaintiff, Corwin Ashby,");
  assert.equal(last(words, 3), "June 2, 2095");
  assert.deepEqual(paragraphs.map((p) => p.para), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.match(text, /reasonably safe\. In light/, "inline footnote reference number is dropped");
  assert.match(text, /\[table omitted\]/, "data table is skipped with a marker");
  assert.doesNotMatch(text, /General damages \$45,000/, "data table cells are not read");
  assert.match(text, /Was the walkway reasonably maintained/, "list items are read");
  assert.doesNotMatch(text, /R\.S\.F\. 2080/, "footnote body skipped");
  assertClean(text);
});

test("French decision: accents, guillemets, art. citations", () => {
  const { res, words, text, paragraphs } = run("synthetic-french-decision.html");
  assert.equal(res.ok, true);
  assert.equal(first(words, 4), "L'appelante, Mme Odile Valcourt,");
  assert.equal(last(words, 3), "HÉLÈNE DESROSIERS, J.C.A.");
  assert.equal(paragraphs.length, 6);
  assert.ok(words.includes("l'art. 1457"), "French elided citation stays together");
  assert.ok(words.includes("2091 QCCA 318,"));
  assert.ok(words.includes("«la"));
  assert.match(text, /Saint-Évrard/);
  assert.equal(res.title, "Valcourt c. Coopérative agricole de Saint-Évrard, 2094 QCCA 1502");
  assertClean(text);
});

test("statute: no markers, fallback reads the sections, not the table of contents", () => {
  const { res, words, text } = run("synthetic-statute.html");
  assert.equal(res.ok, true);
  assert.equal(res.method, "fallback");
  assert.equal(first(words, 4), "Ferry Services Act S.W.");
  assert.equal(last(words, 5), "on a question of law.");
  assert.doesNotMatch(text, /Table of contents|Section 1 Section 2/);
  assertClean(text);
});

test("cookie banner page: banner, fixed notice, modal and related list are excluded", () => {
  const { res, words, text, paragraphs } = run("synthetic-cookie-banner.html");
  assert.equal(res.ok, true);
  assert.equal(res.method, "markers");
  assert.equal(first(words, 5), "This appeal concerns the proper");
  assert.equal(last(words, 3), "Rourke, Port Ellery.");
  assert.equal(paragraphs.length, 11);
  assertClean(text);
});

test("non-judgment page: reports not-found so the UI can suggest selection", () => {
  const { res } = run("synthetic-non-judgment.html");
  assert.equal(res.ok, false);
  assert.equal(res.reason, "not-found");
});

test("very long judgment (100k+ words): complete, ordered, fast enough", () => {
  const meta = JSON.parse(fs.readFileSync(path.join(FIX, "synthetic-long-judgment.meta.json"), "utf8"));
  const t0 = performance.now();
  const { res, words, text, paragraphs } = run("synthetic-long-judgment.html");
  const ms = performance.now() - t0;
  assert.equal(res.ok, true);
  assert.ok(words.length >= 100000, `only ${words.length} words`);
  assert.equal(first(words, 2), "Opening words");
  assert.equal(last(words, 3), "Final closing words.");
  assert.equal(paragraphs.length, meta.paragraphs);
  assertClean(text.slice(0, 2000) + text.slice(-2000));
  assert.doesNotMatch(text, /Zephyr|cookie/i);
  console.log(`# long judgment in jsdom: ${words.length} tokens, extract+tokenize ${ms.toFixed(0)} ms`);
  assert.ok(ms < 5000, `took ${ms} ms`);
});

test("selection: keeps paragraph numbers and blocks", () => {
  const doc = load("synthetic-scc-decision.html");
  const paras = doc.querySelectorAll("p.Paragraph");
  const range = doc.createRange();
  range.setStartBefore(paras[1]);
  range.setEndAfter(paras[2]);
  const sel = doc.defaultView.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const res = X.extractFromSelection(sel, "");
  assert.equal(res.ok, true);
  assert.deepEqual(res.blocks.map((b) => b.para), [2, 3]);
  assert.match(res.blocks[0].text, /^The appellant, Elspeth Marlowe/);
});

test("selection: falls back to the context menu's selectionText", () => {
  const res = X.extractFromSelection(null, "[4] Some selected words here.");
  assert.equal(res.ok, true);
  assert.deepEqual(res.blocks, [{ text: "Some selected words here.", para: 4, kind: "p" }]);
  assert.equal(X.extractFromSelection(null, "  ").ok, false);
});

test("report citations at the start of a block are not paragraph markers", () => {
  const doc = new JSDOM(`<body><div id="c">${[1, 2, 3].map((n) => `<p>[${n}] Paragraph ${n} text that is long enough.</p>`).join("")}<p>[2099] 1 S.C.R. 3 is a citation.</p></div></body>`).window.document;
  const res = X.extractFromDocument(doc);
  assert.equal(res.markers, 3);
  assert.equal(res.blocks[3].para, null);
});

test("a body class from a consent manager does not hide the page", () => {
  const doc = new JSDOM(`<body class="ot-overflow-hidden cookie-consent-open"><main>${[1, 2, 3, 4].map((n) => `<p>[${n}] Paragraph ${n} of the reasons.</p>`).join("")}</main></body>`).window.document;
  const res = X.extractFromDocument(doc);
  assert.equal(res.ok, true);
  assert.equal(res.blocks.length, 4);
});

test("aria-hidden on the page wrapper (modal open) is retried without it", () => {
  const doc = new JSDOM(`<body><div id="wrap" aria-hidden="true">${[1, 2, 3, 4].map((n) => `<p>[${n}] Paragraph ${n} of the reasons.</p>`).join("")}</div><div role="dialog" aria-modal="true"><p>[1] Cookie text. [2] More.</p></div></body>`).window.document;
  const res = X.extractFromDocument(doc);
  assert.equal(res.ok, true);
  assert.equal(res.blocks.length, 4);
  assert.doesNotMatch(res.blocks.map((b) => b.text).join(" "), /Cookie/);
});

// Real CanLII pages saved by Faiq with "Save as > Webpage, Complete" on
// 2026-11-04 (HTML only; the _files folders are not needed). Kept local to the
// project for testing; never shipped.
const REAL = path.join(FIX, "real");
const REAL_UI = [/Accept all cookies/i, /Manage your cookies/i, /Find in document/i, /unfavourable mention/i, /retrieved on 20/i, /AI analysis/i, /myCanLII/, /CanLII Connects/];
const realCases = {
  "real-scc-vavilov.html": { method: "markers", paras: [1, 343], first: "The Chief Justice and Moldaver,", last: "Stikeman Elliott, Ottawa.", title: "Canada (Minister of Citizenship and Immigration) v. Vavilov, 2019 SCC 65" },
  "real-cookie-banner-vavilov.html": { method: "markers", paras: [1, 343], first: "The Chief Justice and Moldaver,", last: "Stikeman Elliott, Ottawa." },
  "real-csc-vavilov-fr.html": { method: "markers", paras: [1, 343], first: "Le juge en chef et", last: "Stikeman Elliott, Ottawa.", title: "Canada (Ministre de la Citoyenneté et de l’Immigration) c. Vavilov, 2019 CSC 65" },
  "real-onca-jones-v-tsige.html": { method: "markers", paras: [1, 93], first: "SHARPE J.A.: -- Does Ontario", last: "provincial privacy legislation" },
  "real-statute-rta-2006.html": { method: "fallback", first: "Residential Tenancies Act, 2006", last: "short title of this Act). 2006, c. 17, s. 263." }
};
for (const [f, want] of Object.entries(realCases)) {
  const file = path.join(REAL, f);
  test(`real CanLII page ${f}`, { skip: !fs.existsSync(file) && "real fixture not present" }, () => {
    const t0 = performance.now();
    const doc = new JSDOM(fs.readFileSync(file, "utf8"), { pretendToBeVisual: true }).window.document;
    const res = X.extractFromDocument(doc);
    const { tokens, paragraphs } = E.tokenizeBlocks(res.blocks);
    const words = tokens.map((t) => t.t);
    const text = words.join(" ");
    console.log(`# ${f}: ${res.method}, ${words.length} words, ${paragraphs.length} paragraphs, ${Math.round(performance.now() - t0)} ms in jsdom`);
    assert.equal(res.ok, true);
    assert.equal(res.method, want.method);
    assert.ok(text.startsWith(want.first), `starts: ${text.slice(0, 80)}`);
    assert.ok(text.endsWith(want.last), `ends: ${text.slice(-80)}`);
    if (want.paras) {
      assert.equal(paragraphs[0].para, want.paras[0]);
      assert.equal(paragraphs[paragraphs.length - 1].para, want.paras[1]);
      const nums = paragraphs.map((p) => p.para);
      assert.ok(nums.every((n, i) => i === 0 || n >= nums[i - 1]), "paragraph numbers in order");
    }
    if (want.title) assert.equal(res.title, want.title);
    for (const re of REAL_UI) assert.doesNotMatch(text, re, `CanLII interface text leaked: ${re}`);
    assert.doesNotMatch(text, /\[page\d+\]|\[QL:/, "reporter page markers stripped");
    const flashedMarkers = tokens.filter((t) => t.blockStart && /^\[\d{1,3}\]$/.test(t.t)).length; // 4-digit [2003] = citation year
    assert.equal(flashedMarkers, 0, "no paragraph markers flashed");
  });
}
