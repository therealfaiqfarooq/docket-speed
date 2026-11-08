// End-to-end tests: real Chromium, unpacked extension, synthetic fixtures
// served under canlii.org URLs by the harness (no network access to CanLII).
// Run: npm run test:e2e   (EXT_DIR=/path/to/unpacked to test another build)

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { launch, watchPage, clickReadWholePage, openPopup, R, readerIndex, FIXTURE_BASE, ROOT } from "./harness.mjs";

const EXT_DIR = process.env.EXT_DIR || join(ROOT, "extension");
const SMOKE = !!process.env.SMOKE; // packaged-zip smoke run: core tests only
const metrics = {};
let env;

before(async () => {
  env = await launch({ extDir: EXT_DIR });
});
after(async () => {
  if (env) await env.close();
  mkdirSync(join(ROOT, "tests", "results"), { recursive: true });
  writeFileSync(join(ROOT, "tests", "results", SMOKE ? "e2e-smoke-metrics.json" : "e2e-metrics.json"), JSON.stringify(metrics, null, 2));
});

async function fixture(name, opts = {}) {
  const page = watchPage(await env.context.newPage(), env.errors);
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  if (opts.viewport) await page.setViewportSize(opts.viewport);
  await page.goto(FIXTURE_BASE + name);
  return page;
}

async function openReader(page) {
  const r = await clickReadWholePage(env, page);
  assert.equal(r.ok, true, `popup reported: ${r.status}`);
  await page.waitForSelector(R.word);
  return r;
}

async function pauseReader(page) {
  if ((await page.textContent(R.play)) === "Pause") await page.keyboard.press(" ");
  assert.equal(await page.textContent(R.play), "Play");
}

async function swCall(fn, arg) {
  return env.sw.evaluate(fn, arg);
}

async function tabFor(page) {
  const url = page.url();
  return swCall(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u), url);
}

// Counts event listeners on document/window/<html> in every JS world of the
// page, including the extension's isolated world (where the reader lives).
async function listenerSnapshot(page) {
  const cdp = await page.context().newCDPSession(page);
  const contexts = [];
  cdp.on("Runtime.executionContextCreated", (e) => contexts.push(e.context));
  await cdp.send("Runtime.enable");
  await new Promise((r) => setTimeout(r, 100));
  const counts = {};
  for (const ctx of contexts) {
    const world = ctx.auxData && ctx.auxData.type === "isolated" ? "isolated:" + ctx.name : "main";
    for (const expr of ["document", "window", "document.documentElement"]) {
      const { result } = await cdp.send("Runtime.evaluate", { expression: expr, contextId: ctx.id });
      if (!result.objectId) continue;
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
      counts[`${world} ${expr}`] = listeners.length;
    }
  }
  await cdp.detach();
  return counts;
}
// Listeners registered by the extension's own isolated world.
const total = (c) => Object.entries(c).filter(([k]) => k.startsWith("isolated:Docket Speed")).reduce((a, [, b]) => a + b, 0);

test("popup 'Read whole page' opens the reader on the judgment text (SCC)", async () => {
  const page = await fixture("synthetic-scc-decision.html");
  await openReader(page);
  await pauseReader(page);
  await page.keyboard.press("Home");
  assert.equal((await page.textContent(R.word)).trim(), "This");
  assert.equal(await page.textContent(R.title), "Marlowe v. Westmarch Licensing Tribunal, 2099 SCC 1");
  assert.equal(await page.textContent(R.para), "¶ 1");
  const pos = await readerIndex(page);
  assert.equal(pos.index, 1);
  assert.ok(pos.total > 300 && pos.total < 450, `total ${pos.total}`);
  await page.keyboard.press("Escape");
  await page.close();
});

test("cookie-banner page: reader starts at the judgment, not the banner", async () => {
  const page = await fixture("synthetic-cookie-banner.html");
  await openReader(page);
  await pauseReader(page);
  await page.keyboard.press("Home");
  assert.equal((await page.textContent(R.word)).trim(), "This");
  const total = (await readerIndex(page)).total;
  assert.ok(total > 300 && total < 450, `banner text would inflate the count: ${total}`);
  await page.keyboard.press("End");
  const lastWord = (await page.textContent(R.word)).trim();
  assert.equal(lastWord, "Ellery.");
  await page.keyboard.press("Escape");
  await page.close();
});

test("French and provincial decisions open; statute falls back; non-judgment page explains", async () => {
  for (const [name, first] of [
    ["synthetic-french-decision.html", "L'appelante,"],
    ["synthetic-provincial-decision.html", "The"],
    ["synthetic-statute.html", "Ferry"]
  ]) {
    const page = await fixture(name);
    await openReader(page);
    await pauseReader(page);
    await page.keyboard.press("Home");
    assert.equal((await page.textContent(R.word)).trim(), first, name);
    await page.keyboard.press("Escape");
    await page.close();
  }
  const page = await fixture("synthetic-non-judgment.html");
  const r = await clickReadWholePage(env, page);
  assert.equal(r.ok, false);
  assert.match(r.status, /Couldn.t find a judgment/);
  assert.match(await page.textContent(R.toast), /Select the text you want to read/);
  assert.equal(await page.$(R.host), null);
  await page.close();
});

test("non-CanLII page: popup refuses and injects nothing", async () => {
  const page = watchPage(await env.context.newPage(), env.errors);
  await page.goto(`http://127.0.0.1:${env.port}/synthetic-scc-decision.html`);
  const r = await clickReadWholePage(env, page);
  assert.equal(r.ok, false);
  assert.match(r.status, /works on canlii\.org pages/);
  const injected = await swCall(async (u) => {
    const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => typeof globalThis.DocketSpeed });
      return res.result;
    } catch (e) {
      return "no-access";
    }
  }, page.url());
  assert.equal(injected, "no-access");
  await page.close();
});

test("context-menu path: handleMenuClick reads the selection with paragraph numbers", async () => {
  const page = await fixture("synthetic-scc-decision.html");
  await page.evaluate(() => {
    const ps = document.querySelectorAll("p.Paragraph");
    const r = document.createRange();
    r.setStartBefore(ps[4]);
    r.setEndAfter(ps[5]);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  const tab = await tabFor(page);
  const res = await swCall(
    (t) => handleMenuClick({ menuItemId: "docket-speed-read-selection", selectionText: "ignored when a live selection exists", frameId: 0 }, t),
    tab
  );
  assert.equal(res.ok, true);
  assert.equal(res.method, "selection");
  await page.waitForSelector(R.word);
  await pauseReader(page);
  await page.keyboard.press("Home");
  assert.equal((await page.textContent(R.word)).trim(), "The");
  assert.equal(await page.textContent(R.para), "¶ 5");
  // A different menu id is ignored.
  const other = await swCall((t) => handleMenuClick({ menuItemId: "something-else" }, t), tab);
  assert.equal(other.ok, false);
  await page.keyboard.press("Escape");
  // Fallback to selectionText when nothing is selected any more.
  await page.evaluate(() => getSelection().removeAllRanges());
  const res2 = await swCall(
    (t) => handleMenuClick({ menuItemId: "docket-speed-read-selection", selectionText: "Plain words from the menu event only." }, t),
    tab
  );
  assert.equal(res2.ok, true);
  assert.equal(res2.words, 7);
  await page.keyboard.press("Escape");
  await page.close();
});

test("keyboard: play/pause, seek, paragraph jump, speed, font size, theme, Home/End", async () => {
  const page = await fixture("synthetic-scc-decision.html");
  await openReader(page);
  // Autoplay advances.
  await page.waitForFunction(() => /^(\d+)/.exec(document.getElementById("docket-speed-host").shadowRoot.querySelector(".num-pos").textContent)[1] > 3);
  await page.keyboard.press(" ");
  assert.equal(await page.textContent(R.play), "Play");
  const a = (await readerIndex(page)).index;
  await page.waitForTimeout(400);
  assert.equal((await readerIndex(page)).index, a, "paused reader must not advance");
  await page.keyboard.press(" ");
  assert.equal(await page.textContent(R.play), "Pause");
  await page.keyboard.press(" ");

  await page.keyboard.press("Home");
  assert.equal((await readerIndex(page)).index, 1);
  await page.keyboard.press("ArrowRight");
  assert.equal((await readerIndex(page)).index, 11);
  await page.keyboard.press("ArrowLeft");
  assert.equal((await readerIndex(page)).index, 1);
  await page.keyboard.press("Shift+ArrowRight");
  assert.equal(await page.textContent(R.para), "¶ 2");
  await page.keyboard.press("PageDown");
  assert.equal(await page.textContent(R.para), "¶ 3");
  await page.keyboard.press("Shift+ArrowLeft");
  assert.equal(await page.textContent(R.para), "¶ 2");

  const wpm0 = Number(await page.textContent(R.wpmVal));
  await page.keyboard.press("ArrowUp");
  assert.equal(Number(await page.textContent(R.wpmVal)), wpm0 + 20);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  assert.equal(Number(await page.textContent(R.wpmVal)), wpm0 - 20);
  await page.keyboard.press("ArrowUp");

  const fs0 = await page.$eval(R.word, (el) => parseFloat(el.style.fontSize));
  await page.keyboard.press("+");
  assert.equal(await page.$eval(R.word, (el) => parseFloat(el.style.fontSize)), fs0 + 4);
  await page.keyboard.press("-");
  assert.equal(await page.$eval(R.word, (el) => parseFloat(el.style.fontSize)), fs0);

  const dark0 = await page.$eval(R.root, (el) => el.classList.contains("dark"));
  await page.keyboard.press("t");
  assert.equal(await page.$eval(R.root, (el) => el.classList.contains("dark")), !dark0);
  await page.click(R.theme);
  assert.equal(await page.$eval(R.root, (el) => el.classList.contains("dark")), dark0);

  await page.keyboard.press("End");
  const end = await readerIndex(page);
  assert.equal(end.index, end.total);

  // Go to paragraph 9 with the field.
  await page.fill("#docket-speed-host input[type=number]", "9");
  await page.press("#docket-speed-host input[type=number]", "Enter");
  assert.equal(await page.textContent(R.para), "¶ 9");

  // Keys never reached the page while the reader handled them.
  const pageKeys = await page.evaluate(() => window.__pageKeys);
  assert.deepEqual(pageKeys.filter((k) => [" ", "ArrowRight", "ArrowLeft", "ArrowUp", "t"].includes(k)), []);
  await page.keyboard.press("Escape");
  await page.close();
});

test("Space on a focused reader button toggles exactly once", async () => {
  const page = await fixture("synthetic-scc-decision.html");
  await openReader(page);
  await pauseReader(page);
  await page.keyboard.press("Home");
  await page.focus(R.fwd);
  await page.keyboard.press(" ");
  assert.equal(await page.textContent(R.play), "Pause");
  await page.keyboard.press(" ");
  assert.equal(await page.textContent(R.play), "Play");
  const pos = await readerIndex(page);
  assert.ok(pos.index < 11, `Space must not also click the focused "10 →" button (index ${pos.index})`);
  await page.keyboard.press("Escape");
  await page.close();
});

test("typing in a page input does not trigger shortcuts; Esc still closes", async () => {
  const page = await fixture("synthetic-scc-decision.html");
  await openReader(page);
  await pauseReader(page);
  const before = await readerIndex(page);
  await page.evaluate(() => document.querySelector("input[name=q]").focus());
  await page.keyboard.type("t s 7 abc");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.$eval("input[name=q]", (el) => el.value), "t s 7 abc");
  assert.deepEqual(await readerIndex(page), before);
  assert.equal(await page.textContent(R.play), "Play");
  await page.keyboard.press("Escape");
  assert.equal(await page.$(R.host), null);
  await page.close();
});

test("close cleans up fully: DOM, styles, scroll lock, listeners, focus", async () => {
  const page = await fixture("synthetic-scc-decision.html");
  await page.evaluate(() => {
    const a = document.querySelector(".skip-link");
    a.setAttribute("tabindex", "0");
    a.focus();
  });
  const htmlStyle0 = await page.evaluate(() => document.documentElement.getAttribute("style"));
  const styles0 = await page.evaluate(() => document.querySelectorAll("style, link[rel=stylesheet]").length);
  const listeners0 = await listenerSnapshot(page);
  await openReader(page);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), "hidden");
  const listenersOpen = await listenerSnapshot(page);
  assert.ok(total(listenersOpen) === 2 && total(listeners0) === 0, `reader adds key listeners while open ${JSON.stringify(listenersOpen)}`);
  // Focus moved into the dialog.
  assert.equal(await page.evaluate(() => document.getElementById("docket-speed-host").shadowRoot.activeElement.textContent), "Pause");
  // Tab stays inside the dialog.
  for (let i = 0; i < 15; i++) await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.id), "docket-speed-host");
  await page.keyboard.press("Escape");

  assert.equal(await page.$(R.host), null);
  assert.equal(await page.$("#docket-speed-toast"), null);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute("style")), htmlStyle0);
  assert.equal(await page.evaluate(() => document.querySelectorAll("style, link[rel=stylesheet]").length), styles0);
  assert.equal(await page.evaluate(() => document.documentElement.className), "");
  const listenersAfter = await listenerSnapshot(page);
  console.log("# listeners before/open/after", JSON.stringify({ listeners0, listenersOpen, listenersAfter }));
  assert.equal(total(listenersAfter), 0, "all reader listeners removed");
  assert.equal(listenersAfter["main document"], listeners0["main document"], "page's own listeners untouched");
  assert.equal(await page.evaluate(() => document.activeElement.className), "skip-link", "focus restored");
  // Keys reach the page again and nothing reopens.
  await page.evaluate(() => (window.__pageKeys = []));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("t");
  assert.deepEqual(await page.evaluate(() => window.__pageKeys), ["ArrowDown", "t"]);
  assert.equal(await page.$(R.host), null);
  await page.close();
});

test("settings persist across reloads (reader and popup)", async () => {
  await swCall(() => chrome.storage.sync.clear());
  const page = await fixture("synthetic-scc-decision.html");
  await openReader(page);
  await pauseReader(page);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp"); // 440
  await page.keyboard.press("+"); // 50
  await page.keyboard.press("t"); // dark (light is the default)
  await page.keyboard.press("Escape"); // flushes debounced save
  await page.waitForTimeout(300);
  const stored = await swCall(() => chrome.storage.sync.get(null));
  assert.deepEqual(stored, { wpm: 440, fontSize: 50, theme: "ink" });

  await page.reload();
  await openReader(page);
  assert.equal(await page.textContent(R.wpmVal), "440");
  assert.equal(await page.$eval(R.word, (el) => el.style.fontSize), "50px");
  assert.equal(await page.$eval(R.root, (el) => el.classList.contains("dark")), true);
  await page.keyboard.press("Escape");

  // Popup shows and edits the same settings.
  const popup = await openPopup(env, page);
  await popup.waitForFunction(() => document.getElementById("p-wpm-val").textContent === "440");
  assert.equal(await popup.inputValue("#p-theme"), "ink");
  assert.equal(await popup.inputValue("#p-font"), "50");
  await popup.selectOption("#p-theme", "paper");
  await popup.$eval("#p-font", (el) => {
    el.value = "60";
    el.dispatchEvent(new Event("input"));
  });
  await popup.uncheck("#p-pause");
  await popup.waitForTimeout(500);
  await popup.close();
  const stored2 = await swCall(() => chrome.storage.sync.get(null));
  assert.deepEqual(stored2, { wpm: 440, fontSize: 60, theme: "paper", pauseOnPunctuation: false });
  await swCall(() => chrome.storage.sync.clear());
  await page.close();
});

test("reading position is remembered for the session (numbers only)", async () => {
  await swCall(() => chrome.storage.session.clear());
  const page = await fixture("synthetic-scc-decision.html");
  await openReader(page);
  await pauseReader(page);
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown"); // paragraph 4
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  const session = await swCall(() => chrome.storage.session.get(null));
  const values = Object.values(session);
  assert.equal(values.length, 1);
  assert.deepEqual(Object.keys(values[0]).sort(), ["i", "n"]);
  assert.ok(!JSON.stringify(session).includes("canlii"), "no URL stored");
  assert.ok(!/[a-z]{4,}/i.test(JSON.stringify(values)), "no text stored");
  await page.reload();
  await openReader(page);
  await pauseReader(page);
  assert.equal(await page.textContent(R.para), "¶ 4");
  await page.keyboard.press("Escape");
  await swCall(() => chrome.storage.session.clear());
  await page.close();
});

test("styles are isolated from the page", async () => {
  const page = await fixture("synthetic-scc-decision.html");
  await openReader(page);
  const s = await page.$eval(R.play, (el) => {
    const cs = getComputedStyle(el);
    return { tt: cs.textTransform, fs: cs.fontSize, m: cs.marginTop, ls: cs.letterSpacing };
  });
  assert.deepEqual(s, { tt: "none", fs: "12px", m: "0px", ls: "normal" });
  // The page's own buttons keep their styling.
  assert.equal(await page.$eval("button", (el) => getComputedStyle(el).textTransform), "uppercase");
  await page.keyboard.press("Escape");
  await page.close();
});

test("reduced motion: reader opens paused", async () => {
  await swCall(() => chrome.storage.session.clear());
  const page = await fixture("synthetic-scc-decision.html", { reducedMotion: true });
  await openReader(page);
  assert.equal(await page.textContent(R.play), "Play");
  await page.waitForTimeout(300);
  assert.equal((await readerIndex(page)).index, 1);
  assert.equal(await page.$eval("#docket-speed-host .backdrop", (el) => getComputedStyle(el).animationName), "none");
  await page.keyboard.press("Escape");
  await page.close();
});

test("narrow viewport (same CSS width as 200% zoom on 1280x800) has no clipped controls", async () => {
  const page = await fixture("synthetic-scc-decision.html", { viewport: { width: 640, height: 400 } });
  await openReader(page);
  await pauseReader(page);
  const m = await page.evaluate(() => {
    const sr = document.getElementById("docket-speed-host").shadowRoot;
    const panel = sr.querySelector(".panel");
    const r = panel.getBoundingClientRect();
    const outside = Array.from(sr.querySelectorAll("button, input")).filter((el) => {
      const b = el.getBoundingClientRect();
      return b.right > r.right + 1 || b.left < r.left - 1;
    }).length;
    return { panelW: r.width, vw: innerWidth, overflowX: panel.scrollWidth > panel.clientWidth, outside };
  });
  assert.ok(m.panelW <= m.vw, JSON.stringify(m));
  assert.equal(m.overflowX, false, JSON.stringify(m));
  assert.equal(m.outside, 0, JSON.stringify(m));
  await page.keyboard.press("Escape");
  await page.close();
});

test("100k-word judgment: extraction and start-up timing", async () => {
  const page = await fixture("synthetic-long-judgment.html");
  const tab = await tabFor(page);
  const t0 = Date.now();
  const res = await swCall((t) => startReading(t, "page"), tab);
  const wall = Date.now() - t0;
  assert.equal(res.ok, true);
  assert.ok(res.words >= 100000, `${res.words} words`);
  await page.waitForSelector(R.word);
  await pauseReader(page);
  await page.keyboard.press("End");
  assert.equal((await page.textContent(R.word)).trim(), "words.");
  // The page stays responsive: a timer scheduled now fires promptly.
  const lag = await page.evaluate(() => new Promise((r) => { const s = performance.now(); setTimeout(() => r(performance.now() - s), 0); }));
  metrics.longJudgment = { words: res.words, paragraphs: res.paragraphs, ...res.timings, wallClockFromWorkerMs: wall, timerLagAfterOpenMs: Math.round(lag) };
  console.log("# long judgment metrics", JSON.stringify(metrics.longJudgment));
  assert.ok(res.timings.totalMs < 3000, JSON.stringify(res.timings));
  await page.keyboard.press("Escape");
  await page.close();
});

// Real CanLII pages saved by Faiq (HTML only, so the saved CanLII scripts and
// assets 404 and nothing from the live site runs).
const REAL = [
  ["real/real-scc-vavilov.html", "The", "Ottawa."],
  ["real/real-cookie-banner-vavilov.html", "The", "Ottawa."],
  ["real/real-csc-vavilov-fr.html", "Le", "Ottawa."],
  ["real/real-onca-jones-v-tsige.html", "SHARPE", "legislation"],
  ["real/real-statute-rta-2006.html", "Residential", "s. 263."]
];
const REAL_PRESENT = REAL.every(([name]) => existsSync(join(ROOT, "tests", "fixtures", name)));
test("real CanLII pages: reader opens on the right text, first and last word", { skip: !REAL_PRESENT && "real fixtures not present (kept out of git)" }, async () => {
  metrics.real = {};
  for (const [name, first, last] of REAL) {
    const page = await fixture(name);
    const tab = await tabFor(page);
    const res = await swCall((t) => startReading(t, "page"), tab);
    assert.equal(res.ok, true, `${name}: ${JSON.stringify(res)}`);
    await page.waitForSelector(R.word);
    await pauseReader(page);
    await page.keyboard.press("Home");
    assert.equal((await page.textContent(R.word)).trim(), first, name);
    await page.keyboard.press("End");
    assert.equal((await page.textContent(R.word)).trim(), last, name);
    metrics.real[name] = { method: res.method, words: res.words, paragraphs: res.paragraphs, ...res.timings };
    await page.keyboard.press("Escape");
    assert.equal(await page.$(R.host), null);
    await page.close();
  }
  console.log("# real page metrics", JSON.stringify(metrics.real));
});

test("no console errors in pages or the service worker; no request left the fixture routes", async () => {
  // Saved real pages run their own inline CanLII scripts, whose libraries the
  // harness deliberately does not serve; errors from those pages are CanLII's
  // scripts failing, not the extension, and are filtered out here.
  const errs = env.errors.filter((e) => !/@ https:\/\/www\.canlii\.org\/en\/test\/real\//.test(e));
  assert.deepEqual(errs, []);
  // Every canlii.org request was answered locally by the route (fixtures, or a
  // 404 for assets the saved pages ask for); the resolver rules make any
  // escape impossible. Anything else was aborted.
  for (const u of env.requests) assert.match(u, /^https:\/\/(www\.)?canlii\.org\//);
  const fixturesServed = env.requests.filter((u) => /\/(en|fr)\/test\//.test(u)).length;
  console.log(`# canlii.org requests answered locally: ${env.requests.length} (${fixturesServed} under the fixture path); other hosts aborted: ${env.blocked.length}`);
});
