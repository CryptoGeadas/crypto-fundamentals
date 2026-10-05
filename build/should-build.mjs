// Gate for the daily workflow (issues #33, #35): GitHub delays or drops scheduled runs at busy times, so
// there are two daily slots (06:17 and 14:17 UTC). A scheduled run builds only if today's data hasn't
// been built yet, whichever slot it is (a morning run delayed past the catch-up must not build twice);
// manual runs always build. "Built" = the token list was published today. The workflow checks out the
// latest main before deciding, so a queued or late run sees what earlier runs committed.
//
// Run (in CI): EVENT=schedule node build/should-build.mjs   → prints build=true|false

import { readFile } from "node:fs/promises";

export function shouldBuild({ event, status, now = new Date() }) {
  if (event !== "schedule") return true;
  const last = status?.datasets?.universe?.lastSuccess;
  return !(last && last.slice(0, 10) === now.toISOString().slice(0, 10));
}

if (process.argv[1]?.endsWith("should-build.mjs")) {
  let status = null;
  try { status = JSON.parse(await readFile(new URL("../site/data/status.json", import.meta.url), "utf8")); } catch { /* no status yet: build */ }
  console.log(`build=${shouldBuild({ event: process.env.EVENT, status })}`);
}
