// Captures Chrome Web Store screenshots (exactly 1280x800) and promo images of
// the real extension running on SYNTHETIC fixture pages (fictional parties).
// No browser chrome is drawn. Run: npm run screenshots
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { launch, watchPage, clickReadWholePage, R, FIXTURE_BASE, ROOT } from "../tests/e2e/harness.mjs";

const OUT = join(ROOT, "store", "screenshots");
const PROMO = join(ROOT, "store", "promo");
mkdirSync(OUT, { recursive: true });
mkdirSync(PROMO, { recursive: true });

const env = await launch({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const sw = env.sw;

async function setSettings(s) {
  await sw.evaluate(async (v) => {
    await chrome.storage.sync.clear();
    await chrome.storage.session.clear();
    await chrome.storage.sync.set(v);
  }, s);
}

// Play until the reader shows `word`, then pause on it.
async function stopOn(page, word) {
  await page.waitForFunction(
    (w) => document.getElementById("docket-speed-host").shadowRoot.querySelector(".word-row").textContent === w,
    word,
    { polling: 10, timeout: 60000 }
  );
  await page.keyboard.press(" ");
  const shown = await page.textContent(R.word);
  if (shown !== word) throw new Error(`wanted to stop on ${word}, got ${shown}`);
}

async function readerShot(fixture, settings, para, word, file) {
  await setSettings(settings);
  const page = watchPage(await env.context.newPage(), env.errors);
  await page.goto(FIXTURE_BASE + fixture);
  const r = await clickReadWholePage(env, page);
  if (!r.ok) throw new Error(r.status);
  await page.waitForSelector(R.word);
  await page.keyboard.press(" "); // pause
  await page.fill("#docket-speed-host input[type=number]", String(para));
  await page.press("#docket-speed-host input[type=number]", "Enter");
  await page.keyboard.press(" "); // play
  await stopOn(page, word);
  // Leave focus off the controls so no focus ring shows; let the fade finish.
  await page.evaluate(() => document.getElementById("docket-speed-host").shadowRoot.activeElement?.blur());
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, file) });
  await page.keyboard.press("Escape");
  await page.close();
}

await readerShot("synthetic-scc-decision.html", { wpm: 400, theme: "paper", fontSize: 54 }, 5, "reasonableness.", "1-reader-light.png");
await readerShot("synthetic-french-decision.html", { wpm: 400, theme: "ink", fontSize: 56 }, 4, "prépondérance", "3-reader-dark-french.png");
await readerShot("synthetic-provincial-decision.html", { wpm: 400, theme: "paper", fontSize: 50 }, 6, "contributory", "4-reader-provincial.png");

// Popup over the page it acts on, placed where Chrome shows it (top right).
{
  await setSettings({ wpm: 400, theme: "paper", fontSize: 46 });
  const page = watchPage(await env.context.newPage(), env.errors);
  await page.goto(FIXTURE_BASE + "synthetic-scc-decision.html");
  await page.screenshot({ path: join(OUT, "_page.png") });
  const popup = watchPage(await env.context.newPage(), env.errors);
  await popup.setViewportSize({ width: 300, height: 600 });
  await popup.goto(`chrome-extension://${env.extensionId}/popup.html`);
  await popup.waitForFunction(() => document.getElementById("p-wpm-val").textContent === "400");
  const h = await popup.evaluate(() => document.body.getBoundingClientRect().height);
  await popup.screenshot({ path: join(OUT, "_popup.png"), clip: { x: 0, y: 0, width: 300, height: Math.ceil(h) } });
  await popup.close();
  await page.close();
  execFileSync("python3", [join(ROOT, "scripts", "compose_popup_shot.py"), join(OUT, "_page.png"), join(OUT, "_popup.png"), join(OUT, "2-popup.png")], { stdio: "inherit" });
  rmSync(join(OUT, "_page.png"));
  rmSync(join(OUT, "_popup.png"));
}

// Promo tiles rendered from HTML (original artwork, no third-party logos).
async function promo(w, h, file) {
  const page = await env.context.newPage();
  await page.setViewportSize({ width: w, height: h });
  const icon = "data:image/png;base64," + readFileSync(join(ROOT, "store", "icons", "artwork-512.png")).toString("base64");
  const scale = h / 280;
  await page.goto(`chrome-extension://${env.extensionId}/popup.html`);
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
    body{background:radial-gradient(120% 140% at 15% 10%,#ffffff 0%,#f3f6fa 55%,#e8eef6 100%);display:flex;align-items:center;justify-content:center;gap:${34 * scale}px;font-family:"Inter",system-ui,"Liberation Sans","DejaVu Sans",Arial,sans-serif;color:#0f172a}
    img{width:${132 * scale}px;height:${132 * scale}px;filter:drop-shadow(0 ${10 * scale}px ${22 * scale}px rgba(15,23,42,.14))}
    .tick{width:${2 * scale}px;height:${12 * scale}px;background:#e5484d;opacity:.6;margin-left:${44 * scale}px}
    .word{font-size:${52 * scale}px;font-weight:500;letter-spacing:-.02em;line-height:1.1;margin:${6 * scale}px 0}
    .word b{color:#e5484d;font-weight:600}
    .name{font-size:${17 * scale}px;font-weight:600;color:#475569;margin-top:${14 * scale}px;letter-spacing:.01em}
  </style></head><body>
    <img src="${icon}" alt="">
    <div><div class="tick"></div><div class="word">re<b>a</b>son</div><div class="tick"></div><div class="name">Docket Speed</div></div>
  </body></html>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(PROMO, file) });
  await page.close();
}
await promo(440, 280, "small-promo-440x280.png");
await promo(1400, 560, "marquee-1400x560.png");

if (env.errors.length) console.error(env.errors);
await env.close();
console.log("screenshots done; errors:", env.errors.length);
