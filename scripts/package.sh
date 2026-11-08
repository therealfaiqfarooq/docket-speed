#!/usr/bin/env bash
# Builds dist/docket-speed-<version>.zip with manifest.json at the zip root,
# containing only the files the extension needs (everything in extension/,
# minus OS junk and source maps). Then verifies it: unzips into a clean
# folder, checks the file list, and runs the full e2e suite against it.
#   bash scripts/package.sh            build + verify
#   bash scripts/package.sh --no-verify
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p 'require("./extension/manifest.json").version')
OUT="dist/docket-speed-${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"
(cd extension && zip -q -X -r "../$OUT" . -x '*.DS_Store' -x '*.map' -x '__MACOSX/*' -x '.*')
echo "Built $OUT ($(wc -c < "$OUT") bytes)"
unzip -l "$OUT"

[[ "${1:-}" == "--no-verify" ]] && exit 0

CHECK=$(mktemp -d)
unzip -q "$OUT" -d "$CHECK"
test -f "$CHECK/manifest.json" || { echo "manifest.json not at zip root"; exit 1; }
node -e '
  const fs = require("fs"), path = require("path");
  const dir = process.argv[1];
  const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const want = ["background.js", "engine.js", "extract.js", "reader-styles.js", "reader.js", "popup.html", "popup.js", "popup.css",
    "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png"];
  for (const f of want) if (!fs.existsSync(path.join(dir, f))) throw new Error("missing " + f);
  const all = []; (function walk(d, p = "") { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = p + e.name; e.isDirectory() ? walk(path.join(d, e.name), r + "/") : all.push(r); } })(dir);
  const extra = all.filter((f) => f !== "manifest.json" && !want.includes(f));
  if (extra.length) throw new Error("unexpected files in zip: " + extra.join(", "));
  if (m.manifest_version !== 3 || m.version !== "1.0.0") throw new Error("manifest version");
  if (m.host_permissions || m.content_scripts) throw new Error("zip must not carry host_permissions/content_scripts");
  for (const f of all.filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    if (/\beval\s*\(|new Function\s*\(|https?:\/\/(?!developer\.chrome)/.test(src.replace(/\/\/.*$/gm, ""))) throw new Error("remote code / eval pattern in " + f);
  }
  console.log("zip contents OK:", all.length, "files");
' "$CHECK"
for f in "$CHECK"/*.js; do node --check "$f"; done
EXT_DIR="$CHECK" SMOKE=1 node tests/e2e/run-e2e.mjs
rm -rf "$CHECK"
echo "Package verified: $OUT"
