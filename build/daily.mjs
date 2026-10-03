// The daily job (run by .github/workflows/refresh.yml at 06:00 UTC).
// Runs each data step with one shared run report, publishes only data that passes its sanity
// checks (previous good files are kept otherwise), and always writes site/data/status.json,
// which the page footer and the alert step read. Keyless public sources only.
//
// Run: node build/daily.mjs            (a few minutes; CoinGecko calls are paced)
// Test the alert flow: SIMULATE_PROBLEM=1 node build/daily.mjs
// Run one step only:   ONLY=defi node build/daily.mjs

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { Report, sanityCheck } from "./report.mjs";
import { createNet } from "./net.mjs";
import { universeStep } from "./step-universe.mjs";
import { unlocksStep } from "./step-unlocks.mjs";
import { defiStep } from "./step-defi.mjs";

const DATA = new URL("../site/data/", import.meta.url);
const report = new Report();
const net = createNet(report);

const data = {
  dir: (sub) => new URL(sub.endsWith("/") ? sub : sub + "/", DATA),
  async read(name) { try { return JSON.parse(await readFile(new URL(name, DATA), "utf8")); } catch { return null; } },
  async write(name, payload) {
    const url = new URL(name, DATA);
    await mkdir(new URL(".", url), { recursive: true });
    await writeFile(url, JSON.stringify(payload));
  },
  // Writes a dataset only if it passes its sanity check against the last good version.
  async publish(name, file, payload, count, previousCount, minCount) {
    const problem = sanityCheck(name, count, previousCount, minCount);
    if (problem) {
      report.error(name, problem);
      report.datasets[name] = { status: "kept", count: previousCount ?? null };
      return false;
    }
    await this.write(file, payload);
    report.datasets[name] = { status: "updated", count, lastSuccess: payload.generated };
    return true;
  },
};

const STEPS = [["universe", universeStep], ["unlocks", unlocksStep], ["defi", defiStep]];

async function main() {
  await mkdir(DATA, { recursive: true });
  const prevStatus = (await data.read("status.json")) || {};
  if (process.env.SIMULATE_PROBLEM === "1") report.warn("test", "Simulated problem from a manual test run; no data was affected.");
  let crashed = false;
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null; // e.g. ONLY=defi for a one-off backfill
  for (const [name, step] of STEPS.filter(([n]) => !only || only.includes(n))) {
    try { await step({ report, net, data }); }
    catch (e) { crashed = true; console.error(e); report.error("build", `Step "${name}" crashed: ${e.message}. Its previous data was kept.`); }
  }
  const status = report.status(prevStatus);
  await writeFile(new URL("status.json", DATA), JSON.stringify(status, null, 2));
  console.log(`Status: ${status.healthy ? "healthy" : `${status.problems.length} problem(s)`}.`);
  for (const p of status.problems) console.log(`  ${p.level.toUpperCase()} ${p.source}: ${p.message}`);
  if (crashed) process.exit(1);
}

main();
