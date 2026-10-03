// Daily step 2: unlock schedules, read from DefiLlama's public unlock pages.
//   site/data/unlocks.json        current supply and next event for every tracked universe token
//   site/data/unlocks/<id>.json   full monthly schedule by category (refreshed about weekly)

import { readdir } from "node:fs/promises";
import { nextData, summariseOverview, summariseDetail, detailsToRefresh } from "./unlocks-lib.mjs";
import { sleep } from "./net.mjs";

const SITE = "https://defillama.com/unlocks";
const MIN_TRACKED = 150;        // tracked universe tokens today: ~223
const CANARY = "arbitrum";      // a schedule that must always be present (decision log, issue #5)

export async function unlocksStep({ report, net, data }) {
  const universe = await data.read("universe.json");
  if (!universe) { report.error("unlocks", "No token list available; unlock data kept."); report.datasets.unlocks = { status: "kept" }; return; }
  const ids = new Set(universe.tokens.map((t) => t.id));
  const prev = await data.read("unlocks.json");

  console.log("DefiLlama unlocks overview ...");
  let summary;
  try {
    const pp = nextData(await net.getPage(SITE, "defillama-unlocks"));
    if (!pp?.data?.length) throw new Error("overview page has no unlock data");
    summary = summariseOverview(pp.data, ids);
  } catch (e) {
    report.error("defillama-unlocks", `${e.message}; unlock data kept from the last good run.`);
    report.datasets.unlocks = { status: "kept" };
    return;
  }

  // Canary: ARB's schedule must be there, or the page format has changed under us.
  if (!summary[CANARY]?.slug || !(summary[CANARY].max > 0)) {
    report.error("unlocks", `Canary failed: ${CANARY}'s unlock schedule is missing from the overview; the page format may have changed. Unlock data kept.`);
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
      const d = summariseDetail(nextData(await net.getPage(`${SITE}/${summary[id].slug}`, "defillama-unlocks")));
      if (!d) throw new Error("no documented schedule on the page");
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
    await sleep(1500);
  }
  for (const [id, s] of Object.entries(summary)) s.detail = Boolean(stored[id] && !stored[id].missing);

  await data.publish("unlocks", "unlocks.json",
    { generated: new Date().toISOString(), source: SITE, count: Object.keys(summary).length, tokens: summary },
    Object.keys(summary).length, prev?.count, MIN_TRACKED);
  console.log(`Unlocks: ${Object.keys(summary).length} tracked tokens; schedules refreshed ${fetched}, failed ${failed}.`);
}
