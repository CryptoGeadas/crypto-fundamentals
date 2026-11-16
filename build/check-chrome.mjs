// The site's shared header and footer, and the links between tools, in this tool's pages (#74).
// They are plain HTML in each page; a sync script writes them and these checks fail on drift.
// Run: node build/check-chrome.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { syncChrome, loadChrome, pageText, PAGES, TOOL } from "./chrome/sync.mjs";
import { toolNav, applyToolNav, TOOLS } from "./chrome/tools.mjs";
import { SHARED, hashOf } from "./chrome/record.mjs";

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };

await check("the tool page and the methodology page carry the shared header, footer and tool links", async () => {
  assert.deepEqual(await syncChrome({ check: true }), [], "run: node build/chrome/sync.mjs");
  const { header } = await loadChrome();
  const nav = header.slice(header.indexOf('<nav class="site-nav"'), header.indexOf("</nav>")).replace(/\r\n/g, "\n");
  for (const { file } of PAGES) {
    const html = (await pageText(file)).replace(/\r\n/g, "\n");
    assert.ok(html.includes(nav.replace('<a href="/tools/">', '<a href="/tools/" aria-current="page">')), `${file}: the site nav, with Tools marked`);
    assert.ok(!html.includes('is-active">Tools'), `${file}: the current section is marked with aria-current only`);
  }
});
await check("each page keeps its own footer data line", async () => {
  for (const { file } of PAGES) assert.match(await pageText(file), /<span class="data-line">[\s\S]*?<\/span>\s*<span class="credit">/, file);
});
await check("the shared files are unchanged copies: a local edit fails here", async () => {
  const recorded = JSON.parse(await readFile(new URL("./chrome/shared.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(recorded).sort(), [...SHARED].sort());
  for (const f of SHARED) assert.equal(await hashOf(f), recorded[f], `${f} differs from the shared file: copy the shared version in, then run node build/chrome/record.mjs`);
});
await check("tool links: the tool's own page lists the other tools; its methodology page links back", () => {
  assert.ok(TOOLS.some((t) => t.id === TOOL));
  const own = toolNav("crypto-fundamentals");
  assert.ok(own.includes('<a href="/tools/">← All tools</a>'));
  assert.ok(own.includes('<a href="/defi-yield-scanner/">DeFi Yield Scanner →</a><a href="/tokenized-rwa-tracker/">Tokenized RWA Tracker →</a>'));
  assert.ok(!own.includes("/crypto-fundamentals/"), "a tool does not link to itself");
  assert.ok(toolNav("crypto-fundamentals", { back: true }).includes('<span><a href="./">Crypto Fundamentals →</a></span>'));
  assert.throws(() => toolNav("nope"), /unknown tool/);
  assert.throws(() => applyToolNav("<main></main>", "crypto-fundamentals"), /no tool links/);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
