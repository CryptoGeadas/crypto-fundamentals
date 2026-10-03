// Deploy step: copy site/ to _site/ and stamp every local script/stylesheet reference with
// ?v=<version>, so a release always loads as one matching set. Without it, browsers that
// cached the previous release (GitHub Pages sends max-age=600) can mix an old app.js with
// new modules for up to ten minutes and break the page.
//
// Run: node build/stamp.mjs <version>   (the deploy workflow passes the commit SHA)

import { cp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const version = (process.argv[2] || "dev").slice(0, 12);
const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "site");
const out = join(root, "_site");

// import … from "./x.js" | export … from "./x.js"
export const stampJs = (code, v) => code.replace(/(\bfrom\s+["'])(\.{1,2}\/[^"'?]+\.js)(["'])/g, `$1$2?v=${v}$3`);
// src="app.js" | href="styles.css" (local files only)
export const stampHtml = (html, v) =>
  html.replace(/\b(src|href)="(?!https?:|\/\/|#|data:|mailto:)([^"?]+\.(?:js|css))"/g, `$1="$2?v=${v}"`);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function main() {
  await rm(out, { recursive: true, force: true });
  await cp(src, out, { recursive: true });
  let stamped = 0;
  for await (const file of walk(out)) {
    const ext = extname(file);
    if (ext !== ".js" && ext !== ".html") continue;
    const before = await readFile(file, "utf8");
    const after = ext === ".js" ? stampJs(before, version) : stampHtml(before, version);
    if (after !== before) { await writeFile(file, after); stamped++; }
  }
  console.log(`Stamped ${stamped} files with ?v=${version} into _site/`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
