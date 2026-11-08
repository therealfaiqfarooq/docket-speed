// Runs the e2e suite with node:test. Uses Chromium's new headless mode, which
// supports extensions; set HEADED=1 (with xvfb-run on a server) for headed.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", join(here, "e2e.test.mjs")], { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
