const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../extension/engine.js");

const pivotOf = (w) => E.splitAtOrp(w).pivot;

test("ORP: length table on plain words", () => {
  assert.equal(E.orpIndex("a"), 0);
  assert.equal(E.orpIndex("to"), 1);
  assert.equal(E.orpIndex("court"), 1);
  assert.equal(E.orpIndex("appeal"), 2);
  assert.equal(E.orpIndex("tribunal"), 2);
  assert.equal(E.orpIndex("reasonable"), 3);
  assert.equal(E.orpIndex("justification"), 3);
  assert.equal(E.orpIndex("reasonableness"), 4);
  assert.equal(E.orpIndex("intelligibility"), 4);
});

test("ORP: leading and trailing punctuation never hold the pivot", () => {
  assert.equal(pivotOf("“Section"), "c"); // 7 letters -> 3rd letter, quote skipped
  assert.equal(E.splitAtOrp("“Section").before, "“Se");
  assert.equal(pivotOf("(a)"), "a");
  assert.equal(pivotOf("«mot»"), "o");
  assert.equal(pivotOf("appeal."), "p");
  assert.equal(pivotOf("—"), "—");
  assert.equal(E.orpIndex("..."), 0);
});

test("ORP: numbers, citations, section references", () => {
  assert.equal(pivotOf("2019"), "0");
  assert.equal(pivotOf("2019 SCC 65"), "0"); // pivot from the first word
  assert.equal(pivotOf("s. 7"), "s");
  assert.equal(pivotOf("$45,000"), "5");
  assert.equal(pivotOf("[12]"), "2");
});

test("ORP: French accented text counts letters correctly", () => {
  assert.equal(E.splitAtOrp("été").pivot, "t");
  assert.equal(E.splitAtOrp("déclaration").before, "déc");
  assert.equal(E.splitAtOrp("d'intérêts").pivot, "n"); // d,i,n,t,é,r,ê,t,s = 9 letters -> 3rd letter
  // Decomposed input is normalized: e + combining acute is one letter.
  const nfd = "été".normalize("NFD");
  const words = E.wordsOf(nfd).map((w) => w.t);
  assert.deepEqual(words, ["été"]);
});

test("tokenize: whitespace, soft hyphens, line-break hyphenation", () => {
  const w = E.wordsOf("  The  judg-\nment was­rendered​ today.\n").map((x) => x.t);
  assert.deepEqual(w, ["The", "judgment", "wasrendered", "today."]);
  // Real compounds stay hyphenated.
  assert.deepEqual(E.wordsOf("well-known Smith-\nJones").map((x) => x.t), ["well-known", "Smith-", "Jones"]);
});

test("tokenize: standalone punctuation attaches, French guillemets", () => {
  const w = E.wordsOf("au par. 22 : « la preuve suffit » .").map((x) => x.t);
  assert.deepEqual(w, ["au", "par. 22:", "«la", "preuve", "suffit»."]);
  assert.deepEqual(E.wordsOf("word — word").map((x) => x.t), ["word —", "word"]);
});

test("tokenize: citations stay together", () => {
  const w = E.wordsOf("See 2019 SCC 65, at para. 85, and s. 7 of the Charter; also 2020 CanLII 1234 and art. 1457 C.c.Q.").map((x) => x.t);
  assert.ok(w.includes("2019 SCC 65,"), w.join("|"));
  assert.ok(w.includes("para. 85,"));
  assert.ok(w.includes("s. 7"));
  assert.ok(w.includes("2020 CanLII 1234"));
  assert.ok(w.includes("art. 1457"));
  const multi = E.wordsOf("2019 SCC 65").map((x) => x.multi);
  assert.deepEqual(multi, [true]);
});

test("sentence ends ignore legal abbreviations", () => {
  const { tokens } = E.tokenizeText("Ashgrove C.J. and Lisle J. agree with R. v. Quill. The end.");
  const ends = Object.fromEntries(tokens.map((t) => [t.t, t.end]));
  assert.equal(ends["C.J."], null);
  assert.equal(ends["J."], null);
  assert.equal(ends["v."], null);
  assert.equal(ends["Quill."], "sentence");
  assert.equal(ends["end."], "sentence");
  assert.equal(E.isAbbreviation("S.C.R."), true);
  assert.equal(E.isAbbreviation("“Mr."), true);
  assert.equal(E.isAbbreviation("appeal."), false);
});

test("paragraph numbers become metadata, not words", () => {
  const { tokens, paragraphs } = E.tokenizeText("[1] First para here.\n\n[2] Second one.\n\nUnnumbered.");
  assert.deepEqual(tokens.map((t) => t.t), ["First", "para", "here.", "Second", "one.", "Unnumbered."]);
  assert.deepEqual(paragraphs, [{ para: 1, start: 0 }, { para: 2, start: 3 }]);
  assert.equal(tokens[3].para, 2);
  assert.equal(tokens[2].blockEnd, true);
  assert.equal(tokens[3].blockStart, true);
});

test("pacing: punctuation, paragraph breaks, long words, citations", () => {
  const mk = (t, extra = {}) => ({ t, multi: false, end: null, blockEnd: false, ...extra });
  const base = E.delayFactor(mk("court"), true);
  assert.equal(base, 1);
  assert.ok(E.delayFactor(mk("appeal.", { end: "sentence" }), true) > E.delayFactor(mk("appeal,", { end: "clause" }), true));
  assert.ok(E.delayFactor(mk("appeal,", { end: "clause" }), true) > base);
  assert.equal(E.delayFactor(mk("appeal.", { end: "sentence" }), false), 1); // toggle off
  assert.ok(E.delayFactor(mk("end.", { end: "sentence", blockEnd: true }), true) >= 2.5);
  assert.ok(E.delayFactor(mk("end", { blockEnd: true }), false) > 1); // paragraph break always gets a beat
  assert.ok(E.delayFactor(mk("intelligibility"), true) > E.delayFactor(mk("reasonable"), true));
  assert.ok(E.delayFactor(mk("2019 SCC 65", { multi: true }), true) > 1.4);
  // 400 wpm -> 150 ms base
  assert.equal(E.delayMs(mk("court"), 400, true), 150);
  assert.equal(E.delayMs(mk("court"), 5000, true), 60); // clamped to 1000 wpm
  assert.equal(E.delayMs(mk("court"), 10, true), 600); // clamped to 100 wpm
});

test("timeline gives remaining time", () => {
  const { tokens } = E.tokenizeText("one two three four");
  const tl = E.buildTimeline(tokens, true);
  assert.equal(tl.length, tokens.length + 1);
  assert.equal(tl[tokens.length], 0);
  assert.ok(tl[0] > tl[1]);
  assert.equal(E.formatRemaining(30000), "30 s left");
  assert.equal(E.formatRemaining(5 * 60000), "5 min left");
  assert.equal(E.formatRemaining(125 * 60000), "2 h 5 min left");
});

test("settings normalization and clamping", () => {
  assert.deepEqual(E.normalizeSettings({}), { wpm: 400, theme: "paper", pauseOnPunctuation: true, fontSize: 46 });
  const s = E.normalizeSettings({ wpm: 50, fontSize: 500, theme: "neon", pauseOnPunctuation: false });
  assert.deepEqual(s, { wpm: 100, theme: "paper", pauseOnPunctuation: false, fontSize: 80 });
  assert.equal(E.normalizeSettings({ theme: "ink" }).theme, "ink");
  assert.equal(E.clampWpm("abc"), 400);
});

test("hashKey is stable and does not contain the URL", () => {
  const k = E.hashKey("https://www.canlii.org/en/ca/scc/doc/2099/2099scc1/2099scc1.html");
  assert.equal(k, E.hashKey("https://www.canlii.org/en/ca/scc/doc/2099/2099scc1/2099scc1.html"));
  assert.ok(!k.includes("canlii"));
  assert.notEqual(k, E.hashKey("https://www.canlii.org/fr/"));
});
