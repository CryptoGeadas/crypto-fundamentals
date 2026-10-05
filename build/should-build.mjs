// Gate for the daily workflow (issue #33): the 06:17 UTC schedule and manual runs always build; the
// 14:17 UTC catch-up builds only when today's data hasn't been built successfully yet (GitHub delays
// or drops scheduled runs at busy times). "Built" = the token list was published today.
//
// Run (in CI): EVENT=schedule SCHEDULE="17 14 * * *" node build/should-build.mjs   → prints build=true|false

import { readFile } from "node:fs/promises";

export const CATCH_UP = "17 14 * * *";

export function shouldBuild({ event, schedule, status, now = new Date() }) {
  if (event !== "schedule" || schedule !== CATCH_UP) return true;
  const last = status?.datasets?.universe?.lastSuccess;
  return !(last && last.slice(0, 10) === now.toISOString().slice(0, 10));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("should-build.mjs")) {
  let status = null;
  try { status = JSON.parse(await readFile(new URL("../site/data/status.json", import.meta.url), "utf8")); } catch { /* no status yet: build */ }
  const build = shouldBuild({ event: process.env.EVENT, schedule: process.env.SCHEDULE, status });
  console.log(`build=${build}`);
}
