// Runs every build/check-*.mjs suite in turn (works the same on Windows and Linux).
// Run: node build/run-checks.mjs   (exit code 1 if any suite fails)

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
let failed = 0;
for (const f of readdirSync(dir).filter((f) => /^check-.*\.mjs$/.test(f)).sort()) {
  const r = spawnSync(process.execPath, [dir + f], { encoding: "utf8" });
  const summary = (r.stdout.trim().split("\n").pop() || "").trim();
  console.log(`${r.status === 0 ? "ok  " : "FAIL"}  ${f.padEnd(22)} ${summary}`);
  if (r.status !== 0) { failed++; process.stdout.write(r.stdout + r.stderr); }
}
process.exit(failed ? 1 : 0);
