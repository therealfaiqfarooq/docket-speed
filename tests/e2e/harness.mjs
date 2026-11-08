// Shared Playwright harness: loads the unpacked extension into Chromium and
// serves fixtures under https://www.canlii.org/ URLs WITHOUT touching the
// network. Every request to canlii.org is answered by context.route() from a
// local static server, and --host-resolver-rules makes any request that
// somehow escapes routing fail to resolve, so canlii.org is never contacted.

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// Uses the workspace's pre-installed Playwright (resolved like require()).
const { chromium } = createRequire(import.meta.url)("playwright");
const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..", "..");
export const FIXTURES = join(ROOT, "tests", "fixtures");
export const FIXTURE_BASE = "https://www.canlii.org/en/test/";

const TYPES = { ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".json": "application/json" };

export function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = normalize(join(FIXTURES, urlPath));
      if (!file.startsWith(FIXTURES) || !existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

// Copies the extension and adds host_permissions for canlii.org. This stands in
// for the activeTab grant that a real toolbar click or context-menu click gives;
// automation cannot click Chrome's toolbar. Nothing else is changed.
export function buildTestExtension(srcDir) {
  const out = mkdtempSync(join(tmpdir(), "ds-ext-"));
  cpSync(srcDir, out, { recursive: true });
  const mfPath = join(out, "manifest.json");
  const mf = JSON.parse(readFileSync(mfPath, "utf8"));
  mf.host_permissions = ["https://www.canlii.org/*", "https://canlii.org/*"];
  writeFileSync(mfPath, JSON.stringify(mf, null, 2));
  return out;
}

export async function launch({ extDir = join(ROOT, "extension"), viewport = { width: 1280, height: 800 }, deviceScaleFactor = 1, colorScheme, reducedMotion } = {}) {
  const { server, port } = await startServer();
  const testExt = buildTestExtension(extDir);
  const profile = mkdtempSync(join(tmpdir(), "ds-profile-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", // new headless mode; supports extensions
    headless: process.env.HEADED ? false : true,
    viewport,
    deviceScaleFactor,
    colorScheme,
    reducedMotion,
    args: [
      `--disable-extensions-except=${testExt}`,
      `--load-extension=${testExt}`,
      "--host-resolver-rules=MAP canlii.org ~NOTFOUND, MAP *.canlii.org ~NOTFOUND",
      "--no-first-run",
      "--no-default-browser-check"
    ]
  });

  const requests = [];
  const serve = async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    const name = url.pathname.replace(/^\/(en|fr)\/test\//, "/");
    const resp = await route.fetch({ url: `http://127.0.0.1:${port}${name}` }).catch(() => null);
    if (!resp) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ response: resp });
  };
  // Saved real pages reference analytics and CDN URLs; block anything that is
  // not the local server or a routed canlii.org fixture. (Routes registered
  // later take precedence, so this catch-all goes first.)
  const blocked = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  await context.route("https://www.canlii.org/**", serve);
  await context.route("https://canlii.org/**", serve);

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  const extensionId = new URL(sw.url()).host;

  const errors = [];
  sw.on("console", (m) => {
    if (m.type() === "error") errors.push(`[sw] ${m.text()}`);
  });

  async function close() {
    await context.close();
    server.close();
    rmSync(profile, { recursive: true, force: true });
    rmSync(testExt, { recursive: true, force: true });
  }

  return { context, sw, extensionId, port, requests, blocked, errors, close };
}

export function watchPage(page, errors) {
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message} @ ${page.url()}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[console] ${m.text()} @ ${page.url()}`);
  });
  return page;
}

// Opens the popup as a tab, brings the CanLII page to the front (so it is the
// active tab the popup queries), and clicks a popup control.
export async function openPopup(env, page) {
  const popup = await env.context.newPage();
  watchPage(popup, env.errors);
  await popup.goto(`chrome-extension://${env.extensionId}/popup.html`);
  await page.bringToFront();
  return popup;
}

export async function clickReadWholePage(env, page) {
  const popup = await openPopup(env, page);
  const closed = popup.waitForEvent("close", { timeout: 15000 }).then(() => true).catch(() => false);
  await popup.click("#start-page");
  const ok = await Promise.race([
    closed,
    popup.waitForFunction(() => document.getElementById("p-status").textContent.trim().length > 0, null, { timeout: 15000 }).then(() => false)
  ]);
  const status = ok ? "" : await popup.textContent("#p-status");
  if (!popup.isClosed()) await popup.close();
  return { ok, status };
}

export const R = {
  host: "#docket-speed-host",
  word: "#docket-speed-host .word-row",
  play: "#docket-speed-host .btn.primary",
  position: "#docket-speed-host .num-pos",
  para: "#docket-speed-host .context .para",
  wpmVal: "#docket-speed-host .num",
  root: "#docket-speed-host .root",
  title: "#docket-speed-host .title",
  theme: "#docket-speed-host .theme-btn",
  fwd: "#docket-speed-host .controls .btn:nth-child(4)",
  toast: "#docket-speed-toast .toast"
};

export async function readerIndex(page) {
  const t = await page.textContent(R.position);
  const m = /(\d+) \/ (\d+)/.exec(t || "");
  return m ? { index: Number(m[1]), total: Number(m[2]) } : null;
}
