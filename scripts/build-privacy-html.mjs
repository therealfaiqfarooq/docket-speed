// Builds privacy-policy.html (standalone, no external assets) from
// privacy-policy.md so the two never drift. Handles the small Markdown
// subset the policy uses: #/## headings, paragraphs, "- " lists, **bold**,
// `code` and [links](url).
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const md = readFileSync(join(root, "privacy-policy.md"), "utf8");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(((?:https|mailto):[^)]+)\)/g, '<a href="$2">$1</a>');

const out = [];
let para = [];
let list = null;
const flushPara = () => {
  if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
  para = [];
};
const flushList = () => {
  if (list) out.push(`<ul>\n${list.map((li) => `  <li>${inline(li)}</li>`).join("\n")}\n</ul>`);
  list = null;
};
let title = "Privacy policy";
for (const raw of md.split("\n")) {
  const line = raw.trimEnd();
  if (/^# /.test(line)) { flushPara(); flushList(); title = line.slice(2); out.push(`<h1>${inline(title)}</h1>`); continue; }
  if (/^## /.test(line)) { flushPara(); flushList(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
  if (/^- /.test(line)) { flushPara(); (list ||= []).push(line.slice(2)); continue; }
  if (!line.trim()) { flushPara(); flushList(); continue; }
  if (list) { list[list.length - 1] += " " + line.trim(); continue; }
  // Lines ending in two spaces are hard breaks in the header block.
  para.push(line.trim() + (/\s{2}$/.test(raw) ? "<br>" : ""));
}
flushPara();
flushList();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; --fg: #1f2328; --muted: #4a5160; --bg: #fbfaf7; --accent: #7a2331; --code: #efebe2; }
  @media (prefers-color-scheme: dark) { :root { --fg: #f1ede4; --muted: #c9c4b8; --bg: #161b22; --accent: #e0707f; --code: #232b36; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.6 Georgia, "Times New Roman", serif; }
  main { max-width: 720px; margin: 0 auto; padding: 40px 20px 64px; }
  h1 { font-size: 1.9em; line-height: 1.2; margin: 0 0 0.6em; }
  h2 { font-size: 1.25em; margin: 1.8em 0 0.4em; color: var(--accent); }
  code { background: var(--code); padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.88em; }
  a { color: var(--accent); }
  ul { padding-left: 1.3em; }
  li { margin: 0.3em 0; }
</style>
</head>
<body>
<main>
${out.join("\n").replace(/<br>\s*<\/p>/g, "</p>").replace(/<br> /g, "<br>\n")}
</main>
</body>
</html>
`;
writeFileSync(join(root, "privacy-policy.html"), html);
console.log("wrote privacy-policy.html");
