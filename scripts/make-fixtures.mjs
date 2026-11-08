// Generates SYNTHETIC CanLII-like fixture pages into tests/fixtures/.
// Markup is modelled on CanLII's public decision layout from general
// knowledge (site header and nav, document metadata panel, tools bar,
// document body with [n] paragraph markers, related-documents sidebar,
// footer, consent-manager banner). It is NOT copied from canlii.org and
// every party, judge and citation is fictional. Real saved pages, if
// provided later, go in tests/fixtures/real/ and are tested the same way.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "tests", "fixtures");
mkdirSync(outDir, { recursive: true });

const COOKIE_TEXT =
  "We use cookies and similar technologies to improve your experience on our website, to analyse traffic and to personalise content. " +
  "By clicking Accept all cookies you agree to the storing of cookies on your device. You can manage your cookie preferences at any time " +
  "by visiting the privacy centre. Strictly necessary cookies are always active because the website cannot function properly without them.";

function siteChrome({ lang = "en", banner = false, fixedNotice = false, modalAriaHidden = false }) {
  const fr = lang === "fr";
  return {
    top: `
  ${banner ? `<div id="onetrust-consent-sdk"><div class="onetrust-pc-dark-filter"></div>
    <div id="onetrust-banner-sdk" class="otFlat" role="alertdialog" aria-describedby="onetrust-policy-text" style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:24px;z-index:999">
      <div class="ot-sdk-container"><div class="ot-sdk-row"><div id="onetrust-policy">
        <h2 id="onetrust-policy-title">Your privacy</h2>
        <p id="onetrust-policy-text">${COOKIE_TEXT} [1] Cookie policy section one. [2] Cookie policy section two. [3] Cookie policy section three.</p>
        <p>${COOKIE_TEXT}</p>
      </div>
      <div id="onetrust-button-group"><button id="onetrust-accept-btn-handler">Accept all cookies</button><button id="onetrust-reject-all-handler">Reject all</button></div>
      </div></div></div></div>` : ""}
  ${fixedNotice ? `<div class="site-notice-strip" style="position:fixed;top:0;left:0;right:0;background:#ffe;padding:8px;z-index:998"><p>Planned maintenance notice: this research service will be unavailable on Saturday night between midnight and four in the morning while we upgrade our servers and databases.</p></div>` : ""}
  <a class="skip-link" href="#mainContent">${fr ? "Passer au contenu" : "Skip to content"}</a>
  <header id="header" class="site-header">
    <div class="logo">Legal Info Demo</div>
    <nav class="navbar" aria-label="Main">
      <ul><li><a href="/${lang}/">${fr ? "Accueil" : "Home"}</a></li><li><a href="/${lang}/ca/">${fr ? "Canada (fédéral)" : "Canada (Federal)"}</a></li>
      <li><a href="/${lang}/on/">Ontario</a></li><li><a href="/${lang}/qc/">Québec</a></li><li><a href="/${lang}/info/">${fr ? "À propos" : "About"}</a></li></ul>
    </nav>
    <form class="search-form" role="search"><input type="text" name="q" placeholder="Search"><button>Search</button></form>
  </header>
  <div id="breadcrumbs" class="breadcrumb"><a href="/${lang}/">Legal Info Demo</a> &gt; <a href="/${lang}/ca/">Canada</a> &gt; <span>Decision</span></div>`,
    bottom: `
  <footer id="footer" class="site-footer">
    <p>${fr ? "Conditions d'utilisation · Politique de confidentialité · Nous joindre · Aide" : "Terms of use · Privacy policy · Contact us · Help · Site map · Accessibility statement"}</p>
    <p>${fr ? "Ce site de démonstration est entièrement fictif et sert uniquement aux tests." : "This demonstration site is entirely fictional and exists only for automated testing of the reader."}</p>
  </footer>
  ${modalAriaHidden ? "" : ""}`
  };
}

function metaPanel(rows) {
  return `<div id="documentMeta" class="documentMeta">
      ${rows.map(([k, v]) => `<div class="row"><div class="col-3 meta-label">${k}</div><div class="col-9 meta-value">${v}</div></div>`).join("\n      ")}
    </div>
    <div id="documentTools" class="document-tools toolbar">
      <a href="#">Print</a> <a href="#">PDF</a> <a href="#">Share</a> <a href="#">Cited documents (12)</a> <a href="#">Citing documents (3)</a>
      <p class="tools-note">Use the tools above to print, download or share this document with colleagues in your organisation today.</p>
    </div>`;
}

function relatedSidebar(lang = "en") {
  const fr = lang === "fr";
  return `<aside id="relatedDocuments" class="sidebar related-docs">
      <h3>${fr ? "Documents connexes" : "Related documents"}</h3>
      <ul>
        <li><a href="#">Zephyr Holdings Ltd. v. Ostrander, 2097 ONCA 412</a> [1] at paragraph 14 the court considered the standard of review in some depth.</li>
        <li><a href="#">R. v. Penhallow, 2096 SCC 9</a> [2] a related decision about procedural fairness in administrative tribunals.</li>
        <li><a href="#">Quinlan v. Board of Tidewater, 2095 FCA 77</a> [3] considered the same statutory provision.</li>
      </ul>
    </aside>`;
}

function page({ title, lang = "en", chrome, body }) {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${title}</title>
<!-- SYNTHETIC FIXTURE: modelled on CanLII's layout, fictional content, not copied from canlii.org -->
<style>
  body { font-family: Georgia, serif; margin: 0; background: #fafafa; color: #222; }
  .site-header { background: #2b3e50; color: #fff; padding: 12px 24px; }
  .site-header a { color: #fff; }
  .navbar ul { list-style: none; display: flex; gap: 16px; margin: 0; padding: 0; }
  #mainContent { max-width: 900px; margin: 0 auto; padding: 24px; background: #fff; }
  .documentMeta .row { display: flex; gap: 12px; font-size: 14px; }
  .document-tools { margin: 12px 0; font-size: 13px; }
  .documentcontent p { line-height: 1.6; }
  .sidebar { max-width: 900px; margin: 0 auto; padding: 12px 24px; font-size: 14px; }
  .site-footer { background: #eee; padding: 16px 24px; font-size: 12px; }
  /* Page-wide rules that a non-isolated overlay would inherit: */
  button { text-transform: uppercase; margin: 20px; font-size: 30px; }
  div { line-height: 3; }
  * { letter-spacing: 0.05em; }
</style>
</head>
<body>
${chrome.top}
<div id="mainContent" class="container">
${body}
</div>
${chrome.bottom}
<script>
  // Page-side key listener, used by tests to prove the reader does not leak keys.
  window.__pageKeys = [];
  document.addEventListener("keydown", (e) => window.__pageKeys.push(e.key));
</script>
</body>
</html>
`;
}

// ---------- SCC decision ----------
const sccParas = [
  "This appeal concerns the proper approach to judicial review of a decision of the Westmarch Licensing Tribunal, which cancelled the appellant's licence to operate a ferry service across Lake Corvane.",
  "The appellant, Elspeth Marlowe, held the licence for nineteen years without incident. In 2097, the Tribunal received a complaint that the ferry had departed in unsafe weather. After a hearing, it cancelled the licence under s. 7 of the Ferry Services Act, S.W. 2090, c. F-3.",
  "The Court of Appeal for Westmarch upheld the cancellation, holding that the Tribunal's reasons were adequate and its conclusion reasonable: Marlowe v. Westmarch Licensing Tribunal, 2098 WMCA 44.",
  "For the reasons that follow, I would allow the appeal. The Tribunal did not grapple with the central argument advanced by the appellant, namely that the weather warning had been withdrawn before the ferry departed.",
  "The standard of review is reasonableness. As this Court explained in Vantage Ridge v. Corvane (City), 2096 SCC 12, at para. 85, a reasonable decision is one that is based on an internally coherent and rational chain of analysis and that is justified in relation to the facts and law that constrain the decision maker.",
  "Reasonableness review is not a line-by-line treasure hunt for error. Nonetheless, a reviewing court must be able to trace the decision maker's reasoning without encountering any fatal flaws in its overarching logic.",
  "Here, the Tribunal wrote:"
];
const sccQuote =
  "The licensee has offered various explanations for the departure. We have considered them. The safety of passengers is paramount, and cancellation is warranted.";
const sccParas2 = [
  "With respect, this passage does not engage with the evidence that the warning was withdrawn at 6:40 a.m., twenty minutes before departure. That evidence, if accepted, was capable of answering the complaint entirely.",
  "A decision maker need not respond to every argument. But where an argument is central and, if accepted, would be dispositive, its omission from the reasons may render the decision unreasonable.",
  "The Tribunal's failure to address the withdrawal of the warning is such an omission. Its conclusion therefore lacks the requisite justification, transparency and intelligibility.",
  "I would allow the appeal, set aside the decision of the Court of Appeal, and remit the matter to a differently constituted panel of the Tribunal for redetermination, with costs throughout to the appellant."
];

function sccBody() {
  let n = 0;
  const p = (t) => `<p class="Paragraph"><span class="ParaNo">[${++n}]</span>&nbsp;${t}</p>`;
  return `
${metaPanel([
  ["Date:", "2099-03-14"],
  ["File number:", "40123"],
  ["Citation:", "Marlowe v. Westmarch Licensing Tribunal, 2099 SCC 1 (CanLII)"],
  ["Other citations:", "[2099] 1 S.C.R. 3"],
  ["Citing documents:", "Other decisions citing this one appear in the citator tab."]
])}
<div id="docCont">
  <div id="originalDocument" class="documentcontent">
    <p class="CaseTitle"><b>SUPREME COURT OF WESTMARCH</b></p>
    <p class="CaseTitle">Citation: Marlowe v. Westmarch Licensing Tribunal, 2099 SCC 1</p>
    <p>Appeal Heard: November 2, 2098 · Judgment Rendered: March 14, 2099 · Docket: 40123</p>
    <p>Between: Elspeth Marlowe, Appellant, and Westmarch Licensing Tribunal, Respondent</p>
    <p>Coram: Ashgrove C.J. and Tamsin, Oduya, Ferrante and Lisle JJ.</p>
    <p><b>Reasons for Judgment:</b> (paras. 1 to 11) Ashgrove C.J. (Tamsin, Oduya, Ferrante and Lisle JJ. concurring)</p>
    <p class="headnote">Headnote: Administrative law — Judicial review — Standard of review — Reasonableness — Adequacy of reasons.</p>
    <h2>I. Overview</h2>
    ${sccParas.map(p).join("\n    ")}
    <blockquote><p>${sccQuote}</p></blockquote>
    <h2>II. Analysis</h2>
    ${sccParas2.map(p).join("\n    ")}
    <p>Appeal allowed with costs throughout.</p>
    <p>Solicitors for the appellant: Fenwick &amp; Rourke, Port Ellery.</p>
    <div class="footnotes"><hr><p id="fn1"><sup>1</sup> Ferry Services Act, S.W. 2090, c. F-3, s. 7, was amended in 2097 after the events in issue.</p></div>
  </div>
</div>`;
}

// ---------- Provincial decision (older layout: tables + br + footnotes + lists) ----------
function provincialBody() {
  const rows = [
    "The plaintiff, Corwin Ashby, claims damages for injuries suffered when he slipped on an icy walkway outside the defendant's hardware store in Fellmoor on January 9, 2094.",
    "The defendant, Brindle Hardware Inc., denies liability. It says the walkway was salted twice that morning, and that the plaintiff was not paying attention because he was using his telephone.",
    "The issues are: (a) whether the defendant breached the standard of care under the Occupiers' Liability Act; (b) whether the plaintiff was contributorily negligent; and (c) the quantum of damages."
  ];
  const rows2 = [
    "I accept the evidence of the store manager that salt was applied at 7:30 a.m. However, freezing rain began at about 9:15 a.m., and no further salt was applied before the plaintiff fell at 11:05 a.m.",
    "An occupier must take such care as in all the circumstances is reasonable to see that persons entering the premises are reasonably safe.<sup><a href=\"#fn1\">1</a></sup> In light of the changing weather, a reasonable occupier would have inspected and re-salted the walkway before late morning.",
    "I find the defendant liable. I reduce the plaintiff's recovery by twenty per cent for contributory negligence, given his own evidence that he was reading a message as he walked."
  ];
  let n = 0;
  const tr = (t) => `<tr><td class="paraNo" valign="top">[${++n}]</td><td class="paraText">${t}</td></tr>`;
  return `
${metaPanel([
  ["Date:", "2095-06-02"],
  ["File number:", "CV-94-00123"],
  ["Citation:", "Ashby v. Brindle Hardware Inc., 2095 FMSC 210 (CanLII)"]
])}
<div id="docCont">
  <div id="originalDocument" class="documentcontent">
    <div class="caseHeader"><p>FELLMOOR SUPERIOR COURT OF JUSTICE</p><p>BETWEEN: Corwin Ashby, Plaintiff – and – Brindle Hardware Inc., Defendant</p><p>BEFORE: Justice R. Okonkwo-Hale</p><p>HEARD: May 12–14, 2095</p></div>
    <h3>REASONS FOR JUDGMENT</h3>
    <table class="layout" border="0" width="100%">
      ${rows.map(tr).join("\n      ")}
    </table>
    <ol type="a"><li>Was the walkway reasonably maintained given the weather that morning?</li><li>Did the plaintiff's own inattention contribute to the fall?</li></ol>
    <h3>Analysis</h3>
    <table class="layout" border="0" width="100%">
      ${rows2.map(tr).join("\n      ")}
    </table>
    <table class="damages" border="1"><caption>Damages summary</caption><tr><th>Head</th><th>Amount</th></tr><tr><td>General damages</td><td>$45,000</td></tr><tr><td>Special damages</td><td>$6,200</td></tr></table>
    <div class="paras">[${++n}] General damages are assessed at $45,000 and special damages at $6,200, for a total of $51,200 before the reduction.<br>[${++n}] After the twenty per cent reduction, judgment will issue for the plaintiff in the amount of $40,960, with prejudgment interest under the Courts of Justice Act.<br>[${++n}] If the parties cannot agree on costs, they may make brief written submissions within thirty days.</div>
    <p>Justice R. Okonkwo-Hale</p>
    <p>Released: June 2, 2095</p>
    <div class="footnotes"><hr><p id="fn1"><sup>1</sup> Occupiers' Liability Act, R.S.F. 2080, c. O.2, s. 3(1).</p></div>
  </div>
</div>`;
}

// ---------- French decision ----------
function frenchBody() {
  const paras = [
    "L'appelante, Mme Odile Valcourt, se pourvoit contre un jugement de la Cour supérieure qui a rejeté sa demande en dommages-intérêts contre l'intimée, la Coopérative agricole de Saint-Évrard.",
    "Elle reproche à l'intimée d'avoir livré des semences contaminées, ce qui aurait entraîné la perte de sa récolte de l'été 2093.",
    "Le juge de première instance a conclu que l'appelante n'avait pas prouvé le lien de causalité entre le vice allégué et le préjudice subi, au sens de l'art. 1457 C.c.Q.",
    "Avec égards, je suis d'avis que le juge a commis une erreur manifeste et déterminante dans l'appréciation de la preuve d'expert. Le rapport de l'agronome Lévesque établit, selon la prépondérance des probabilités, que la contamination est la cause de la perte.",
    "Comme le rappelait la Cour dans Bérubé c. Lafrenière, 2091 QCCA 318, au par. 22 : « la preuve par présomptions graves, précises et concordantes suffit à établir la causalité ».",
    "Pour ces motifs, je propose d'accueillir l'appel, d'infirmer le jugement de première instance et de condamner l'intimée à payer à l'appelante la somme de 87 500 $, avec les intérêts et l'indemnité additionnelle, le tout avec frais de justice."
  ];
  let n = 0;
  return `
${metaPanel([
  ["Date :", "2094-10-21"],
  ["Numéro de dossier :", "500-09-099999-937"],
  ["Référence :", "Valcourt c. Coopérative agricole de Saint-Évrard, 2094 QCCA 1502 (CanLII)"]
])}
<div id="docCont">
  <div id="originalDocument" class="documentcontent">
    <p>COUR D'APPEL DU QUÉBEC (DÉMONSTRATION)</p>
    <p>Valcourt c. Coopérative agricole de Saint-Évrard, 2094 QCCA 1502</p>
    <p>JUGES : Les honorables Hélène Desrosiers, Étienne Bouchard, Maïté Ruelland</p>
    <h2>MOTIFS DE LA JUGE DESROSIERS</h2>
    ${paras.map((t) => `<p class="Paragraphe"><span class="ParaNo">[${++n}]</span>&nbsp;${t}</p>`).join("\n    ")}
    <p>HÉLÈNE DESROSIERS, J.C.A.</p>
  </div>
</div>`;
}

// ---------- Statute (no paragraph markers) ----------
function statuteBody() {
  const sections = [
    ["1", "This Act may be cited as the Ferry Services Act."],
    ["2", "In this Act, “ferry” means a vessel used to carry passengers or vehicles across a body of water on a regular schedule; “licence” means a licence issued under section 4; “Tribunal” means the Westmarch Licensing Tribunal continued under section 9."],
    ["3", "No person shall operate a ferry service without a licence issued under this Act."],
    ["4", "(1) The Tribunal may issue a licence to an applicant who satisfies the Tribunal that the applicant is able to operate the ferry service safely and in accordance with this Act. (2) A licence is valid for five years and may be renewed."],
    ["5", "A licensee shall keep a log of every departure, including the time of departure, the number of passengers carried and any weather warning in effect at the time."],
    ["6", "The Tribunal may, on its own initiative or on complaint, inquire into whether a licensee has complied with this Act and the regulations."],
    ["7", "(1) After giving the licensee an opportunity to be heard, the Tribunal may suspend or cancel a licence if it is satisfied that the licensee has operated a ferry in a manner that endangers passengers. (2) The Tribunal shall give written reasons for a decision under subsection (1)."],
    ["8", "A decision of the Tribunal under section 7 may be appealed to the Court of Appeal on a question of law."]
  ];
  return `
<div id="documentMeta" class="documentMeta"><div class="row"><div class="col-3">Current version:</div><div class="col-9">in force since 2097-01-01</div></div></div>
<div id="legisToc" class="toc sidebar"><h3>Table of contents</h3><ul>${sections.map(([n]) => `<li><a href="#s${n}">Section ${n}</a></li>`).join("")}</ul></div>
<div id="docCont">
  <div id="originalDocument" class="documentcontent legislation">
    <h1 class="Title-of-Act">Ferry Services Act</h1>
    <p class="ChapterNumber">S.W. 2090, c. F-3</p>
    ${sections.map(([n, t]) => `<div class="Section" id="s${n}"><p class="Section"><span class="sectionLabel"><b>${n}</b></span> ${t}</p></div>`).join("\n    ")}
  </div>
</div>`;
}

// ---------- Non-judgment page (search results / browse) ----------
function nonJudgmentBody() {
  const items = Array.from({ length: 12 }, (_, i) => `<li class="result"><a href="#">Example v. Sample ${i + 1}, 209${i % 9} SCC ${i + 1}</a> <span class="snippet"><a href="#">administrative law</a>, <a href="#">judicial review</a></span></li>`);
  return `
<h1>Search results</h1>
<p class="summary">12 results</p>
<ul class="results">${items.join("")}</ul>
<div class="pagination"><a href="#">1</a> <a href="#">2</a> <a href="#">Next</a></div>`;
}

// ---------- Cookie banner page: SCC decision + every kind of boilerplate ----------
function cookieBody() {
  return `
<div id="newsletter-modal" class="subscribe-modal" role="dialog" aria-modal="true"><p>Subscribe to our newsletter for weekly summaries of new decisions from every court in the country, delivered free to your inbox every Monday morning without fail.</p></div>
${sccBody()}
${relatedSidebar()}`;
}

// ---------- Very long judgment (generated) ----------
function longBody(targetWords) {
  const vocab = (
    "the court considered whether the tribunal reasonably interpreted its home statute and found that the decision bore the hallmarks of justification transparency and intelligibility " +
    "counsel for the respondent argued that the appellant had waived any objection by failing to raise it before the hearing panel at the earliest practical opportunity " +
    "in our view the trial judge did not err in admitting the evidence because its probative value outweighed any prejudicial effect on the fairness of the proceedings " +
    "accordingly the appeal must be dismissed and the matter returned for a new hearing on the remaining issues consistent with these reasons"
  ).split(" ");
  let words = 0;
  let n = 0;
  const out = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  while (words < targetWords) {
    const len = 40 + Math.floor(rand() * 60);
    const ws = [];
    for (let i = 0; i < len; i++) ws.push(vocab[Math.floor(rand() * vocab.length)]);
    ws[0] = ws[0][0].toUpperCase() + ws[0].slice(1);
    for (let i = 9; i < len - 1; i += 11) ws[i] += i % 22 === 9 ? "," : ".";
    ws[len - 1] += ".";
    n++;
    if (n === 1) ws.splice(0, 2, "Opening", "words");
    out.push(`<p class="Paragraph"><span class="ParaNo">[${n}]</span>&nbsp;${ws.join(" ")}</p>`);
    words += len;
    if (n % 200 === 0) out.push(`<h2>Part ${n / 200}</h2>`);
  }
  out.push(`<p class="Paragraph"><span class="ParaNo">[${n + 1}]</span>&nbsp;For all of these reasons the appeal is dismissed. Final closing words.</p>`);
  return {
    html: `
${metaPanel([["Date:", "2099-12-31"], ["Citation:", "Longfellow v. Province of Westmarch, 2099 SCC 99 (CanLII)"]])}
<div id="docCont"><div id="originalDocument" class="documentcontent">
  <p>Reasons for judgment (synthetic, generated for performance testing)</p>
  ${out.join("\n  ")}
</div></div>
${relatedSidebar()}`,
    paragraphs: n + 1,
    words: words + 13
  };
}

const fixtures = {
  "synthetic-scc-decision.html": page({
    title: "2099 SCC 1 (CanLII) | Marlowe v. Westmarch Licensing Tribunal | CanLII",
    chrome: siteChrome({}),
    body: sccBody() + relatedSidebar()
  }),
  "synthetic-provincial-decision.html": page({
    title: "2095 FMSC 210 (CanLII) | Ashby v. Brindle Hardware Inc. | CanLII",
    chrome: siteChrome({}),
    body: provincialBody() + relatedSidebar()
  }),
  "synthetic-french-decision.html": page({
    title: "2094 QCCA 1502 (CanLII) | Valcourt c. Coopérative agricole de Saint-Évrard | CanLII",
    lang: "fr",
    chrome: siteChrome({ lang: "fr" }),
    body: frenchBody() + relatedSidebar("fr")
  }),
  "synthetic-statute.html": page({
    title: "Ferry Services Act, SW 2090, c F-3 | CanLII",
    chrome: siteChrome({}),
    body: statuteBody()
  }),
  "synthetic-cookie-banner.html": page({
    title: "2099 SCC 1 (CanLII) | Marlowe v. Westmarch Licensing Tribunal | CanLII",
    chrome: siteChrome({ banner: true, fixedNotice: true }),
    body: cookieBody()
  }),
  "synthetic-non-judgment.html": page({
    title: "Search results | CanLII",
    chrome: siteChrome({ banner: true }),
    body: nonJudgmentBody()
  })
};

const long = longBody(105000);
fixtures["synthetic-long-judgment.html"] = page({
  title: "2099 SCC 99 (CanLII) | Longfellow v. Province of Westmarch | CanLII",
  chrome: siteChrome({ banner: true }),
  body: long.html
});

for (const [name, html] of Object.entries(fixtures)) {
  writeFileSync(join(outDir, name), html);
}
writeFileSync(
  join(outDir, "synthetic-long-judgment.meta.json"),
  JSON.stringify({ paragraphs: long.paragraphs, approxWords: long.words }, null, 2)
);
console.log(`Wrote ${Object.keys(fixtures).length} synthetic fixtures to ${outDir}`);
