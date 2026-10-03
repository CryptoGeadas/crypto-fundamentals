// Daily step 2: unlock schedules, from DefiLlama's public datasets host (the /emissions API is paid).
// defillama-datasets.llama.fi serves the data behind DefiLlama's free unlock pages as JSON, without
// the website's Cloudflare bot challenge (which blocks GitHub's runners even for curl).
//   site/data/unlocks.json        current supply and next event for every tracked universe token
//   site/data/unlocks/<id>.json   full monthly schedule by category (refreshed about weekly)

import { readdir } from "node:fs/promises";
import { summariseOverview, summariseDataset, detailsToRefresh } from "./unlocks-lib.mjs";
import { sleep } from "./net.mjs";

const DATASETS = "https://defillama-datasets.llama.fi";
const SOURCE_PAGE = "https://defillama.com/unlocks";
const MIN_TRACKED = 150;        // tracked universe tokens today: ~223
const CANARY = "arbitrum";      // a schedule that must always be present (issue #5)

export async function unlocksStep({ report, net, data }) {
  const universe = await data.read("universe.json");
  if (!universe) { report.error("unlocks", "No token list available; unlock data kept."); report.datasets.unlocks = { status: "kept" }; return; }
  const ids = new Set(universe.tokens.map((t) => t.id));
  const prev = await data.read("unlocks.json");

  console.log("DefiLlama unlocks index ...");
  let summary;
  try {
    const idx = await net.getJson(`${DATASETS}/emissionsIndex`, "defillama-unlocks");
    if (!idx?.data?.length) throw new Error("emissions index has no rows");
    summary = summariseOverview(idx.data, ids);
  } catch (e) {
    report.error("defillama-unlocks", `${e.message}; unlock data kept from the last good run.`);
    report.datasets.unlocks = { status: "kept" };
    return;
  }

  // Canary: ARB's schedule must be there, or the data format has changed under us.
  if (!summary[CANARY]?.slug || !(summary[CANARY].max > 0)) {
    report.error("unlocks", `Canary failed: ${CANARY}'s unlock schedule is missing from the index; the format may have changed. Unlock data kept.`);
    report.datasets.unlocks = { status: "kept" };
    return;
  }

  // Per-token schedules: refresh the oldest ~weekly, politely capped per run.
  const stored = {};
  for (const f of await readdir(data.dir("unlocks")).catch(() => [])) {
    if (f.endsWith(".json")) stored[f.slice(0, -5)] = await data.read(`unlocks/${f}`);
  }
  const cap = Number(process.env.UNLOCK_DETAIL_CAP) || undefined; // one-off backfill only
  const due = detailsToRefresh(summary, stored, Date.now() / 1000, cap);
  console.log(`Unlock schedules to refresh: ${due.length} of ${Object.values(summary).filter((s) => s.locked > 0).length}`);
  let fetched = 0, failed = 0;
  for (const id of due) {
    try {
      const d = summariseDataset(await net.getJson(`${DATASETS}/emissions/${encodeURIComponent(summary[id].slug)}`, "defillama-unlocks", { tries: 2 }));
      if (!d) throw new Error("no documented schedule");
      await data.write(`unlocks/${id}.json`, { id, slug: summary[id].slug, ...d });
      stored[id] = d;
      fetched++;
    } catch (e) {
      failed++;
      report.warn("defillama-unlocks", `Schedule for ${id} not refreshed (${e.message}); previous copy kept if any. Retried in a week.`);
      // Remember the failure so the rotation waits a week instead of retrying (and alerting) daily.
      if (!stored[id] || stored[id].missing) {
        const stub = { id, slug: summary[id].slug, missing: true, reason: e.message, generatedAt: new Date().toISOString() };
        await data.write(`unlocks/${id}.json`, stub);
        stored[id] = stub;
      }
    }
    await sleep(500);
  }
  for (const [id, s] of Object.entries(summary)) s.detail = Boolean(stored[id] && !stored[id].missing);

  await data.publish("unlocks", "unlocks.json",
    { generated: new Date().toISOString(), source: SOURCE_PAGE, count: Object.keys(summary).length, tokens: summary },
    Object.keys(summary).length, prev?.count, MIN_TRACKED);
  console.log(`Unlocks: ${Object.keys(summary).length} tracked tokens; schedules refreshed ${fetched}, failed ${failed}.`);
}
